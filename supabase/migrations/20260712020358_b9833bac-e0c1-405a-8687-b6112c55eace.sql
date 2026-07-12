
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.custom_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  title_ar text,
  subtitle text,
  subtitle_ar text,
  size text NOT NULL,
  count int NOT NULL CHECK (count > 0),
  price numeric NOT NULL CHECK (price >= 0),
  image_url text,
  badge text,
  enabled boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.custom_offers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_offers TO authenticated;
GRANT ALL ON public.custom_offers TO service_role;

ALTER TABLE public.custom_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_offers public read enabled"
  ON public.custom_offers FOR SELECT
  USING (enabled = true);

CREATE POLICY "custom_offers admin manage"
  ON public.custom_offers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_custom_offers_updated_at
  BEFORE UPDATE ON public.custom_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
