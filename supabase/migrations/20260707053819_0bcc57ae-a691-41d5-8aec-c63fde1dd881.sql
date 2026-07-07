ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_session_id text,
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE INDEX IF NOT EXISTS idx_orders_guest_session_id ON public.orders(guest_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);

DROP POLICY IF EXISTS "Anyone can place an order" ON public.orders;
DROP POLICY IF EXISTS "Customers can create guest or user orders" ON public.orders;

CREATE POLICY "Customers can create guest or user orders"
ON public.orders
FOR INSERT
TO anon, authenticated
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
  AND payment_method = ANY (ARRAY['cod'::text, 'instapay'::text])
  AND payment_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'received'::text, 'verified'::text, 'rejected'::text])
  AND (
    (guest_session_id IS NOT NULL AND length(btrim(guest_session_id)) BETWEEN 8 AND 128)
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);