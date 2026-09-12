-- Photo printing + 4x6 printing orders. These flows were still calling
-- Supabase directly (storage.upload + table insert) after the Neon
-- migration, which silently broke order submission once the old Supabase
-- project became inaccessible — this migration plus the accompanying
-- code changes restore them on Neon + Vercel Blob.
CREATE TABLE IF NOT EXISTS photo_4x6_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number       text UNIQUE,
  customer_name      text NOT NULL,
  phone              text NOT NULL,
  governorate        text NOT NULL,
  address            text NOT NULL,
  package_key        text NOT NULL,
  photo_count        integer NOT NULL,
  total_price        numeric(10,2) NOT NULL,
  notes              text,
  original_paths     text[] NOT NULL DEFAULT '{}',
  enhanced_paths     text[] NOT NULL DEFAULT '{}',
  suit_paths         text[] NOT NULL DEFAULT '{}',
  selected_versions  jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             text NOT NULL DEFAULT 'new',
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photo_4x6_orders_created ON photo_4x6_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_4x6_orders_phone ON photo_4x6_orders(phone);

CREATE TRIGGER photo_4x6_orders_assign_number
  BEFORE INSERT ON photo_4x6_orders
  FOR EACH ROW EXECUTE FUNCTION assign_order_number();

CREATE TABLE IF NOT EXISTS photo_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number   text UNIQUE,
  customer_name  text NOT NULL,
  phone          text NOT NULL,
  governorate    text NOT NULL,
  address        text NOT NULL,
  size           text NOT NULL,
  quantity       integer NOT NULL CHECK (quantity > 0),
  unit_price     numeric(10,2) NOT NULL,
  total_price    numeric(10,2) NOT NULL,
  shipping_cost  numeric(10,2) NOT NULL DEFAULT 0,
  photo_urls     text[] NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'new',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photo_orders_created ON photo_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_orders_phone ON photo_orders(phone);

CREATE TRIGGER photo_orders_assign_number
  BEFORE INSERT ON photo_orders
  FOR EACH ROW EXECUTE FUNCTION assign_order_number();
