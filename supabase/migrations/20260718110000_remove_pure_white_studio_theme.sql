-- Restore selections changed by the removed Pure White Studio migration.
-- Theme definitions are frontend configuration; this only repairs persisted values.
update public.site_settings
set value = '"brw-classic"'::jsonb
where key = 'active_theme'
  and value = '"pure-white-studio"'::jsonb;

update public.site_settings
set value = jsonb_set(
  jsonb_set(
    value,
    '{activeTheme}',
    case
      when value->>'activeTheme' = 'pure-white-studio' then '"brw-classic"'::jsonb
      else value->'activeTheme'
    end,
    true
  ),
  '{previousTheme}',
  case
    when value->>'previousTheme' = 'pure-white-studio' then '"brw-classic"'::jsonb
    else coalesce(value->'previousTheme', 'null'::jsonb)
  end,
  true
)
where key = 'theme_settings'
  and (value->>'activeTheme' = 'pure-white-studio' or value->>'previousTheme' = 'pure-white-studio');
