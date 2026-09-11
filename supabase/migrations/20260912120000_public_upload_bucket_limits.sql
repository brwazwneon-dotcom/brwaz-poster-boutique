-- =========================================================
-- Server-side file size/type limits for public-upload buckets
-- =========================================================
-- These three buckets (custom-designs, customer-photos, photo-4x6) accept
-- anonymous uploads (see their INSERT storage policies) and, until now,
-- had no file_size_limit or allowed_mime_types set at the bucket level —
-- the 8MB/25MB caps and image-type restrictions the UI enforces
-- (src/routes/photo-4x6.tsx, src/routes/custom-design.tsx) are client-side
-- only and bypassable via a direct Storage API call, enabling
-- storage-abuse / DoS (arbitrarily large or non-image uploads).
--
-- Limits mirror the client-side constants they're paired with, with a
-- little headroom rather than an exact match:
--   custom-designs  -> matches MAX_FILE_BYTES (25MB) in custom-design.tsx
--   photo-4x6       -> matches MAX_FILE_MB (8MB) in photo-4x6.tsx, +2MB
--                       headroom (uploads there are re-encoded to JPEG
--                       client-side before upload, so the stored files
--                       are normally well under this)
--   customer-photos -> photo-printing.tsx has no client-side size check
--                       at all today; 20MB is a generous ceiling sized
--                       for real high-resolution phone photos, added
--                       purely to close the unbounded-upload gap
--
-- Safe to run even if a bucket doesn't exist yet in a given environment —
-- the UPDATE simply matches zero rows.
-- =========================================================

UPDATE storage.buckets
SET
  file_size_limit = 25 * 1024 * 1024,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
WHERE id = 'custom-designs';

UPDATE storage.buckets
SET
  file_size_limit = 10 * 1024 * 1024,
  allowed_mime_types = ARRAY['image/jpeg']
WHERE id = 'photo-4x6';

UPDATE storage.buckets
SET
  file_size_limit = 20 * 1024 * 1024,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
WHERE id = 'customer-photos';
