-- Unified analytics: attribution + event context on the EXISTING analytics
-- tables. Strictly additive and idempotent:
--   * ADD COLUMN IF NOT EXISTS only — every new column is nullable with no
--     default, so no existing row is rewritten or modified.
--   * CREATE INDEX IF NOT EXISTS only.
--   * No DROP / DELETE / UPDATE / RENAME.
--
-- The application does not depend on this migration being applied: the
-- writers fall back to the legacy column list when a column is missing, and
-- the admin reports read these columns defensively.
--
-- analytics_visits: one row per page view (unchanged). New columns carry the
-- session's attribution, stamped by the browser once per session
-- (src/lib/attribution.ts), so "where did this visitor originally come from"
-- (first touch) and "what brought them back" (last touch) are separate facts.
-- `host` records the site host the event came from so development / preview
-- traffic can be excluded from production reporting.
alter table analytics_visits
  add column if not exists host text,
  add column if not exists first_source text,
  add column if not exists first_medium text,
  add column if not exists first_campaign text,
  add column if not exists first_content text,
  add column if not exists first_term text,
  add column if not exists last_source text,
  add column if not exists last_medium text,
  add column if not exists last_campaign text,
  add column if not exists last_content text,
  add column if not exists last_term text;

-- analytics_poster_events: already the per-visitor event log (view,
-- unique_view, cart_add, wishlist_add, checkout_start). It gains the context
-- the funnel/click events need, instead of introducing a second event table.
--   value/quantity  business values (price, qty) — never customer data
--   props           small allow-listed JSON (category slug, banner id, size…)
alter table analytics_poster_events
  add column if not exists host text,
  add column if not exists path text,
  add column if not exists value numeric,
  add column if not exists quantity integer,
  add column if not exists props jsonb,
  add column if not exists first_source text,
  add column if not exists first_medium text,
  add column if not exists first_campaign text,
  add column if not exists last_source text,
  add column if not exists last_medium text,
  add column if not exists last_campaign text;

-- Session/visitor lookups used by the reports (both tables are small today;
-- these keep the aggregations index-backed as they grow).
create index if not exists idx_analytics_visits_session
  on analytics_visits (session_id);
create index if not exists idx_analytics_visits_visitor_created
  on analytics_visits (visitor_id, created_at);
create index if not exists idx_analytics_poster_events_type_created
  on analytics_poster_events (event_type, created_at);
create index if not exists idx_analytics_poster_events_session
  on analytics_poster_events (session_id);
