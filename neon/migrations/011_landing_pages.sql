-- Ad campaign landing pages (/landing/$audience) — one row per fixed
-- audience key (movies/anime/music/cars/decor). Manual mode keeps poster
-- ids as a plain array instead of a join table since only 5 pages exist.
create table if not exists landing_pages (
  id uuid primary key default gen_random_uuid(),
  audience_key text not null unique,
  visible boolean not null default false,
  title_ar text,
  title_en text,
  subtitle_ar text,
  subtitle_en text,
  hero_image text,
  whatsapp_message text,
  cta_text text,
  source_category_id uuid references categories(id) on delete set null,
  display_mode text not null default 'smart_mix',
  poster_limit integer not null default 24,
  manual_poster_ids uuid[] not null default '{}',
  seo_title text,
  meta_description text,
  updated_at timestamptz not null default now()
);
