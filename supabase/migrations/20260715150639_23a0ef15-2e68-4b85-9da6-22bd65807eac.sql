UPDATE public.site_settings
SET value = jsonb_build_object(
  'emergency_fast_mode', false,
  'safe_mode', false,
  'pause_heavy_jobs', false,
  'disable_preloader', false,
  'max_home_sections', 30,
  'disable_social_proof', false,
  'disable_floating_offer', false,
  'analytics_defer_ms', 3000
)
WHERE key = 'performance_flags';

-- Re-enable recently-viewed and before-after in homepage sections
UPDATE public.site_settings
SET value = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'key' IN ('recently-viewed','before-after')
        THEN jsonb_set(elem, '{enabled}', 'true'::jsonb)
      ELSE elem
    END
  )
  FROM jsonb_array_elements(value) elem
)
WHERE key = 'homepage_sections_v1';