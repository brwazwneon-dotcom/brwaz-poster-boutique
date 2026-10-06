-- Backup Center history + Live Visitors presence.
--
-- Strictly additive and idempotent: two NEW tables and their indexes.
-- No DROP / DELETE / UPDATE / ALTER of any existing table, and nothing here
-- touches orders, customers, posters or settings.
--
-- The application does not depend on this migration being applied: the live
-- ping and the admin screens swallow "relation does not exist" (42P01), so
-- the storefront keeps working and the admin screens say "migration not
-- applied" instead of failing.

-- ---------------------------------------------------------------------------
-- live_sessions: ONE row per anonymous visitor (upserted by a ~40s heartbeat).
-- A visitor is "online" while last_seen is inside the admin's activity window
-- (default 90s). Rows are short-lived: anything older than 1 hour is deleted
-- opportunistically (see src/lib/live-visitors.functions.ts), so the table
-- never grows beyond roughly the last hour of distinct visitors.
--
-- Privacy: no IP address, no coordinates, no user agent string, no form data.
-- Location is the platform's approximate network geolocation (country / region
-- / city) taken from request headers on the server.
-- ---------------------------------------------------------------------------
create table if not exists live_sessions (
  visitor_id    text primary key,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  path          text,
  title         text,
  country_code  text,
  country       text,
  region        text,
  city          text,
  device        text,
  browser       text,
  source        text,
  screen        text,
  host          text
);
create index if not exists idx_live_sessions_last_seen on live_sessions (last_seen desc);

-- ---------------------------------------------------------------------------
-- backup_runs: history of Backup Center actions. Holds METADATA ONLY (ids,
-- timestamps, sizes, status, summary counts). Backup artifacts themselves live
-- in the database provider (Neon branches) or in Git — never in this table.
-- `summary` carries counts and check results, never customer data or secrets.
-- ---------------------------------------------------------------------------
create table if not exists backup_runs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,                       -- database | source | metadata | restore_test
  status        text not null default 'running',     -- running | completed | failed | expired
  version       text,                                -- Neon branch id / git commit
  reference     text,                                -- Neon branch name / git tag
  size_bytes    bigint,
  verification  text not null default 'not_verified',-- not_verified | verified | failed
  restore_test  text not null default 'not_tested',  -- not_tested | running | passed | failed
  parent_run_id uuid,                                -- restore_test -> the backup it tested
  step          text,                                -- current step of a running run
  summary       jsonb not null default '{}'::jsonb,
  error         text,
  triggered_by  text,                                -- admin | schedule
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  expires_at    timestamptz
);
create index if not exists idx_backup_runs_created on backup_runs (created_at desc);
create index if not exists idx_backup_runs_kind_created on backup_runs (kind, created_at desc);
