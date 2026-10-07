-- PROPOSED, NOT APPLIED. Do NOT place in supabase/migrations until approved (Lovable may auto-apply).
-- Reason: today anon clients insert orders with client-computed prices and only a client-side double-submit guard.
-- Part A (low risk, additive): idempotency key to stop duplicate order creation on refresh/retry.
--   Rollback: DROP INDEX orders_idem_uidx; ALTER TABLE public.orders DROP COLUMN idempotency_key, DROP COLUMN idempotency_line;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_line int;
-- orders has one row per cart line, so uniqueness is per (key, line index):
CREATE UNIQUE INDEX IF NOT EXISTS orders_idem_uidx ON public.orders (idempotency_key, idempotency_line)
  WHERE idempotency_key IS NOT NULL;
-- Client sends the same key on retry; Postgres rejects the duplicate lines (code 23505) and the client treats that as "already placed".

-- Part B (medium/high risk): server-side price validation (BEFORE INSERT trigger) — design only:
--   recompute unit price from site_settings pricing + poster, compare to NEW.subtotal/total_price, RAISE EXCEPTION on mismatch.
--   Needs pricing rules (tiers, bundle discount, shipping thresholds) reimplemented in SQL; must be tested against
--   real historical orders on a branch DB before enabling. Rollback: DROP TRIGGER.
-- Not drafted in full here because a wrong rule would reject legitimate orders in production.
