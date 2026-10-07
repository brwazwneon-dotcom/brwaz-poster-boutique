# Proposed (NOT applied) — server-side order pricing

**Status: proposal only.** Files in this folder are deliberately outside
`supabase/migrations/` so nothing applies or syncs them automatically. Review,
then move into `supabase/migrations/` yourself (or ask for it) once approved.
The SQL has **not** been run against any database.

## Why
Checkout inserts `orders` rows straight from the browser. The only server-side
guard is the RLS `WITH CHECK` (`total_price >= 0`, non-empty fields). A caller
using the public anon key can therefore insert a row with any price (e.g.
`total_price = 0`), because nothing recomputes it from `site_settings`.
The client now computes everything from one module (`src/lib/order-pricing.ts`)
and re-prices from current admin prices, but only the database can make that
authoritative.

## What it would do
1. Add columns to `public.orders` (all nullable, additive, no backfill needed):
   `order_group_id uuid`, `unit_price numeric(10,2)`, `discount_amount numeric(10,2)`.
   - `order_group_id` replaces the admin's "same phone/session within 2 minutes"
     grouping heuristic (two checkouts <2 min apart currently merge).
2. A `SECURITY DEFINER` function `public.place_order(p_customer jsonb, p_items jsonb, p_payment jsonb)` that
   recomputes unit price, auto-offer discount, packaging, tape, shipping and
   total from `site_settings` (same rules as `order-pricing.ts`), inserts the
   rows, and returns `{order_group_id, total}`.
3. Revoke direct `INSERT` on `public.orders` from `anon`/`authenticated`
   (keep for admin) so the RPC is the only way in.
4. Checkout switches from `.insert(rows)` to `.rpc('place_order', …)`.

Step 3 + 4 must ship together; applying step 3 before the app change would
break checkout. See `place_order.sql` for the draft.
