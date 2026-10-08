-- NOT APPLIED. Run ONLY after:
--   1) supabase/migrations/20261008120000_place_order_server_pricing.sql is live,
--   2) the checkout release that calls place_order() is live in production, and
--   3) a real order (COD and Instapay, with and without a custom image) has been placed
--      through it and checked in the admin.
-- Applying this earlier makes the old checkout (and the fallback path) fail with a
-- permission error, i.e. customers could not order.
--
-- After this, nobody holding the public anon key can insert an order row with a price
-- of their choice; the only way in is place_order(), which prices everything itself.

REVOKE INSERT ON public.orders FROM anon, authenticated;
REVOKE INSERT ON public.order_posters FROM anon, authenticated;
-- admins keep their own policies/grants via the dashboard (service role / admin policy);
-- verify "Admins can ..." policies still cover any manual order creation you do.
