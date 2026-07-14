
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS show_in_header boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_in_homepage boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_in_collections boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_in_search boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_mockup_style text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS poster_display_mode text NOT NULL DEFAULT 'manual';
