-- Curated frame-set bundles (/sets page + homepage "Frame Sets" teaser).
-- Deliberately its own table, not linked to posters — a set isn't a
-- single product, so its cart line item must never be treated as a
-- real posters.id (see createOrderRows' selected_poster FK).
CREATE TABLE IF NOT EXISTS sets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  image_url     text,
  frames_count  integer NOT NULL DEFAULT 1 CHECK (frames_count > 0),
  price         numeric(10,2) NOT NULL,
  old_price     numeric(10,2),
  enabled       boolean NOT NULL DEFAULT true,
  featured      boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sets_enabled ON sets(enabled, sort_order);
