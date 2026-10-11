-- =====================================================================
-- AquaLens — Supabase schema
-- Run this whole file once in: Supabase Dashboard → SQL Editor → New query.
-- Then run supabase/seed.sql to load the demo data.
--
-- NOTE: There is NO authentication yet. Row Level Security is enabled, but the
-- policies below let the public `anon` key read and write. Replace the policies
-- marked "TEMPORARY" with per-user rules when you add auth.
-- =====================================================================

-- ---------- Tables ----------

create table if not exists public.sites (
  id                   text primary key,
  name                 text not null,
  city                 text,
  latitude             double precision,
  longitude            double precision,
  waterbody_name       text,
  site_type            text,
  upstream_site_ids    text[] not null default '{}',
  downstream_site_ids  text[] not null default '{}',
  last_updated_at      timestamptz,
  data_availability    text,
  monitoring_priority  text check (monitoring_priority in ('high','medium','low','not_assessed')),
  priority_class       text,
  priority_score       double precision,
  has_sensor           boolean not null default false
);

-- Existing databases created before the AquaConnect import need this column added.
alter table public.sites add column if not exists city text;
-- Original 5-level AquaConnect priority class (Very high … Very low, Insufficient data).
alter table public.sites add column if not exists priority_class text;
alter table public.sites add column if not exists priority_score double precision;

create sequence if not exists public.observation_number_seq start 2042;

create table if not exists public.observations (
  id                   text primary key default ('OBS-' || nextval('public.observation_number_seq')::text),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  observed_at          timestamptz,
  latitude             double precision,
  longitude            double precision,
  site_id              text references public.sites(id) on delete set null,
  place_name           text,
  location_precision   text not null default 'unknown' check (location_precision in ('precise','approximate','unknown')),
  categories           text[] not null default '{}',
  description          text,
  status               text not null default 'submitted' check (status in (
                         'draft','submitted','analysis_pending','analysis_completed','awaiting_review',
                         'more_information_requested','under_review','verified','corrected','not_verified','withdrawn')),
  submitted_by         text,                                  -- anonymous browser id until auth exists
  seen_before          text check (seen_before in ('yes','no','unsure')),
  idempotency_key      text unique
);
create index if not exists observations_created_idx   on public.observations (created_at desc);
create index if not exists observations_site_idx      on public.observations (site_id);
create index if not exists observations_submitter_idx on public.observations (submitted_by);
create index if not exists observations_status_idx    on public.observations (status);

create table if not exists public.photos (
  id              text primary key,
  observation_id  text references public.observations(id) on delete cascade,
  filename        text not null,
  mime_type       text not null,
  size_bytes      bigint not null default 0,
  storage_path    text,                                       -- path inside the `observation-photos` bucket
  url             text not null,                              -- public URL (storage or external)
  uploaded_at     timestamptz not null default now(),
  width           integer,
  height          integer,
  quality_status  text check (quality_status in ('pending','accepted','warning','rejected','unavailable'))
);
create index if not exists photos_observation_idx on public.photos (observation_id);

create table if not exists public.ai_analyses (
  id              text primary key,
  observation_id  text unique references public.observations(id) on delete cascade,
  status          text not null check (status in ('pending','processing','completed','failed','unavailable')),
  model_name      text,
  model_version   text,
  analyzed_at     timestamptz,
  findings        jsonb not null default '[]'::jsonb,
  message         text
);

create table if not exists public.expert_reviews (
  id                    text primary key,
  observation_id        text not null unique references public.observations(id) on delete cascade,
  reviewer_id           text,
  status                text not null check (status in ('unassigned','assigned','in_progress','completed')),
  decision              text check (decision in ('confirmed','corrected','not_supported','more_information_required','duplicate','rejected')),
  corrected_categories  text[],
  public_note           text,
  internal_note         text,
  reason_code           text,
  reviewed_at           timestamptz
);

create table if not exists public.timeline_events (
  id              text primary key default gen_random_uuid()::text,
  observation_id  text not null references public.observations(id) on delete cascade,
  at              timestamptz not null default now(),
  type            text not null check (type in ('submitted','analysis_completed','analysis_failed','feedback_recorded','review_started','status_updated','information_requested')),
  label           text not null,
  detail          text
);
create index if not exists timeline_observation_idx on public.timeline_events (observation_id, at);

create table if not exists public.notifications (
  id              text primary key default gen_random_uuid()::text,
  user_id         text,                                       -- null = visible to everyone
  type            text not null check (type in ('submitted','info_requested','status_changed','review_completed','system')),
  title           text not null,
  body            text not null,
  created_at      timestamptz not null default now(),
  read            boolean not null default false,
  observation_id  text references public.observations(id) on delete set null
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.environmental_indicators (
  id           text primary key,
  site_id      text not null references public.sites(id) on delete cascade,
  name         text not null,
  value        double precision,
  unit         text,
  level        text,
  description  text,
  source       text,
  observed_at  timestamptz,
  issued_at    timestamptz,
  valid_from   timestamptz,
  valid_to     timestamptz,
  data_status  text not null check (data_status in ('available','stale','missing','error')),
  limitations  text[] not null default '{}',
  kind         text not null check (kind in ('observed','forecast'))
);
create index if not exists indicators_site_idx on public.environmental_indicators (site_id);

create table if not exists public.discharge_series (
  site_id   text not null references public.sites(id) on delete cascade,
  date      timestamptz not null,
  observed  double precision,
  forecast  double precision,
  primary key (site_id, date)
);

-- ---------- Keep updated_at fresh ----------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists observations_touch on public.observations;
create trigger observations_touch before update on public.observations
  for each row execute function public.touch_updated_at();

-- ---------- Atomic operations (called from the app with supabase.rpc) ----------

-- Create an observation with its photo row, AI analysis, timeline and notification in ONE transaction.
-- Safe to retry: the same idempotency_key always returns the same observation id.
create or replace function public.create_observation(p jsonb) returns text
language plpgsql set search_path = public as $$
declare
  v_id       text;
  v_key      text  := p->>'idempotency_key';
  v_user     text  := p->>'submitted_by';
  v_photo    jsonb := p->'photo';
  v_analysis jsonb := p->'analysis';
begin
  select id into v_id from observations where idempotency_key = v_key;
  if v_id is not null then return v_id; end if;

  insert into observations (
    observed_at, latitude, longitude, site_id, place_name, location_precision,
    categories, description, status, submitted_by, seen_before, idempotency_key
  ) values (
    nullif(p->>'observed_at','')::timestamptz,
    (p->>'latitude')::double precision,
    (p->>'longitude')::double precision,
    nullif(p->>'site_id',''),
    nullif(p->>'place_name',''),
    coalesce(nullif(p->>'location_precision',''), 'unknown'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'categories','[]'::jsonb))), '{}'),
    nullif(p->>'description',''),
    'awaiting_review',
    v_user,
    nullif(p->>'seen_before',''),
    v_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then  -- lost a race with a parallel retry
    select id into v_id from observations where idempotency_key = v_key;
    return v_id;
  end if;

  if v_photo is not null and jsonb_typeof(v_photo) = 'object' then
    insert into photos (id, observation_id, filename, mime_type, size_bytes, storage_path, url, quality_status)
    values (
      'P-' || v_id, v_id,
      v_photo->>'filename', v_photo->>'mime_type', coalesce((v_photo->>'size_bytes')::bigint, 0),
      v_photo->>'storage_path', v_photo->>'url', nullif(v_photo->>'quality_status','')
    );
  end if;

  if v_analysis is not null and jsonb_typeof(v_analysis) = 'object' then
    insert into ai_analyses (id, observation_id, status, model_name, model_version, analyzed_at, findings, message)
    values (
      'AI-' || v_id, v_id, v_analysis->>'status',
      v_analysis->>'model_name', v_analysis->>'model_version',
      nullif(v_analysis->>'analyzed_at','')::timestamptz,
      coalesce(v_analysis->'findings', '[]'::jsonb), v_analysis->>'message'
    );
  end if;

  insert into timeline_events (observation_id, at, type, label)
  values (v_id, clock_timestamp(), 'submitted', 'Observation submitted');

  if v_analysis is not null and jsonb_typeof(v_analysis) = 'object' then
    insert into timeline_events (observation_id, at, type, label)
    values (
      v_id, clock_timestamp(),
      case when v_analysis->>'status' = 'completed' then 'analysis_completed' else 'analysis_failed' end,
      case when v_analysis->>'status' = 'completed' then 'Image analysis completed' else 'Image analysis unavailable' end
    );
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_analysis->'findings','[]'::jsonb)) f
      where f->>'citizenAssessment' is not null
    ) then
      insert into timeline_events (observation_id, at, type, label)
      values (v_id, clock_timestamp(), 'feedback_recorded', 'Citizen feedback recorded');
    end if;
  end if;

  insert into notifications (user_id, type, title, body, observation_id)
  values (v_user, 'submitted', 'Observation submitted', v_id || ' was received and is awaiting review.', v_id);

  return v_id;
end $$;

-- Assign an observation to a reviewer.
create or replace function public.assign_review(p_observation_id text, p_reviewer_id text) returns text
language plpgsql set search_path = public as $$
declare v_review text := 'R-' || p_observation_id;
begin
  if not exists (select 1 from observations where id = p_observation_id) then
    raise exception 'observation not found' using errcode = 'P0002';
  end if;

  insert into expert_reviews (id, observation_id, reviewer_id, status)
  values (v_review, p_observation_id, p_reviewer_id, 'in_progress')
  on conflict (observation_id) do update set reviewer_id = excluded.reviewer_id, status = 'in_progress';

  update observations set status = 'under_review' where id = p_observation_id;
  insert into timeline_events (observation_id, at, type, label)
  values (p_observation_id, clock_timestamp(), 'review_started', 'Expert review started');
  return v_review;
end $$;

-- Save a review draft or record a final decision.
create or replace function public.decide_review(p jsonb) returns text
language plpgsql set search_path = public as $$
declare
  v_obs      text := p->>'observation_id';
  v_decision text := p->>'decision';
  v_draft    boolean := coalesce((p->>'draft')::boolean, false);
  v_review   text := 'R-' || (p->>'observation_id');
  v_submitter text;
  v_cats     text[];
  v_status   text;
  v_more     boolean := (v_decision = 'more_information_required');
begin
  select submitted_by into v_submitter from observations where id = v_obs for update;
  if not found then
    raise exception 'observation not found' using errcode = 'P0002';
  end if;

  v_cats := case when p->'corrected_categories' is null or jsonb_typeof(p->'corrected_categories') <> 'array' then null
                 else array(select jsonb_array_elements_text(p->'corrected_categories')) end;

  insert into expert_reviews (id, observation_id, reviewer_id, status, decision, corrected_categories, public_note, internal_note, reason_code)
  values (v_review, v_obs, p->>'reviewer_id', 'in_progress', v_decision, v_cats, p->>'public_note', p->>'internal_note', p->>'reason_code')
  on conflict (observation_id) do update set
    reviewer_id = excluded.reviewer_id, decision = excluded.decision,
    corrected_categories = excluded.corrected_categories, public_note = excluded.public_note,
    internal_note = excluded.internal_note, reason_code = excluded.reason_code;

  if v_draft then
    update expert_reviews set status = 'in_progress' where id = v_review;
    update observations set status = 'under_review' where id = v_obs;
    insert into timeline_events (observation_id, at, type, label)
    values (v_obs, clock_timestamp(), 'review_started', 'Review draft saved');
    return v_review;
  end if;

  v_status := case v_decision
    when 'confirmed' then 'verified'
    when 'corrected' then 'corrected'
    when 'more_information_required' then 'more_information_requested'
    else 'not_verified' end;

  update expert_reviews
     set status = case when v_more then 'in_progress' else 'completed' end,
         reviewed_at = now()
   where id = v_review;
  update observations set status = v_status where id = v_obs;

  if v_more then
    insert into timeline_events (observation_id, at, type, label, detail)
    values (v_obs, clock_timestamp(), 'information_requested', 'Additional information requested', p->>'public_note');
  else
    insert into timeline_events (observation_id, at, type, label, detail)
    values (v_obs, clock_timestamp(), 'status_updated', 'Verification status updated', p->>'public_note');
  end if;

  insert into notifications (user_id, type, title, body, observation_id)
  values (
    v_submitter,
    case when v_more then 'info_requested' else 'review_completed' end,
    case when v_more then 'More information requested' else 'Review completed' end,
    v_obs || ': ' || coalesce(nullif(p->>'public_note',''), 'Status updated.'),
    v_obs
  );
  return v_review;
end $$;

-- ---------- Row Level Security ----------
-- TEMPORARY: open to the public anon key because there is no authentication yet.
-- When you add auth, replace these with rules such as `using (submitted_by = auth.uid()::text)`.

alter table public.sites                    enable row level security;
alter table public.observations             enable row level security;
alter table public.photos                   enable row level security;
alter table public.ai_analyses              enable row level security;
alter table public.expert_reviews           enable row level security;
alter table public.timeline_events          enable row level security;
alter table public.notifications            enable row level security;
alter table public.environmental_indicators enable row level security;
alter table public.discharge_series         enable row level security;

do $$
declare t text;
begin
  -- read access everywhere
  foreach t in array array['sites','observations','photos','ai_analyses','expert_reviews','timeline_events','notifications','environmental_indicators','discharge_series'] loop
    execute format('drop policy if exists "temp public read" on public.%I', t);
    execute format('create policy "temp public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
  -- insert access for tables the app writes to
  foreach t in array array['observations','photos','ai_analyses','expert_reviews','timeline_events','notifications'] loop
    execute format('drop policy if exists "temp public insert" on public.%I', t);
    execute format('create policy "temp public insert" on public.%I for insert to anon, authenticated with check (true)', t);
  end loop;
  -- update access for tables the app edits
  foreach t in array array['observations','ai_analyses','expert_reviews','notifications'] loop
    execute format('drop policy if exists "temp public update" on public.%I', t);
    execute format('create policy "temp public update" on public.%I for update to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Photo storage ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('observation-photos', 'observation-photos', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "temp photos read"   on storage.objects;
drop policy if exists "temp photos upload" on storage.objects;
create policy "temp photos read"   on storage.objects for select to anon, authenticated using (bucket_id = 'observation-photos');
create policy "temp photos upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'observation-photos');
