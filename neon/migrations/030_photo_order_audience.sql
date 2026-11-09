-- Which audience (poster buyers "youth" / photo printers "album") a photo order came from.
-- Shape: {"first": "youth"|"album"|null, "last": "youth"|"album"|null}. Nullable: older orders have none.
-- Safe to run more than once. The app writes this column best-effort AFTER the order is saved, so an order is never
-- lost or delayed if this migration has not been applied yet.
alter table photo_4x6_orders add column if not exists audience jsonb;
