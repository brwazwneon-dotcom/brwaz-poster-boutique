
INSERT INTO public.site_settings (key, value) VALUES
  ('frame_wood_20x30', to_jsonb(190)),
  ('frame_wood_30x40', to_jsonb(270)),
  ('frame_wood_40x50', to_jsonb(400))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
