-- Lightweight analytics tables — replaces the old Supabase-only
-- analytics_visits / analytics_poster_events / search_queries, which
-- were still being written to directly (silently failing since that
-- project is inaccessible). Kept intentionally simple: no admin
-- dashboard reads these yet, this just stops losing the data.
CREATE TABLE IF NOT EXISTS analytics_visits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id    text,
  session_id    text,
  path          text NOT NULL,
  referrer      text,
  source        text,
  device        text,
  browser       text,
  os            text,
  country       text,
  country_code  text,
  city          text,
  governorate   text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_visits_created ON analytics_visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_visits_path ON analytics_visits(path);

CREATE TABLE IF NOT EXISTS analytics_poster_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id         uuid REFERENCES posters(id) ON DELETE SET NULL,
  visitor_id        text,
  session_id        text,
  event_type        text NOT NULL,
  duration_seconds  integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_poster_events_created ON analytics_poster_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_poster_events_poster ON analytics_poster_events(poster_id);

CREATE TABLE IF NOT EXISTS search_queries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query          text NOT NULL,
  results_count  integer NOT NULL DEFAULT 0,
  visitor_id     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_queries_created ON search_queries(created_at DESC);

CREATE TABLE IF NOT EXISTS perf_metrics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path   text NOT NULL,
  metric      text NOT NULL,
  value_ms    integer NOT NULL,
  session_id  text,
  user_agent  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_created ON perf_metrics(created_at DESC);
