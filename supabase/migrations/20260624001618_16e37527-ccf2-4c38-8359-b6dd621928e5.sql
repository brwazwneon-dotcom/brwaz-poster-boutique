
DROP POLICY IF EXISTS "Anyone can place an order" ON public.orders;

CREATE POLICY "Anyone can place an order"
  ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(trim(customer_name)) > 0
    AND length(trim(phone)) > 0
    AND length(trim(address)) > 0
    AND length(trim(governorate)) > 0
    AND length(trim(frame_type)) > 0
    AND length(trim(frame_color)) > 0
    AND length(trim(size)) > 0
    AND quantity > 0
    AND total_price >= 0
    AND status = 'new'
  );
