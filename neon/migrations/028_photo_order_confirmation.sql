-- WhatsApp confirmation tracking for photo-printing orders, the same status
-- framed-poster orders already have (see 020_order_confirmation_and_timeline.sql):
-- not_sent | prepared | sent | customer_confirmed | customer_rejected | waiting_for_response.
-- Values are validated in the app layer (VALID_CONFIRMATION_STATUSES), matching
-- orders.confirmation_status which has no CHECK constraint either.
--
-- Additive and idempotent: new columns only, existing rows get 'not_sent' / null,
-- nothing existing is changed. Adding a column with a constant default is a
-- metadata-only change in Postgres 11+ (no table rewrite, no long lock).

alter table photo_4x6_orders
  add column if not exists confirmation_status text not null default 'not_sent',
  add column if not exists confirmed_at timestamptz;

alter table photo_orders
  add column if not exists confirmation_status text not null default 'not_sent',
  add column if not exists confirmed_at timestamptz;
