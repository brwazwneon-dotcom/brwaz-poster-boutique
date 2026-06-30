
INSERT INTO public.site_settings (key, value) VALUES
  ('frame_mockup_black', '{"image":"/__l5e/assets-v1/ed5daf17-b4a0-4979-888a-990ee7d06254/frame-black.png","top":13.59,"left":14.19,"width":71.63,"height":70.78}'::jsonb),
  ('frame_mockup_white', '{"image":"/__l5e/assets-v1/79ea25cb-11a6-4249-ad91-b14475d5c716/frame-white.png","top":13.83,"left":14.07,"width":71.40,"height":70.47}'::jsonb),
  ('frame_mockup_wood',  '{"image":"/__l5e/assets-v1/a520dcd8-f51e-4625-9ac1-ec9703d2a69e/frame-wood.png","top":14.06,"left":17.72,"width":69.72,"height":74.06}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
