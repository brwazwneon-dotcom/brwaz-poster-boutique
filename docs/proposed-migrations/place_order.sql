-- DRAFT — NOT APPLIED, NOT TESTED. Review before use. See README.md.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_group_id uuid,
  ADD COLUMN IF NOT EXISTS unit_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2);
CREATE INDEX IF NOT EXISTS idx_orders_group ON public.orders(order_group_id);

-- Frame price lookup mirrors site_settings keys used by the app:
--   frame_<pvc|wood>_<WxH>, custom_design_fee, shipping_fee, free_shipping_threshold,
--   packaging_fee, double_face_tape_price, offer_6_20x30, offer_4_30x40
CREATE OR REPLACE FUNCTION public.place_order(p_customer jsonb, p_items jsonb, p_payment jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group uuid := gen_random_uuid();
  it jsonb; v_unit numeric; v_gross numeric := 0; v_total numeric;
  v_ship_fee numeric; v_free numeric;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty order';
  END IF;
  SELECT (value #>> '{}')::numeric INTO v_ship_fee FROM site_settings WHERE key = 'shipping_fee';
  SELECT (value #>> '{}')::numeric INTO v_free     FROM site_settings WHERE key = 'free_shipping_threshold';
  -- TODO(review): per item  → unit = site_settings['frame_'||frame||'_'||size] (+ custom fee when custom_image_path present),
  --   reject unit <= 0 or qty < 1; compute auto-offer sets per size, packaging, tape, shipping split in cents
  --   exactly like src/lib/order-pricing.ts, then INSERT one orders row per item with order_group_id = v_group
  --   and total_price computed here (never taken from p_items).
  RETURN jsonb_build_object('order_group_id', v_group);
END $$;

-- Only after the app calls place_order():
-- REVOKE INSERT ON public.orders FROM anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, jsonb) TO anon, authenticated;
