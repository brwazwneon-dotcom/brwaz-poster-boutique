-- Ad-platform tracking context captured at checkout, stored per order row.
--
-- Why: the browser-side Purchase fires the moment a COD order is placed, but
-- a real sale is only known when the customer confirms on WhatsApp
-- (updateOrderConfirmationAdmin). To send that later "OrderConfirmed" signal
-- to Meta's Conversions API from the server, we need the identifiers that only
-- exist in the customer's browser at checkout time: fbp/fbc/fbclid, ttp/ttclid,
-- the client IP + user agent, and the page URL.
--
-- Shape (all optional strings): { fbp, fbc, fbclid, ttp, ttclid, event_source_url,
--   ip, ua, purchase_ref, confirmed_event_sent_at }
--   purchase_ref            = order_number of the checkout's first row; the id
--                             the browser Purchase event was sent with
--                             (event_id = purchase_<purchase_ref>)
--   confirmed_event_sent_at = set once when the OrderConfirmed CAPI event is
--                             sent, so it can never be sent twice
--
-- Additive + nullable. The checkout code writes it as a separate best-effort
-- UPDATE after the order insert, so checkout keeps working even before this
-- migration is applied (tracking is just skipped).

alter table orders add column if not exists ad_tracking jsonb;

create index if not exists idx_orders_ad_tracking_purchase_ref
  on orders ((ad_tracking ->> 'purchase_ref'))
  where ad_tracking is not null;
