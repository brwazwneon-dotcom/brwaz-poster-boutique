-- Extends the image-migration tracking from 021 to slider_images -- this
-- is the table that actually feeds the live homepage hero (HomeSlider.tsx
-- / HomepageSlider, via getSliderImagesPublic()). It was missed in 021
-- because the homepage hero visually appeared to come from hero_banners
-- (HeroBannerSlider.tsx) -- that component is also mounted on the
-- homepage but renders behind the hero text as a secondary background
-- layer; slider_images is the one the empty/placeholder banner report
-- was actually about, confirmed by inspecting the live DOM.
ALTER TABLE slider_images
  ADD COLUMN IF NOT EXISTS legacy_image_url text,
  ADD COLUMN IF NOT EXISTS migration_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS migration_error text,
  ADD COLUMN IF NOT EXISTS migration_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS migration_verified_at timestamptz;

UPDATE slider_images
  SET migration_status = 'pending'
  WHERE image_url LIKE '%blob.vercel-storage.com%'
    AND migration_status = 'not_applicable';

CREATE INDEX IF NOT EXISTS idx_slider_images_migration_status ON slider_images(migration_status)
  WHERE migration_status IN ('pending', 'failed');
