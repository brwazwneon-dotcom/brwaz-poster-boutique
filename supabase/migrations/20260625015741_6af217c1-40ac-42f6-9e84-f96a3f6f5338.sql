
CREATE TABLE public.photo_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text NOT NULL,
  governorate text NOT NULL,
  address text NOT NULL,
  size text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 20),
  unit_price integer NOT NULL,
  total_price integer NOT NULL,
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_orders TO authenticated;
GRANT INSERT ON public.photo_orders TO anon;
GRANT ALL ON public.photo_orders TO service_role;

ALTER TABLE public.photo_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit photo orders"
  ON public.photo_orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(customer_name) BETWEEN 1 AND 120
    AND char_length(phone) BETWEEN 5 AND 30
    AND char_length(address) BETWEEN 1 AND 500
    AND quantity >= 20
    AND total_price >= 0
  );

CREATE POLICY "Admins can view photo orders"
  ON public.photo_orders FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update photo orders"
  ON public.photo_orders FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete photo orders"
  ON public.photo_orders FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_photo_orders_updated_at
  BEFORE UPDATE ON public.photo_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_photo_orders_created_at ON public.photo_orders (created_at DESC);
