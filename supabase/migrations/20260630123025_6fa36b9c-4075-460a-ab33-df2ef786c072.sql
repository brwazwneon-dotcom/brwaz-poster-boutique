
INSERT INTO public.site_settings (key, value) VALUES
  ('frame_mockup_black', '{"image":"/__l5e/assets-v1/077e52ac-7064-40c5-ae7a-8554294aa859/frame-black.png","top":9,"left":10.5,"width":79,"height":76}'::jsonb),
  ('frame_mockup_white', '{"image":"/__l5e/assets-v1/04113ead-db29-47e4-a2bd-4b3c5c7de8d9/frame-white.png","top":9,"left":10,"width":80,"height":76}'::jsonb),
  ('frame_mockup_wood',  '{"image":"/__l5e/assets-v1/cc51cbcf-0e73-4306-9cd5-530269f60005/frame-wood.png","top":11,"left":13,"width":75,"height":80}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
