
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

-- Allow anyone to read images in the posters bucket
CREATE POLICY "Public read posters bucket"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'posters');

-- Only admins can write/update/delete in posters bucket
CREATE POLICY "Admins can upload to posters bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'posters' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update posters bucket"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'posters' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete from posters bucket"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'posters' AND public.has_role(auth.uid(), 'admin'));
