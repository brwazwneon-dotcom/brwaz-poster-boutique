-- Homepage "highlights" shortcut row (round icon/image links, e.g. to
-- Football/Movies/Custom Design) — admin-curated, previously always
-- empty since it was still reading from the dead Supabase project with
-- no admin UI to manage it either.
CREATE TABLE IF NOT EXISTS highlights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  title       text NOT NULL,
  image_url   text,
  link        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_highlights_enabled ON highlights(enabled, sort_order);
