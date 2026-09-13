-- Admin-manageable banner slider for the new /photo-printing landing page.
-- Mirrors hero_banners' shape (including the responsive webp/avif srcset
-- columns from migration 015) rather than reusing hero_banners directly,
-- since homepage banners and photo-printing banners are edited by
-- different admin sections and shouldn't share sort order / enablement.
create table if not exists photo_printing_banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  mobile_image_url text,
  webp_srcset text,
  avif_srcset text,
  title text,
  subtitle text,
  button_text text,
  button_link text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
