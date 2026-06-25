
CREATE POLICY "Anyone can upload customer photos"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'customer-photos');

CREATE POLICY "Admins can read customer photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'customer-photos' AND private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update customer photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'customer-photos' AND private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete customer photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'customer-photos' AND private.has_role(auth.uid(), 'admin'::public.app_role));
