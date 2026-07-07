
UPDATE public.site_settings
SET value = jsonb_set(value::jsonb, '{image}', '"/__l5e/assets-v1/ed5daf17-b4a0-4979-888a-990ee7d06254/frame-black.png"'::jsonb)
WHERE key = 'frame_mockup_black';

UPDATE public.site_settings
SET value = jsonb_set(value::jsonb, '{image}', '"/__l5e/assets-v1/79ea25cb-11a6-4249-ad91-b14475d5c716/frame-white.png"'::jsonb)
WHERE key = 'frame_mockup_white';

UPDATE public.site_settings
SET value = jsonb_set(value::jsonb, '{image}', '"/__l5e/assets-v1/a520dcd8-f51e-4625-9ac1-ec9703d2a69e/frame-wood.png"'::jsonb)
WHERE key = 'frame_mockup_wood';
