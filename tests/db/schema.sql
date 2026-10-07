-- Minimal stand-in for the production tables, ONLY for testing place_order locally.
-- Column names/types follow supabase/migrations; FKs and RLS are omitted.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

DROP TABLE IF EXISTS public.order_posters, public.orders, public.site_settings CASCADE;
CREATE TABLE public.site_settings (key text PRIMARY KEY, value jsonb);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text NOT NULL, governorate text NOT NULL, address text NOT NULL,
  frame_type text NOT NULL, frame_color text NOT NULL, size text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  selected_poster uuid, poster_title text, poster_image text,
  total_price numeric(10,2) NOT NULL, status text NOT NULL DEFAULT 'new', notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  order_number text, subtotal numeric, shipping_cost numeric NOT NULL DEFAULT 0,
  packaging_fee numeric NOT NULL DEFAULT 0, is_test boolean NOT NULL DEFAULT false,
  guest_session_id text, user_id uuid,
  payment_method text, payment_status text, payment_screenshot text
);
CREATE TABLE public.order_posters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, poster_id uuid,
  poster_title text, poster_image text, position int
);
