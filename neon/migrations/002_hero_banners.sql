-- Hero banners for the homepage slider (Phase 4 item, brought forward
-- since homepage management is next in priority). Simpler than the old
-- Supabase-era shape: no image_variants join, no signed-URL resolution —
-- Vercel Blob URLs are already public and permanent.
CREATE TABLE IF NOT EXISTS hero_banners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url    text NOT NULL,
  title        text,
  subtitle     text,
  button_text  text,
  button_link  text,
  enabled      boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hero_banners_enabled ON hero_banners(enabled, sort_order);

-- System logs — client/server error capture (admin System Health / Error
-- Logs tabs read from this). Same shape as the old error-logger.ts writes.
CREATE TABLE IF NOT EXISTS system_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level      text NOT NULL DEFAULT 'error',
  source     text,
  category   text,
  message    text NOT NULL,
  stack      text,
  url        text,
  user_agent text,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status     text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_status ON system_logs(status);
