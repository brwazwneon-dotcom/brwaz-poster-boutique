-- Before/After showcase pairs (homepage, product, photo-printing, custom-design)
-- and per-product extra angle photos. Both existed as live storefront features
-- calling dead Supabase tables with no Neon equivalent yet.
create table if not exists before_after (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  before_url text not null,
  after_url text not null,
  location text not null default 'homepage',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists before_after_location_idx on before_after (location, active, sort_order);

create table if not exists poster_images (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references posters(id) on delete cascade,
  image_url text not null,
  label text,
  kind text,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists poster_images_poster_idx on poster_images (poster_id, sort_order);
