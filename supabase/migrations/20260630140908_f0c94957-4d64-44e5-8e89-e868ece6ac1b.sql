
CREATE TABLE public.custom_design_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE,
  customer_name text NOT NULL,
  phone text NOT NULL,
  governorate text NOT NULL,
  address text NOT NULL,
  frame_type text NOT NULL,
  frame_color text NOT NULL,
  size text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  image_paths text[] NOT NULL DEFAULT '{}',
  image_urls text[] NOT NULL DEFAULT '{}',
  unit_price numeric(10,2) NOT NULL,
  subtotal numeric(10,2) NOT NULL,
  shipping_cost numeric(10,2) NOT NULL DEFAULT 0,
  total_price numeric(10,2) NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.custom_design_orders TO anon, authenticated;
GRANT ALL ON public.custom_design_orders TO service_role;

ALTER TABLE public.custom_design_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can place custom design order" ON public.custom_design_orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(trim(customer_name)) > 0 AND length(trim(phone)) > 0
    AND length(trim(address)) > 0 AND length(trim(governorate)) > 0
    AND quantity > 0 AND total_price >= 0 AND status = 'new'
  );

CREATE POLICY "Admins view custom design orders" ON public.custom_design_orders
  FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update custom design orders" ON public.custom_design_orders
  FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete custom design orders" ON public.custom_design_orders
  FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER custom_design_orders_order_number
  BEFORE INSERT ON public.custom_design_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();

CREATE INDEX custom_design_orders_created_at_idx ON public.custom_design_orders (created_at DESC);

-- Storage policies for custom-designs bucket
CREATE POLICY "Anyone can upload custom design files" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'custom-designs');

CREATE POLICY "Admins can read custom design files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'custom-designs' AND private.has_role(auth.uid(), 'admin'::app_role));
