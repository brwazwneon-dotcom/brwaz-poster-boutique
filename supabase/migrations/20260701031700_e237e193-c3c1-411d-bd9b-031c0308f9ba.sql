
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_screenshot text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_notes text;

DROP POLICY IF EXISTS "Anyone can place an order" ON public.orders;
CREATE POLICY "Anyone can place an order" ON public.orders
FOR INSERT TO anon, authenticated
WITH CHECK (
  length(btrim(customer_name)) > 0
  AND length(btrim(phone)) > 0
  AND length(btrim(address)) > 0
  AND length(btrim(governorate)) > 0
  AND length(btrim(frame_type)) > 0
  AND length(btrim(frame_color)) > 0
  AND length(btrim(size)) > 0
  AND quantity > 0
  AND total_price >= 0
  AND status = 'new'
  AND payment_method IN ('cod','instapay')
  AND payment_status IN ('not_required','pending','received','verified','rejected')
);

DROP POLICY IF EXISTS "Public can upload payment screenshots" ON storage.objects;
CREATE POLICY "Public can upload payment screenshots"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'payment-screenshots'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|pdf)$'
);

DROP POLICY IF EXISTS "Admins can read payment screenshots" ON storage.objects;
CREATE POLICY "Admins can read payment screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-screenshots'
  AND private.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete payment screenshots" ON storage.objects;
CREATE POLICY "Admins can delete payment screenshots"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-screenshots'
  AND private.has_role(auth.uid(), 'admin'::app_role)
);
