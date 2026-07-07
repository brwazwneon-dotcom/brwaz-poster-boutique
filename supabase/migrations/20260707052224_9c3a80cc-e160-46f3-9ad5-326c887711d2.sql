-- Widen accepted image extensions for guest/auth uploads to the
-- custom-designs bucket. Keeps uuid-folder scoping and admin-only reads.
DROP POLICY IF EXISTS "Public can upload custom design images to uuid folder" ON storage.objects;
CREATE POLICY "Public can upload custom design images to uuid folder"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'custom-designs'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND lower(coalesce(storage.extension(name), '')) = ANY (ARRAY[
    'jpg','jpeg','png','webp','heic','heif','avif','gif','bmp','tif','tiff'
  ])
);

-- Same widening for payment screenshots (guest + auth checkout).
DROP POLICY IF EXISTS "Public can upload payment screenshots" ON storage.objects;
CREATE POLICY "Public can upload payment screenshots"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'payment-screenshots'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|avif|gif|heic|heif|pdf)$'
);
