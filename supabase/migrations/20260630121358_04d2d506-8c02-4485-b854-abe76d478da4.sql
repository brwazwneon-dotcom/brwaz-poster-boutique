INSERT INTO public.site_settings (key, value) VALUES
  ('frame_mockup_black', '{"image":"","top":8,"left":8,"width":84,"height":84}'::jsonb),
  ('frame_mockup_white', '{"image":"","top":8,"left":8,"width":84,"height":84}'::jsonb),
  ('frame_mockup_wood',  '{"image":"","top":10,"left":10,"width":80,"height":80}'::jsonb)
ON CONFLICT (key) DO NOTHING;