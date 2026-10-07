# Order guard (`02_orders_idempotency_and_price_check.sql`) — local test results
Scratch PostgreSQL 16, stub `auth.uid()`, `has_role`, roles anon/authenticated/service_role, and an `orders`/`site_settings` replica. Never run against production.

## Why it exists (verified from the repo migrations)
The current INSERT policy only requires `total_price >= 0`, `status='new'`, and `payment_status IN (not_required, pending, received, verified, rejected)`.
So an anonymous visitor can insert an order with `total_price = 0` **and** `payment_status = 'verified'`.

## Bugs the test found in my first draft (both fixed)
1. `SECURITY DEFINER` makes `current_user` the function owner, so the guard never fired for anon. Now reads `current_setting('role')`.
2. `text[] || 'literal'` is parsed as an array literal and raised "malformed array literal" instead of the guard message. Now `array_append`.

## Final results
| Case | Result |
|---|---|
| legit COD / instapay-pending single 30x40 PVC | accepted |
| legit line with 35% bundle discount | accepted (floor is 50%) |
| bundle row (no selected_poster), tape row shape | accepted |
| total_price = 0 | rejected (subtotal below floor) |
| subtotal 10 for a 250 EGP frame | rejected |
| payment_status = verified / payment_verified_at set | rejected |
| total ≠ subtotal+packaging+shipping | rejected |
| quantity 1000 / negative shipping to cancel the price | rejected |
| service_role, admin (via has_role) | exempt |
| mode `log` | accepted + `WARNING` with phone/session in the Postgres log |
| mode `off` | accepted silently |

## Compatibility with the current client (src/routes/cart.tsx, read, not executed against a DB)
Rows send `total_price = lineNet + packaging + shipping` (arithmetic matches within the ±1 tolerance), COD → `not_required`, Instapay → `pending`, frame label "High Quality PVC"/"Wooden Portrait", size label "30 x 40 cm" (normalised to `30x40` for the price lookup). Bundle/tape rows have no `selected_poster`, so only the arithmetic/payment rules apply.

## Known limits
- It is a floor + consistency check, not full server-side pricing: a buyer can still pay up to `floor_pct`% (default 50) less than list on a single frame. Full pricing authority needs a `place_order` RPC that recomputes totals (bigger change, client rewrite).
- Not tested against real orders. Recommended rollout: apply in `log` mode, review Postgres WARNINGs for a few days, then set `order_guard_mode` to `"enforce"`. Rollback: drop the trigger.
- Idempotency (Part B in the file) needs a client change in the same release and is not drafted into the client.
