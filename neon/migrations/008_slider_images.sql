-- Homepage full-width slider ("homepage_slider" section, separate from
-- hero_banners — both are enabled by default in the section registry).
-- Was still reading from the dead Supabase project with no admin UI.
CREATE TABLE IF NOT EXISTS slider_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url   text NOT NULL,
  title       text,
  link_url    text,
  sort_order  integer NOT NULL DEFAULT 0,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slider_images_enabled ON slider_images(enabled, sort_order);
