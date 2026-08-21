INSERT INTO public.site_settings (key, value)
VALUES (
  'photo_printing_media',
  '{"banners":[],"images":[]}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
