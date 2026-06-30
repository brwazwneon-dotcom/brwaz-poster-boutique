DROP POLICY IF EXISTS "Anyone can upload custom design files" ON storage.objects;

CREATE POLICY "Public can upload custom design images to uuid folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'custom-designs'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','heic','heif')
);