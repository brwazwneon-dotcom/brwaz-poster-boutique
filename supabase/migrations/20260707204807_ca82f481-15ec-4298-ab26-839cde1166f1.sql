UPDATE public.site_settings
SET value = CASE key
  WHEN 'frame_mockup_black' THEN '{"image":"/assets/mockups/frame-black.png","top":13.59,"left":14.19,"width":71.63,"height":70.78}'::jsonb
  WHEN 'frame_mockup_white' THEN '{"image":"/assets/mockups/frame-white.png","top":13.83,"left":14.07,"width":71.40,"height":70.47}'::jsonb
  WHEN 'frame_mockup_wood' THEN '{"image":"/assets/mockups/frame-wood.png","top":14.06,"left":17.72,"width":69.72,"height":74.06}'::jsonb
END
WHERE key IN ('frame_mockup_black', 'frame_mockup_white', 'frame_mockup_wood');