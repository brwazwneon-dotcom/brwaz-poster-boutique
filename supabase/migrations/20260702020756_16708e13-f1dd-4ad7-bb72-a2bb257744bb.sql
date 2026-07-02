
INSERT INTO public.site_settings (key, value)
VALUES
  ('instapay_config', jsonb_build_object('enabled', true, 'phone', '01090771294', 'handle', '01090771294', 'display_name', 'BRWAZWNEON')),
  ('vodafone_config', jsonb_build_object('enabled', true, 'phone', '01090771294', 'number', '01090771294', 'display_name', 'BRWAZWNEON'))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
