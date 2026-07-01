
CREATE TABLE public.best_sellers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poster_id UUID NOT NULL REFERENCES public.posters(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  pinned BOOLEAN NOT NULL DEFAULT false,
  hidden BOOLEAN NOT NULL DEFAULT false,
  featured BOOLEAN NOT NULL DEFAULT false,
  badge_disabled BOOLEAN NOT NULL DEFAULT false,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (poster_id)
);

CREATE INDEX best_sellers_order_idx ON public.best_sellers (pinned DESC, position ASC);

GRANT SELECT ON public.best_sellers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.best_sellers TO authenticated;
GRANT ALL ON public.best_sellers TO service_role;

ALTER TABLE public.best_sellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view best sellers"
  ON public.best_sellers FOR SELECT
  USING (true);

CREATE POLICY "Admins manage best sellers"
  ON public.best_sellers FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_best_sellers_updated_at
  BEFORE UPDATE ON public.best_sellers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
