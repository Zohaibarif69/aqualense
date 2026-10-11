-- AquaLens v2 (part 1): edit/withdraw, audit log, AI re-analysis history, duplicate links.
-- Safe to run more than once. Run in the Supabase SQL editor AFTER schema.sql.
-- NOTE: like the rest of the demo schema, these policies are open to the anon key because there is no
-- authentication yet. Replace them with per-user rules when auth is added.

alter table public.observations   add column if not exists edited_at    timestamptz;
alter table public.observations   add column if not exists withdrawn_at timestamptz;
alter table public.expert_reviews add column if not exists duplicate_of text references public.observations(id) on delete set null;

create table if not exists public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  observation_id text not null references public.observations(id) on delete cascade,
  at             timestamptz not null default now(),
  actor_id       text not null,
  actor_role     text not null,
  action         text not null,
  detail         text,
  changes        jsonb
);
create index if not exists audit_log_obs_idx on public.audit_log (observation_id, at desc);

create table if not exists public.ai_analysis_history (
  id             uuid primary key default gen_random_uuid(),
  observation_id text not null references public.observations(id) on delete cascade,
  version        int  not null,
  superseded_at  timestamptz not null default now(),
  status         text not null,
  model_name     text,
  model_version  text,
  analyzed_at    timestamptz,
  findings       jsonb not null default '[]',
  message        text
);
create index if not exists ai_history_obs_idx on public.ai_analysis_history (observation_id, version desc);

alter table public.audit_log           enable row level security;
alter table public.ai_analysis_history enable row level security;
do $$
declare t text;
begin
  foreach t in array array['audit_log','ai_analysis_history'] loop
    execute format('drop policy if exists "temp public read" on public.%I', t);
    execute format('create policy "temp public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "temp public insert" on public.%I', t);
    execute format('create policy "temp public insert" on public.%I for insert to anon, authenticated with check (true)', t);
  end loop;
end $$;
