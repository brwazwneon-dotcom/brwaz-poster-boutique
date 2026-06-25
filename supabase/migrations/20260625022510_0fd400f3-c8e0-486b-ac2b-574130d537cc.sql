
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number text UNIQUE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.photo_orders ADD COLUMN IF NOT EXISTS order_number text UNIQUE;
ALTER TABLE public.photo_orders ADD COLUMN IF NOT EXISTS shipping_cost numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'BRW-' || LPAD(nextval('public.order_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_order_number ON public.orders;
CREATE TRIGGER orders_order_number BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();

DROP TRIGGER IF EXISTS photo_orders_order_number ON public.photo_orders;
CREATE TRIGGER photo_orders_order_number BEFORE INSERT ON public.photo_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();

CREATE TABLE IF NOT EXISTS public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_settings read" ON public.site_settings;
CREATE POLICY "site_settings read" ON public.site_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "site_settings admin write" ON public.site_settings;
CREATE POLICY "site_settings admin write" ON public.site_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

INSERT INTO public.site_settings (key, value) VALUES
  ('shipping_fee', '89'::jsonb),
  ('free_shipping_threshold', '1600'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.slider_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  title text,
  link_url text,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.slider_images TO anon, authenticated;
GRANT ALL ON public.slider_images TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.slider_images TO authenticated;
ALTER TABLE public.slider_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "slider read" ON public.slider_images;
CREATE POLICY "slider read" ON public.slider_images FOR SELECT USING (true);
DROP POLICY IF EXISTS "slider admin write" ON public.slider_images;
CREATE POLICY "slider admin write" ON public.slider_images FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
