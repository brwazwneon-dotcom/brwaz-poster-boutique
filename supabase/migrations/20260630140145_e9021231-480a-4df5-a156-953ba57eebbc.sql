ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packaging_fee numeric NOT NULL DEFAULT 0;
INSERT INTO public.site_settings (key, value) VALUES ('packaging_fee', '20'::jsonb)
ON CONFLICT (key) DO NOTHING;