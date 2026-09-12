-- =========================================================
-- BRWAZWNEON 2.0 — Neon Postgres schema (Phase 1)
-- =========================================================
-- Scope: the tables needed to launch the storefront + a basic admin
-- (products, categories, orders) per Phase 1-3 of the rebuild plan.
-- Everything else the old system had (reviews, wishlists, analytics,
-- visitor tracking, campaigns, best-sellers automation, backups...) is
-- Phase 4 — deliberately not here yet, so this stays reviewable and
-- launches fast instead of blocking on 90+ tables at once.
--
-- Column names/types match what the existing (kept) frontend code
-- already expects (verified against src/integrations/supabase/types.ts
-- and the actual .select()/.insert() calls in the route files) — the
-- goal is that Phase 2's server-function rewrite changes HOW data is
-- fetched (Neon via a server function, not a direct client REST call),
-- not the SHAPE of the data, so as little UI code as possible needs to
-- change.
--
-- No RLS here on purpose: Neon has no PostgREST layer exposing tables
-- directly to the browser, so there is no anonymous client role to write
-- row-security policies for. Every access path is a TanStack Start
-- server function running with one trusted database connection —
-- authorization (is this caller an admin? does this order belong to
-- this phone number?) is enforced in that server-function code, not in
-- the database. See neon/README.md for that layer.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------
-- categories
-- ---------------------------------------------------------
CREATE TABLE categories (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  name_ar               text,
  slug                  text NOT NULL UNIQUE,
  description           text,
  image                 text,
  icon                  text,
  parent_id             uuid REFERENCES categories(id) ON DELETE SET NULL,
  sort_order            integer NOT NULL DEFAULT 0,
  sort_mode             text NOT NULL DEFAULT 'manual',
  status                text NOT NULL DEFAULT 'published',
  hidden                boolean NOT NULL DEFAULT false,
  featured              boolean NOT NULL DEFAULT false,
  show_in_header        boolean NOT NULL DEFAULT true,
  show_in_homepage      boolean NOT NULL DEFAULT true,
  show_in_collections   boolean NOT NULL DEFAULT true,
  show_in_search        boolean NOT NULL DEFAULT true,
  default_mockup_style  text NOT NULL DEFAULT 'auto',
  poster_display_mode   text NOT NULL DEFAULT 'manual',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);

-- ---------------------------------------------------------
-- posters (products)
-- ---------------------------------------------------------
CREATE TABLE posters (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text NOT NULL,
  slug                 text NOT NULL UNIQUE,
  description          text,
  image_url            text NOT NULL,
  original_url         text,
  category_id          uuid REFERENCES categories(id) ON DELETE SET NULL,
  tags                 text[] NOT NULL DEFAULT '{}',
  colors               text[],
  hashtags             text[],
  badge                text,
  alt_text             text,
  seo_title            text,
  seo_description      text,
  orientation          text,
  edit_settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  hidden               boolean NOT NULL DEFAULT false,
  featured             boolean NOT NULL DEFAULT false,
  pinned               boolean NOT NULL DEFAULT false,
  trending             boolean NOT NULL DEFAULT false,
  trending_order       integer,
  is_best_seller       boolean NOT NULL DEFAULT false,
  review_status        text NOT NULL DEFAULT 'approved',
  sort_order           integer NOT NULL DEFAULT 0,
  sales_count          integer NOT NULL DEFAULT 0,
  views_count          integer NOT NULL DEFAULT 0,
  unique_views_count   integer NOT NULL DEFAULT 0,
  cart_adds_count      integer NOT NULL DEFAULT 0,
  total_view_seconds   integer NOT NULL DEFAULT 0,
  last_viewed_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_posters_category ON posters(category_id) WHERE hidden = false;
CREATE INDEX idx_posters_slug ON posters(slug);
CREATE INDEX idx_posters_trending ON posters(trending, trending_order) WHERE hidden = false;
CREATE INDEX idx_posters_tags ON posters USING gin(tags);

-- ---------------------------------------------------------
-- image_variants — optimized image derivatives (thumb/small/medium/large
-- x avif/webp), unchanged in shape from the current system.
-- ---------------------------------------------------------
CREATE TABLE image_variants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table   text NOT NULL,
  source_id      uuid,
  variant        text NOT NULL,          -- e.g. 'thumb_avif', 'medium_webp'
  bucket         text NOT NULL DEFAULT 'posters',
  original_path  text NOT NULL,
  variant_path   text,
  url            text,
  format         text,
  width          integer,
  height         integer,
  size_bytes     integer,
  status         text NOT NULL DEFAULT 'pending',
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_image_variants_source ON image_variants(source_table, source_id, status);

-- ---------------------------------------------------------
-- site_settings — every admin-configurable value (pricing, shipping,
-- feature flags, theme, frame mockup positions...) as key/value JSON,
-- same pattern as today so use-settings.ts barely has to change.
-- ---------------------------------------------------------
CREATE TABLE site_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- orders — one row per cart line item at checkout (matches the current
-- system: a 3-item cart submits 3 rows sharing customer/phone/address).
-- order_number is a short human-facing sequence, assigned on insert.
-- ---------------------------------------------------------
CREATE SEQUENCE order_number_seq START 1000;

CREATE TABLE orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number         text UNIQUE,
  customer_name        text NOT NULL,
  phone                text NOT NULL,
  governorate          text NOT NULL,
  address              text NOT NULL,
  frame_type           text NOT NULL,
  frame_color          text NOT NULL,
  size                 text NOT NULL,
  quantity             integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  selected_poster      uuid REFERENCES posters(id) ON DELETE SET NULL,
  poster_title         text,
  poster_image         text,
  subtotal             numeric(10,2),
  packaging_fee        numeric(10,2) NOT NULL DEFAULT 0,
  shipping_cost        numeric(10,2) NOT NULL DEFAULT 0,
  total_price          numeric(10,2) NOT NULL,
  status               text NOT NULL DEFAULT 'new',
  payment_method       text NOT NULL DEFAULT 'cod',
  payment_status       text NOT NULL DEFAULT 'not_required',
  payment_reference    text,
  payment_screenshot   text,
  payment_notes        text,
  payment_verified_at  timestamptz,
  notes                text,
  guest_session_id     text,
  is_test              boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_phone ON orders(phone);
CREATE INDEX idx_orders_status ON orders(status);

CREATE OR REPLACE FUNCTION assign_order_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'BRW-' || nextval('order_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_assign_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION assign_order_number();

-- Same server-side price-integrity guard shipped for the old database
-- (supabase/migrations/20260911120000_...), carried over unchanged —
-- the fraud vector it closes has nothing to do with which Postgres
-- host the table lives on.
CREATE OR REPLACE FUNCTION guard_order_price()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  max_discount_ratio CONSTANT numeric := 0.55;
  default_prices CONSTANT jsonb := '{
    "frame_pvc_20x30": 190, "frame_pvc_30x40": 250, "frame_pvc_40x50": 350,
    "frame_wood_20x30": 190, "frame_wood_30x40": 270, "frame_wood_40x50": 400,
    "frame_wood_40x60": 450, "frame_wood_50x60": 500, "frame_wood_50x70": 580,
    "frame_wood_60x90": 850, "frame_wood_100x60": 950,
    "double_face_tape_price": 20
  }'::jsonb;
  frame_key text; size_key text; settings_key text;
  catalog_price numeric; qty numeric; floor_amount numeric; computed_total numeric;
  effective_subtotal numeric;
BEGIN
  qty := GREATEST(COALESCE(NEW.quantity, 1), 1);
  effective_subtotal := COALESCE(NEW.subtotal, NEW.total_price);

  IF COALESCE(effective_subtotal, 0) <= 0 OR NEW.total_price IS NULL OR NEW.total_price <= 0
     OR COALESCE(NEW.packaging_fee, 0) < 0 OR COALESCE(NEW.shipping_cost, 0) < 0 THEN
    RAISE EXCEPTION 'BRWAZ price guard: order amounts must be positive';
  END IF;

  computed_total := effective_subtotal + COALESCE(NEW.packaging_fee, 0) + COALESCE(NEW.shipping_cost, 0);
  IF ABS(computed_total - NEW.total_price) > 1.0 THEN
    RAISE EXCEPTION 'BRWAZ price guard: total_price (%) does not equal subtotal + fees (%)', NEW.total_price, computed_total;
  END IF;

  IF NEW.poster_title IS NOT DISTINCT FROM 'Double Face Tape' THEN
    SELECT COALESCE((SELECT (value)::text::numeric FROM site_settings WHERE key = 'double_face_tape_price'),
                     (default_prices ->> 'double_face_tape_price')::numeric) INTO catalog_price;
    IF catalog_price IS NOT NULL AND catalog_price > 0 THEN
      floor_amount := ROUND(catalog_price * qty * (1 - max_discount_ratio), 2);
      IF effective_subtotal < floor_amount THEN
        RAISE EXCEPTION 'BRWAZ price guard: Double Face Tape subtotal below floor';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  frame_key := CASE NEW.frame_type WHEN 'High Quality PVC' THEN 'pvc' WHEN 'Wooden Portrait' THEN 'wood' ELSE NULL END;
  size_key := CASE NEW.size
    WHEN '20 x 30 cm' THEN '20x30' WHEN '30 x 40 cm' THEN '30x40' WHEN '40 x 50 cm' THEN '40x50'
    WHEN '40 x 60 cm' THEN '40x60' WHEN '50 x 60 cm' THEN '50x60' WHEN '50 x 70 cm' THEN '50x70'
    WHEN '60 x 90 cm' THEN '60x90' WHEN '100 x 60 cm' THEN '100x60' ELSE NULL END;

  IF frame_key IS NULL OR size_key IS NULL THEN
    RETURN NEW; -- unrecognized combo: don't block, log at the app layer instead
  END IF;

  settings_key := 'frame_' || frame_key || '_' || size_key;
  SELECT COALESCE((SELECT (value)::text::numeric FROM site_settings WHERE key = settings_key),
                   (default_prices ->> settings_key)::numeric) INTO catalog_price;

  IF catalog_price IS NULL OR catalog_price <= 0 THEN
    RETURN NEW;
  END IF;

  floor_amount := ROUND(catalog_price * qty * (1 - max_discount_ratio), 2);
  IF effective_subtotal < floor_amount THEN
    RAISE EXCEPTION 'BRWAZ price guard: subtotal (%) below floor (%) for % / % x %',
      effective_subtotal, floor_amount, NEW.frame_type, NEW.size, qty;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_price_guard
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_order_price();

-- ---------------------------------------------------------
-- admin_users — replaces Supabase Auth. This business has exactly one
-- real admin account today, so a small dedicated table + a hand-rolled
-- session (see neon/README.md) is simpler and easier to reason about
-- than pulling in a full auth library for one user.
-- ---------------------------------------------------------
CREATE TABLE admin_users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,      -- bcrypt/argon2, set by the app, never plaintext
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);
