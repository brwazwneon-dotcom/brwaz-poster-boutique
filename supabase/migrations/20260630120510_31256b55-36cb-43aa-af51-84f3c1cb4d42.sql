
DROP POLICY IF EXISTS "Anyone can upload customer photos" ON storage.objects;

CREATE POLICY "Customers can upload to an order folder"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'customer-photos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);
