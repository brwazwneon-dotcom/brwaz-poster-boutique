-- Tracks the migration of poster/hero-banner images off the suspended
-- Vercel Blob store (public.blob.vercel-storage.com, billing inactive as
-- of 2026-09-14, confirmed unreadable even via the authenticated Blob API)
-- onto Cloudinary. Purely additive: no existing column is touched, no row
-- is deleted, every new column is nullable or defaulted so this is safe
-- to run against live data with zero downtime.
--
-- migration_status values (enforced in application code, matching this
-- project's existing convention of no DB-level CHECK constraints on
-- status columns — see orders.status):
--   'not_applicable' -- image_url was never on the dead domain, nothing to do
--   'pending'         -- on the dead domain, not yet attempted
--   'migrated'        -- successfully re-uploaded to Cloudinary
--   'failed'          -- attempted, hit a retryable error (network, etc.)
--   'broken'          -- attempted, source bytes confirmed unrecoverable (403)
ALTER TABLE posters
  ADD COLUMN IF NOT EXISTS legacy_image_url text,
  ADD COLUMN IF NOT EXISTS migration_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS migration_error text,
  ADD COLUMN IF NOT EXISTS migration_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS migration_verified_at timestamptz;

ALTER TABLE hero_banners
  ADD COLUMN IF NOT EXISTS legacy_image_url text,
  ADD COLUMN IF NOT EXISTS migration_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS migration_error text,
  ADD COLUMN IF NOT EXISTS migration_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS migration_verified_at timestamptz;

-- Backfill: mark every row currently on the dead domain as 'pending' so
-- the migration dashboard has an accurate starting count without a
-- separate one-off script.
UPDATE posters
  SET migration_status = 'pending'
  WHERE image_url LIKE '%blob.vercel-storage.com%'
    AND migration_status = 'not_applicable';

UPDATE hero_banners
  SET migration_status = 'pending'
  WHERE image_url LIKE '%blob.vercel-storage.com%'
    AND migration_status = 'not_applicable';

CREATE INDEX IF NOT EXISTS idx_posters_migration_status ON posters(migration_status)
  WHERE migration_status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_hero_banners_migration_status ON hero_banners(migration_status)
  WHERE migration_status IN ('pending', 'failed');
