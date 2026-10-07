-- PROPOSED, NOT APPLIED. Do NOT copy into supabase/migrations until you approve (Lovable may auto-apply).
-- Tested on a scratch PostgreSQL 16 (see order_guard_test_results.md), never on production.
--
-- Problem (verified in repo): the existing INSERT policy on public.orders only checks total_price >= 0, status='new' and
-- payment_status IN (...incl. 'verified','received'). So any visitor can insert an order with total_price = 0 and
-- payment_status = 'verified'. Prices are computed in the browser (src/routes/cart.tsx).
--
-- This adds a BEFORE INSERT guard for anon/authenticated callers (admins and service_role are exempt):
--   1. payment_status must be 'pending' (instapay) or 'not_required' (cod); payment_verified_at must be NULL.
--   2. total_price must equal subtotal + packaging_fee + shipping_cost (what the client sends today), all >= 0.
--   3. Price floor: for single-poster rows, subtotal >= floor_pct% of (configured unit price x quantity). Bundle discounts are
--      split across lines client-side, so an exact match would reject legitimate orders; the floor only stops absurd prices.
-- Mode switch in site_settings key 'order_guard_mode': 'off' | 'log' (default: WARNING only) | 'enforce'.
-- Roll out: apply in 'log', watch Postgres logs for WARNINGs on real orders for a few days, then set 'enforce'.
-- Rollback: DROP TRIGGER orders_guard_trg ON public.orders; DROP FUNCTION public.orders_guard();

INSERT INTO public.site_settings(key, value) VALUES ('order_guard_mode', '"log"'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.site_settings(key, value) VALUES ('order_guard_floor_pct', '50'::jsonb) ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orders_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mode text; floor_pct numeric; problems text[] := ARRAY[]::text[];
  ftype text; sz text; unit numeric; v jsonb;
BEGIN
  -- Exempt: service role / database owner and admins.
  -- NB: inside SECURITY DEFINER current_user is the function owner, so read the caller's role from the session GUC
  -- (PostgREST does SET LOCAL ROLE anon/authenticated/service_role per request).
  IF coalesce(nullif(current_setting('role', true), ''), 'none') NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role) THEN RETURN NEW; END IF;

  SELECT trim(both '"' from value::text) INTO mode FROM public.site_settings WHERE key = 'order_guard_mode';
  mode := coalesce(mode, 'log');
  IF mode = 'off' THEN RETURN NEW; END IF;
  SELECT coalesce((SELECT (value #>> '{}')::numeric FROM public.site_settings WHERE key = 'order_guard_floor_pct'), 50) INTO floor_pct;

  -- 1. payment state can only start as pending / not_required
  IF NEW.payment_status NOT IN ('pending', 'not_required') THEN problems := array_append(problems, 'payment_status=' || NEW.payment_status); END IF;
  IF NEW.payment_verified_at IS NOT NULL THEN problems := array_append(problems, 'payment_verified_at set'); END IF;
  IF NEW.payment_method = 'instapay' AND NEW.payment_status <> 'pending' THEN problems := array_append(problems, 'instapay not pending'); END IF;
  IF NEW.payment_method = 'cod' AND NEW.payment_status <> 'not_required' THEN problems := array_append(problems, 'cod not not_required'); END IF;

  -- 2. arithmetic + non-negative
  IF NEW.subtotal IS NULL OR NEW.subtotal < 0 OR NEW.packaging_fee < 0 OR NEW.shipping_cost < 0 THEN
    problems := array_append(problems, 'negative/missing amounts');
  ELSIF abs(NEW.total_price - (NEW.subtotal + NEW.packaging_fee + NEW.shipping_cost)) > 1 THEN
    problems := array_append(problems, format('total %s <> subtotal+packaging+shipping %s', NEW.total_price, NEW.subtotal + NEW.packaging_fee + NEW.shipping_cost));
  END IF;
  IF NEW.quantity > 100 THEN problems := array_append(problems, 'quantity>100'); END IF;

  -- 3. price floor for single-poster rows with a known configured price
  IF NEW.selected_poster IS NOT NULL AND NEW.subtotal IS NOT NULL THEN
    ftype := CASE WHEN NEW.frame_type ILIKE '%wood%' THEN 'wood' WHEN NEW.frame_type ILIKE '%pvc%' THEN 'pvc' END;
    sz := regexp_replace(lower(NEW.size), '\s*cm\s*$', '');
    sz := regexp_replace(sz, '\s+', '', 'g');
    IF ftype IS NOT NULL THEN
      SELECT value INTO v FROM public.site_settings WHERE key = 'frame_' || ftype || '_' || sz;
      IF v IS NOT NULL AND (v #>> '{}') ~ '^[0-9.]+$' THEN
        unit := (v #>> '{}')::numeric;
        IF unit > 0 AND NEW.subtotal < unit * NEW.quantity * floor_pct / 100 THEN
          problems := array_append(problems, format('subtotal %s below floor %s', NEW.subtotal, round(unit * NEW.quantity * floor_pct / 100)));
        END IF;
      END IF;
    END IF;
  END IF;

  IF cardinality(problems) > 0 THEN
    IF mode = 'enforce' THEN
      RAISE EXCEPTION 'order rejected by guard: %', array_to_string(problems, '; ') USING ERRCODE = '23514';
    ELSE
      RAISE WARNING 'order guard (log mode) would reject: % [phone=%, session=%]', array_to_string(problems, '; '), NEW.phone, NEW.guest_session_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_guard_trg ON public.orders;
CREATE TRIGGER orders_guard_trg BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_guard();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Part B (optional, needs a client change in the SAME release — do not apply alone):
-- idempotency so a refresh/retry cannot create duplicate orders.
--   ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key uuid, ADD COLUMN IF NOT EXISTS idempotency_line int;
--   CREATE UNIQUE INDEX IF NOT EXISTS orders_idem_uidx ON public.orders (idempotency_key, idempotency_line) WHERE idempotency_key IS NOT NULL;
-- Client: generate one uuid per checkout attempt (kept in sessionStorage until success), send it with each row's line index;
-- treat Postgres error 23505 on orders_idem_uidx as "already placed". Sending the new columns before the migration exists
-- would break checkout, which is why the client change is not in the V2 branch.
-- Rollback: DROP INDEX orders_idem_uidx; ALTER TABLE public.orders DROP COLUMN idempotency_key, DROP COLUMN idempotency_line;
