-- AquaLens v3 (part 3): live sensors, readings, alert acknowledgements and measured site history.
-- Safe to run more than once. Run in the Supabase SQL editor AFTER schema.sql and migration-v2.sql.
--
-- Unlike the demo tables, these have row-level security ON and NO public policies. They are read and written only by
-- the Next.js server routes (src/app/api/sensors/*, /api/measurements/*) using SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- Never put the service_role key in a NEXT_PUBLIC_ variable.

create table if not exists public.sensors (
  id            text primary key,                     -- SNS-100, SNS-101 ...
  name          text not null,
  site_id       text references public.sites(id) on delete set null,
  parameters    text[] not null,
  status        text not null default 'active' check (status in ('active','maintenance','offline')),
  registered_at timestamptz not null default now(),
  registered_by text not null,
  feed          text not null default 'live' check (feed in ('live','simulated'))
);
create unique index if not exists sensors_name_lower_idx on public.sensors (lower(name));
create index if not exists sensors_site_idx on public.sensors (site_id);

create table if not exists public.sensor_readings (
  sensor_id text not null references public.sensors(id) on delete cascade,
  at        timestamptz not null,
  values    jsonb not null,                           -- { "ph": 7.4, "turbidity": 9.1 }
  primary key (sensor_id, at)
);
create index if not exists sensor_readings_at_idx on public.sensor_readings (at desc);

create table if not exists public.sensor_alert_acks (
  alert_id  text primary key,
  acked_by  text not null,
  acked_at  timestamptz not null default now()
);

-- Daily MEASURED values (gauge discharge in m3/s) loaded through /api/measurements/ingest.
create table if not exists public.site_measurements (
  site_id   text not null references public.sites(id) on delete cascade,
  date      date not null,
  parameter text not null check (parameter in ('discharge')),
  value     double precision not null,
  source    text not null,
  primary key (site_id, date, parameter)
);

alter table public.sensors            enable row level security;
alter table public.sensor_readings    enable row level security;
alter table public.sensor_alert_acks  enable row level security;
alter table public.site_measurements  enable row level security;
