-- =========================================================
-- Price integrity guard for public.photo_orders
-- =========================================================
-- Same class of gap as the 2026-09-11 orders guard
-- (20260911120000_orders_price_integrity_guard.sql): the "Anyone can place
-- an order" INSERT policy on photo_orders is WITH CHECK(true) for anon, and
-- unit_price / total_price are computed entirely client-side in
-- src/routes/photo-printing.tsx and sent straight through
-- supabase.from("photo_orders").insert(...). No server-side check ever
-- verified they reflect the real per-photo catalog price.
--
-- Unlike frame orders, photo printing has NO bundle/quantity discount in
-- the current UI (subtotal = qty * size.price, flat) — so this guard can
-- require a close match to the catalog price rather than a generous floor.
-- A small rounding tolerance (1 EGP) absorbs client-side rounding only.
--
-- Reference prices come from public.site_settings (photo_10x15 / photo_13x18
-- / photo_15x20), falling back to the PRICING_DEFAULTS.photo mirror in
-- src/lib/use-settings.ts when a key has never been written. Shipping is
-- validated the same way computeShipping() works client-side: 0 above the
-- free-shipping threshold, shippingFee otherwise.
--
-- An unrecognized `size` label (future catalog change) is logged to
-- system_logs and NOT blocked, matching the orders guard's philosophy:
-- better to miss a fraud attempt on an unknown product shape than to
-- silently break checkout for a legitimate new one.
-- =========================================================

CREATE OR REPLACE FUNCTION public.guard_photo_order_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_prices CONSTANT jsonb := '{
    "photo_10x15": 10, "photo_13x18": 15, "photo_15x20": 20
  }'::jsonb;
  default_shipping_fee CONSTANT numeric := 89;
  default_free_threshold CONSTANT numeric := 1600;

  size_key text;
  unit_catalog_price numeric;
  shipping_fee numeric;
  free_threshold numeric;
  expected_shipping numeric;
  expected_subtotal numeric;
  qty numeric;
BEGIN
  qty := GREATEST(COALESCE(NEW.quantity, 1), 1);

  IF COALESCE(NEW.unit_price, 0) <= 0
     OR NEW.total_price IS NULL
     OR NEW.total_price <= 0
     OR COALESCE(NEW.shipping_cost, 0) < 0 THEN
    RAISE EXCEPTION
      'BRWAZ price guard: order amounts must be positive (unit_price=%, total_price=%, shipping_cost=%)',
      NEW.unit_price, NEW.total_price, NEW.shipping_cost;
  END IF;

  size_key := CASE NEW.size
    WHEN '10 × 15 cm' THEN 'photo_10x15'
    WHEN '13 × 18 cm' THEN 'photo_13x18'
    WHEN '15 × 20 cm' THEN 'photo_15x20'
    ELSE NULL
  END;

  IF size_key IS NULL THEN
    INSERT INTO public.system_logs (level, source, category, message, metadata)
    VALUES (
      'info', 'db-trigger', 'photo_order_price_guard',
      'photo_orders row has an unrecognized size label — catalog check skipped',
      jsonb_build_object('size', NEW.size, 'unit_price', NEW.unit_price, 'quantity', qty)
    );
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    (SELECT (value)::text::numeric FROM public.site_settings WHERE key = size_key),
    (default_prices ->> size_key)::numeric
  ) INTO unit_catalog_price;

  SELECT COALESCE(
    (SELECT (value)::text::numeric FROM public.site_settings WHERE key = 'shipping_fee'),
    default_shipping_fee
  ) INTO shipping_fee;
  SELECT COALESCE(
    (SELECT (value)::text::numeric FROM public.site_settings WHERE key = 'free_shipping_threshold'),
    default_free_threshold
  ) INTO free_threshold;

  IF unit_catalog_price IS NULL OR unit_catalog_price <= 0 THEN
    INSERT INTO public.system_logs (level, source, category, message, metadata)
    VALUES (
      'warning', 'db-trigger', 'photo_order_price_guard',
      'photo_orders row inserted with no known catalog price for this size',
      jsonb_build_object('size', NEW.size, 'settings_key', size_key, 'unit_price', NEW.unit_price)
    );
    RETURN NEW;
  END IF;

  IF NEW.unit_price < unit_catalog_price - 1.0 THEN
    RAISE EXCEPTION
      'BRWAZ price guard: unit_price (%) for % is below the catalog price (%)',
      NEW.unit_price, NEW.size, unit_catalog_price;
  END IF;

  expected_subtotal := NEW.unit_price * qty;
  expected_shipping := CASE WHEN expected_subtotal >= free_threshold THEN 0 ELSE shipping_fee END;

  IF ABS(expected_subtotal + expected_shipping - NEW.total_price) > 1.0 THEN
    RAISE EXCEPTION
      'BRWAZ price guard: total_price (%) does not match unit_price * quantity + shipping (expected %)',
      NEW.total_price, expected_subtotal + expected_shipping;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_photo_order_price() IS
  'BEFORE INSERT guard on public.photo_orders: rejects non-positive amounts and unit/total prices that do not match the real catalog price + shipping (see migration file header). Added 2026-09-12 audit follow-up.';

DROP TRIGGER IF EXISTS photo_orders_price_guard ON public.photo_orders;
CREATE TRIGGER photo_orders_price_guard
  BEFORE INSERT ON public.photo_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_photo_order_price();
