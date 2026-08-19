ALTER TABLE public.collection_showcase_settings
ADD COLUMN IF NOT EXISTS mockup_style text NOT NULL DEFAULT 'black';

ALTER TABLE public.collection_showcase_settings
DROP CONSTRAINT IF EXISTS collection_showcase_settings_mockup_style_check;

ALTER TABLE public.collection_showcase_settings
ADD CONSTRAINT collection_showcase_settings_mockup_style_check
CHECK (mockup_style IN ('black', 'white', 'random', 'global'));
