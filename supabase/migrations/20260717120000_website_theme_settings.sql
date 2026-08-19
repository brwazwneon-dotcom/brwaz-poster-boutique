insert into public.site_settings (key, value)
values
  ('active_theme', '"brw-classic"'::jsonb),
  ('theme_settings', '{"activeTheme":"brw-classic"}'::jsonb)
on conflict (key) do nothing;
