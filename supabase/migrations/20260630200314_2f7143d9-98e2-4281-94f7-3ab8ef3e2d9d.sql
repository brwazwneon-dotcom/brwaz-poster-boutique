CREATE TABLE IF NOT EXISTS public.marketing_secrets (
  id INT PRIMARY KEY DEFAULT 1,
  meta_capi_access_token TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_secrets_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.marketing_secrets TO authenticated;
GRANT ALL ON public.marketing_secrets TO service_role;

ALTER TABLE public.marketing_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_secrets admin read"
ON public.marketing_secrets FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "marketing_secrets admin write"
ON public.marketing_secrets FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.marketing_secrets (id) VALUES (1) ON CONFLICT (id) DO NOTHING;