# Server-side order pricing — status

| Step | File | Status |
|---|---|---|
| 1. Additive migration: `place_order()` + helpers + 3 new `orders` columns | `supabase/migrations/20261008120000_place_order_server_pricing.sql` | In the repo on `claude/old-site-edits`. **Not run by me against any Supabase project** (no access from the build environment). It reaches the database only when this branch is merged and Supabase/Lovable applies migrations. |
| 2. Checkout calls `place_order()`, falls back to the old insert if the function is missing | `src/routes/cart.tsx`, `src/lib/place-order-client.ts` | Done on the branch. |
| 3. Close the direct INSERT | `revoke_direct_order_insert.sql` (this folder) | **Not applied, on purpose.** Only after steps 1–2 are live and a real order went through. |

## Why
Checkout used to insert `orders` rows straight from the browser. The only database guard was
`total_price >= 0`, so anyone with the public key could place an order at any price.
`place_order()` recomputes unit price, auto-offer discount, packaging, tape and shipping from
`site_settings` (same rules as `src/lib/order-pricing.ts`) and refuses the order when the
customer's expected total no longer matches.

## What was tested
Local scratch Postgres 16 (`tests/db/schema.sql` mirrors the production NOT NULLs and foreign
keys): `PG_PARITY=1 npx vitest run place-order-parity` — 150 random carts match the browser
calculation to the cent (random admin prices, bundles, tape, custom images, free-shipping edge
cases); hostile input is rejected; browser-sent prices are ignored; a stale expected total is
refused and writes nothing; posters / custom designs / deleted posters / notes behave like the
old client.

## End-to-end checkout (real browser, real SQL)
`tests/e2e/checkout-e2e.mjs` drives the real `/cart` page; the browser's API calls are answered by a
scratch Postgres that has the migration applied: (A) tampered browser prices are ignored and the
rows add up to the server total, a stale Wooden+Black cart is repaired, one group id, redirect to
`/order-confirmed`; (B) prices change while the cart is open → the server refuses, nothing is
written, the customer sees the new total and the re-confirmed order uses it; (C) function missing →
the legacy insert still works. 14/14 pass. Writing this test caught a bug in the colour-rule change
(validation looked at the stale colour and blocked repaired carts) — fixed.

## Not tested
The real Supabase project: RLS, the `order_number` and notification triggers on `orders`, PostgREST
RPC permissions, `auth.uid()` for logged-in customers. Check those on a staging project or with one
real test order (`is_test`) before step 3.
