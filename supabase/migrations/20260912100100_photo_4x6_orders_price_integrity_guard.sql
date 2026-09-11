-- =========================================================
-- Price integrity guard for public.photo_4x6_orders
-- =========================================================
-- Same gap as photo_orders and the original orders guard: the INSERT
-- policy is WITH CHECK(true) for anon, and total_price is computed
-- entirely client-side in src/routes/photo-4x6.tsx
-- (total = pkg.price + computeShipping(pkg.price, settings)) and sent
-- straight through supabase.from("photo_4x6_orders").insert(...). This
-- table has no unit_price/shipping_cost columns — total_price is the only
-- price field, so it is checked directly against the package's catalog
-- price + shipping.
--
-- Packages are admin-configurable (site_settings key "photo_4x6_config",
-- a JSON array under "packages": [{key, photos, price, label}, ...]) — see
-- PHOTO_4X6_KEY / PHOTO_4X6_DEFAULTS in src/lib/use-settings.ts. This guard
-- reads that same JSON live, so an admin price change takes effect
-- immediately, and falls back to the two default packages (p8=80, p12=99)
-- only when site_settings has no config row yet.
--
-- An unrecognized package_key (deleted/renamed package, or a future one)
-- is logged and NOT blocked — same reasoning as the other price guards.
-- =========================================================

CREATE OR REPLACE FUNCTION public.guard_photo_4x6_order_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_packages CONSTANT jsonb := '[
    {"key": "p8", "photos": 8, "price": 80},
    {"key": "p12", "photos": 12, "price": 99}
  ]'::jsonb;
  default_shipping_fee CONSTANT numeric := 89;
  default_free_threshold CONSTANT numeric := 1600;

  configured_packages jsonb;
  pkg_price numeric;
  shipping_fee numeric;
  free_threshold numeric;
  expected_shipping numeric;
  expected_total numeric;
BEGIN
  IF NEW.total_price IS NULL OR NEW.total_price <= 0 THEN
    RAISE EXCEPTION
      'BRWAZ price guard: total_price must be positive (got %)', NEW.total_price;
  END IF;

  IF NEW.package_key IS NULL THEN
    INSERT INTO public.system_logs (level, source, category, message, metadata)
    VALUES (
      'info', 'db-trigger', 'photo_4x6_order_price_guard',
      'photo_4x6_orders row has no package_key — catalog check skipped',
      jsonb_build_object('total_price', NEW.total_price, 'photo_count', NEW.photo_count)
    );
    RETURN NEW;
  END IF;

  SELECT (value -> 'packages') INTO configured_packages
  FROM public.site_settings WHERE key = 'photo_4x6_config';

  SELECT (elem ->> 'price')::numeric INTO pkg_price
  FROM jsonb_array_elements(COALESCE(configured_packages, default_packages)) elem
  WHERE elem ->> 'key' = NEW.package_key;

  -- Config exists but doesn't have this key (or has no packages at all) —
  -- also try the hardcoded defaults before giving up, since an admin
  -- config row with a partial/corrupt packages array shouldn't be trusted
  -- over the known-good defaults for a standard key.
  IF pkg_price IS NULL THEN
    SELECT (elem ->> 'price')::numeric INTO pkg_price
    FROM jsonb_array_elements(default_packages) elem
    WHERE elem ->> 'key' = NEW.package_key;
  END IF;

  IF pkg_price IS NULL OR pkg_price <= 0 THEN
    INSERT INTO public.system_logs (level, source, category, message, metadata)
    VALUES (
      'warning', 'db-trigger', 'photo_4x6_order_price_guard',
      'photo_4x6_orders row inserted with no known catalog price for this package_key',
      jsonb_build_object('package_key', NEW.package_key, 'total_price', NEW.total_price)
    );
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    (SELECT (value)::text::numeric FROM public.site_settings WHERE key = 'shipping_fee'),
    default_shipping_fee
  ) INTO shipping_fee;
  SELECT COALESCE(
    (SELECT (value)::text::numeric FROM public.site_settings WHERE key = 'free_shipping_threshold'),
    default_free_threshold
  ) INTO free_threshold;

  expected_shipping := CASE WHEN pkg_price >= free_threshold THEN 0 ELSE shipping_fee END;
  expected_total := pkg_price + expected_shipping;

  IF ABS(expected_total - NEW.total_price) > 1.0 THEN
    RAISE EXCEPTION
      'BRWAZ price guard: total_price (%) for package % does not match catalog price + shipping (expected %)',
      NEW.total_price, NEW.package_key, expected_total;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_photo_4x6_order_price() IS
  'BEFORE INSERT guard on public.photo_4x6_orders: rejects non-positive totals and totals that do not match the configured package price + shipping (see migration file header). Added 2026-09-12 audit follow-up.';

DROP TRIGGER IF EXISTS photo_4x6_orders_price_guard ON public.photo_4x6_orders;
CREATE TRIGGER photo_4x6_orders_price_guard
  BEFORE INSERT ON public.photo_4x6_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_photo_4x6_order_price();
