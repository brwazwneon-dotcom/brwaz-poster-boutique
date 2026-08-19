-- Make Pure White Studio the official light storefront without overriding
-- an administrator's existing theme selection.
update public.site_settings
set value = '"pure-white-studio"'::jsonb
where key = 'active_theme'
  and value = '"brw-classic"'::jsonb;

update public.site_settings
set value = '{"activeTheme":"pure-white-studio"}'::jsonb
where key = 'theme_settings'
  and value->>'activeTheme' = 'brw-classic';
