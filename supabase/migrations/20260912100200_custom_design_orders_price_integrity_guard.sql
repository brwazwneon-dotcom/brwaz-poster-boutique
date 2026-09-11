-- =========================================================
-- Price integrity guard for public.custom_design_orders
-- =========================================================
-- Same open-INSERT gap as the other price-sensitive tables (WITH
-- CHECK(true)-equivalent: the existing policy only checks total_price >= 0,
-- which still allows 0). Unlike orders/photo_orders/photo_4x6_orders,
-- this table currently has NO live insert path in the app — the custom
-- design flow (src/routes/custom-design.tsx) adds items to the cart and
-- submits through public.orders instead, which the 2026-09-11 guard
-- already covers. But the table's INSERT policy remains open to anon via
-- the public REST endpoint regardless of whether the current UI uses it,
-- so it is still a live attack surface (garbage/zero-price row injection)
-- and a real target for any future feature that DOES write here.
--
-- Deliberately NOT a catalog-price floor: there is no current live pricing
-- UI for this table to derive a trustworthy catalog price from, and
-- guessing one risks being wrong the day this table becomes live again.
-- This guard only enforces internal consistency (subtotal = unit_price *
-- quantity, total = subtotal + shipping, everything positive) — the same
-- floor a real catalog check in the future can be added on top of.
-- =========================================================

CREATE OR REPLACE FUNCTION public.guard_custom_design_order_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qty numeric;
  computed_total numeric;
BEGIN
  qty := GREATEST(COALESCE(NEW.quantity, 1), 1);

  IF COALESCE(NEW.unit_price, 0) <= 0
     OR COALESCE(NEW.subtotal, 0) <= 0
     OR NEW.total_price IS NULL
     OR NEW.total_price <= 0
     OR COALESCE(NEW.shipping_cost, 0) < 0 THEN
    RAISE EXCEPTION
      'BRWAZ price guard: order amounts must be positive (unit_price=%, subtotal=%, total_price=%, shipping_cost=%)',
      NEW.unit_price, NEW.subtotal, NEW.total_price, NEW.shipping_cost;
  END IF;

  IF ABS(NEW.unit_price * qty - NEW.subtotal) > 1.0 THEN
    RAISE EXCEPTION
      'BRWAZ price guard: subtotal (%) does not equal unit_price * quantity (%)',
      NEW.subtotal, NEW.unit_price * qty;
  END IF;

  computed_total := NEW.subtotal + COALESCE(NEW.shipping_cost, 0);
  IF ABS(computed_total - NEW.total_price) > 1.0 THEN
    RAISE EXCEPTION
      'BRWAZ price guard: total_price (%) does not equal subtotal + shipping_cost (%)',
      NEW.total_price, computed_total;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_custom_design_order_price() IS
  'BEFORE INSERT guard on public.custom_design_orders: rejects non-positive/inconsistent amounts. No catalog floor (table has no live pricing UI today) — see migration file header. Added 2026-09-12 audit follow-up.';

DROP TRIGGER IF EXISTS custom_design_orders_price_guard ON public.custom_design_orders;
CREATE TRIGGER custom_design_orders_price_guard
  BEFORE INSERT ON public.custom_design_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_custom_design_order_price();
