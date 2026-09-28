-- Merchandising: multi-category placement, manual Best Seller ordering,
-- optional Trending scheduling, and dual-category homepage sections.
--
-- Strictly additive and idempotent: every column is nullable with a safe
-- default, every table is CREATE ... IF NOT EXISTS. No existing table is
-- rewritten, no row is touched, nothing is dropped. Existing posters keep
-- appearing exactly as they do today (driven by posters.category_id,
-- .trending, .is_best_seller — all unchanged) until an admin opts a poster
-- into the new placement controls.

-- ---------------------------------------------------------------
-- poster_categories — ADDITIONAL categories/subcategories a poster also
-- shows in, on top of its existing primary posters.category_id (which
-- stays the single source of truth for "the" category a poster belongs
-- to — nothing here replaces it). A poster with zero rows here behaves
-- exactly as before: visible only via its primary category.
-- ---------------------------------------------------------------
create table if not exists poster_categories (
  poster_id    uuid not null references posters(id) on delete cascade,
  category_id  uuid not null references categories(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (poster_id, category_id)
);
create index if not exists idx_poster_categories_category on poster_categories(category_id);

-- ---------------------------------------------------------------
-- posters: optional manual override for Best Seller position (mirrors the
-- existing trending_order pattern exactly). Best Sellers today are
-- ordered by sales_count desc (see db-catalog.server.ts) — that logic is
-- UNCHANGED; a poster with best_seller_order left null keeps sorting by
-- sales as it does now. Setting it just pins that poster to a fixed spot
-- ahead of the sales-ranked ones.
--
-- trending_starts_at / trending_ends_at: optional scheduling window for
-- the existing `trending` flag. Both null (today's default for every
-- existing row) means "show whenever trending = true", identical to
-- current behavior.
-- ---------------------------------------------------------------
alter table posters add column if not exists best_seller_order integer;
alter table posters add column if not exists trending_starts_at timestamptz;
alter table posters add column if not exists trending_ends_at timestamptz;

create index if not exists idx_posters_best_seller_order
  on posters(best_seller_order) where is_best_seller = true;

-- ---------------------------------------------------------------
-- dual_category_sections — admin-defined "Category A + Category B" side
-- by side homepage blocks (e.g. Movies + Football). Fully dynamic: any
-- number of rows, each naming its own two posters/categories/titles —
-- nothing here is hard-coded to a specific pair. Rendered by a new
-- "dual-category" entry in the existing homepage-sections registry, so
-- its on/off + position in the homepage flow reuses the same admin
-- Homepage Layout screen everything else already uses; sort_order below
-- only orders the pairs AMONG each other when more than one is enabled.
-- ---------------------------------------------------------------
create table if not exists dual_category_sections (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  left_poster_id     uuid references posters(id) on delete set null,
  left_category_id   uuid references categories(id) on delete set null,
  left_title         text,
  left_button_text   text,
  right_poster_id    uuid references posters(id) on delete set null,
  right_category_id  uuid references categories(id) on delete set null,
  right_title        text,
  right_button_text  text,
  enabled            boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_dual_category_sections_enabled
  on dual_category_sections(enabled, sort_order);
