-- =========================================================
-- Price integrity guard for public.orders
-- =========================================================
-- CONTEXT (found during the 2026-09-11 audit):
-- The "Anyone can place an order" INSERT policy on public.orders is
-- `WITH CHECK (true)` for anon + authenticated — intentional, since
-- guests must be able to check out without an account. But nothing on
-- the server ever verified that subtotal / total_price reflect real
-- catalog prices: the browser computes every price field itself (see
-- src/routes/cart.tsx) and sends it straight through
-- `supabase.from("orders").insert(rows)`. The only BEFORE INSERT trigger
-- that previously existed (orders_order_number) just assigns the human
-- order number — it never looks at price.
--
-- Practical impact: anyone who opens devtools, or calls the Supabase
-- REST endpoint directly with the public anon key (which is, by design,
-- visible in every page load), can submit an order at ANY price,
-- including 0 or negative. This migration closes that gap without
-- touching anything else about checkout.
--
-- DESIGN — "generous floor", not an exact re-calculation:
-- The storefront's real discount logic (auto-detected 6-pack/4-pack
-- bundle offers, pro-rata discount distribution across every row in the
-- cart, an optional double-face-tape add-on line — all in
-- src/routes/cart.tsx) is stateful across the *entire* cart and cannot
-- be reconstructed from a single row in a BEFORE INSERT ROW trigger with
-- full fidelity. Rebuilding 100% of it here, untested against the live
-- store and live traffic, risks rejecting real, legitimate discounted
-- orders — which would be worse than the bug it fixes, because it would
-- silently stop ALL checkouts instead of leaking a few fraudulent ones.
--
-- The heaviest realistic legitimate discount today is ~31% (a complete
-- 6-pack of 20x30 PVC posters priced at the flat bundle offer). This
-- guard allows up to MAX_DISCOUNT_RATIO off catalog (55% by default —
-- comfortably above every discount path in the current code, so it also
-- has headroom for a future admin promo without needing a code change)
-- and only rejects amounts far outside that range. In practice that
-- means it blocks price-tampering (near-zero, negative, or arbitrary
-- amounts) without ever touching genuine traffic.
--
-- Reference prices come from public.site_settings first (the same table
-- the storefront itself reads via src/lib/use-settings.ts), falling back
-- to the same PRICING_DEFAULTS constants hardcoded in that file when a
-- given key has never been written to site_settings. Both must be read
-- from the same place a human would update pricing today; if the admin
-- changes a price in site_settings, this guard picks it up immediately
-- because it queries the table live at insert time.
--
-- Unrecognized frame/size combinations (a future product type added
-- later, or a row this guard doesn't know how to price) are NOT
-- price-blocked — they are logged to public.system_logs (visible in the
-- admin "Error Logs" tab) for visibility instead, so a future catalog
-- change can never silently break checkout just because this trigger
-- doesn't know about it yet.
--
-- NOT covered by this migration (recommended follow-up once their
-- pricing logic gets the same review): photo_orders, photo_4x6_orders
-- and custom_design_orders have the identical shape of gap (anon INSERT
-- WITH CHECK(true) + client-computed totals, no server floor), but their
-- pricing formulas were not audited to this depth — a guessed floor
-- there could be wrong. Left out on purpose rather than shipped unverified.
-- =========================================================

CREATE OR REPLACE FUNCTION public.guard_order_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Allow up to this fraction off the catalog unit price before
  -- rejecting. Real discounts top out around ~0.31 today (see the
  -- design note above). 0.55 leaves generous headroom for a future
  -- promo without needing to touch this function.
  max_discount_ratio CONSTANT numeric := 0.55;

  -- Mirrors PRICING_DEFAULTS in src/lib/use-settings.ts. Used only when
  -- site_settings has no row yet for a given key — keep in sync if that
  -- file's defaults ever change.
  default_prices CONSTANT jsonb := '{
    "frame_pvc_20x30": 190, "frame_pvc_30x40": 250, "frame_pvc_40x50": 350,
    "frame_wood_20x30": 190, "frame_wood_30x40": 270, "frame_wood_40x50": 400,
    "frame_wood_40x60": 450, "frame_wood_50x60": 500, "frame_wood_50x70": 580,
    "frame_wood_60x90": 850, "frame_wood_100x60": 950,
    "double_face_tape_price": 20
  }'::jsonb;

  frame_key text;
  size_key text;
  settings_key text;
  catalog_price numeric;
  qty numeric;
  floor_amount numeric;
  computed_total numeric;
  effective_subtotal numeric;
BEGIN
  qty := GREATEST(COALESCE(NEW.quantity, 1), 1);
  effective_subtotal := COALESCE(NEW.subtotal, NEW.total_price);

  -- 1) Basic sanity, applies to every row regardless of product type:
  --    nothing may be zero/negative, and the parts must add up to the
  --    whole. This alone blocks the most damaging exploit (submitting
  --    total_price = 0 or a negative number).
  IF COALESCE(effective_subtotal, 0) <= 0
     OR NEW.total_price IS NULL
     OR NEW.total_price <= 0
     OR COALESCE(NEW.packaging_fee, 0) < 0
     OR COALESCE(NEW.shipping_cost, 0) < 0 THEN
    RAISE EXCEPTION
      'BRWAZ price guard: order amounts must be positive (subtotal=%, total_price=%, packaging_fee=%, shipping_cost=%)',
      NEW.subtotal, NEW.total_price, NEW.packaging_fee, NEW.shipping_cost;
  END IF;

  computed_total := effective_subtotal
    + COALESCE(NEW.packaging_fee, 0)
    + COALESCE(NEW.shipping_cost, 0);

  -- Small rounding tolerance (1 EGP) to absorb client-side Math.round()
  -- steps in the pro-rata discount split.
  IF ABS(computed_total - NEW.total_price) > 1.0 THEN
    RAISE EXCEPTION
      'BRWAZ price guard: total_price (%) does not equal subtotal + packaging_fee + shipping_cost (%)',
      NEW.total_price, computed_total;
  END IF;

  -- 2) Catalog floor check.
  --    "Double Face Tape" is a fixed add-on line, not a framed poster —
  --    handle it as its own case (no legitimate discount ever applies
  --    to it in src/routes/cart.tsx).
  IF NEW.poster_title IS NOT DISTINCT FROM 'Double Face Tape' THEN
    SELECT COALESCE(
      (SELECT (value)::text::numeric FROM public.site_settings WHERE key = 'double_face_tape_price'),
      (default_prices ->> 'double_face_tape_price')::numeric
    ) INTO catalog_price;

    IF catalog_price IS NOT NULL AND catalog_price > 0 THEN
      floor_amount := ROUND(catalog_price * qty * (1 - max_discount_ratio), 2);
      IF effective_subtotal < floor_amount THEN
        RAISE EXCEPTION
          'BRWAZ price guard: Double Face Tape subtotal (%) for qty % is below the allowed floor (%, catalog %/unit)',
          effective_subtotal, qty, floor_amount, catalog_price;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  frame_key := CASE NEW.frame_type
    WHEN 'High Quality PVC' THEN 'pvc'
    WHEN 'Wooden Portrait' THEN 'wood'
    ELSE NULL
  END;
  size_key := CASE NEW.size
    WHEN '20 x 30 cm' THEN '20x30'
    WHEN '30 x 40 cm' THEN '30x40'
    WHEN '40 x 50 cm' THEN '40x50'
    WHEN '40 x 60 cm' THEN '40x60'
    WHEN '50 x 60 cm' THEN '50x60'
    WHEN '50 x 70 cm' THEN '50x70'
    WHEN '60 x 90 cm' THEN '60x90'
    WHEN '100 x 60 cm' THEN '100x60'
    ELSE NULL
  END;

  IF frame_key IS NULL OR size_key IS NULL THEN
    -- Unrecognized frame/size label — future catalog change, or a
    -- non-standard row. Log for visibility, do not block: we would
    -- rather miss a fraud attempt on a product type we don't recognize
    -- than silently break checkout for a legitimate new product.
    INSERT INTO public.system_logs (level, source, category, message, metadata)
    VALUES (
      'info', 'db-trigger', 'order_price_guard',
      'Order row has an unrecognized frame_type/size — catalog floor check skipped',
      jsonb_build_object(
        'frame_type', NEW.frame_type, 'size', NEW.size, 'poster_title', NEW.poster_title,
        'subtotal', NEW.subtotal, 'quantity', qty
      )
    );
    RETURN NEW;
  END IF;

  settings_key := 'frame_' || frame_key || '_' || size_key;
  SELECT COALESCE(
    (SELECT (value)::text::numeric FROM public.site_settings WHERE key = settings_key),
    (default_prices ->> settings_key)::numeric
  ) INTO catalog_price;

  IF catalog_price IS NULL OR catalog_price <= 0 THEN
    -- A recognized size for a frame we have literally no reference price
    -- for at all (not in site_settings, not in the defaults mirror).
    -- Log only, same reasoning as above.
    INSERT INTO public.system_logs (level, source, category, message, metadata)
    VALUES (
      'warning', 'db-trigger', 'order_price_guard',
      'Order row inserted with no known catalog price for this frame/size',
      jsonb_build_object(
        'frame_type', NEW.frame_type, 'size', NEW.size, 'settings_key', settings_key,
        'subtotal', NEW.subtotal, 'quantity', qty
      )
    );
    RETURN NEW;
  END IF;

  floor_amount := ROUND(catalog_price * qty * (1 - max_discount_ratio), 2);
  IF effective_subtotal < floor_amount THEN
    RAISE EXCEPTION
      'BRWAZ price guard: subtotal (%) for % / % x qty % is below the allowed floor (%). Catalog price is %/unit.',
      effective_subtotal, NEW.frame_type, NEW.size, qty, floor_amount, catalog_price;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_order_price() IS
  'BEFORE INSERT guard on public.orders: rejects non-positive/inconsistent amounts and subtotals far below the real catalog price (see migration file header for the full design rationale). Added 2026-09-11 audit.';

DROP TRIGGER IF EXISTS orders_price_guard ON public.orders;
CREATE TRIGGER orders_price_guard
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_order_price();
