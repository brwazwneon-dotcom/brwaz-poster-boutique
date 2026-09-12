import { sql } from "@/lib/neon.server";
import type { Category } from "@/lib/use-categories";

// A concrete, recursively-serializable JSON type — TanStack Start's
// server-function return-type check needs every property to resolve to
// something it can prove is serializable; a bare `unknown` (structurally
// correct for a jsonb column, but opaque to that check) fails it even
// though the actual runtime values are always plain JSON.
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export async function fetchCategoriesFromDb(): Promise<Category[]> {
  const rows = await sql()`
    select id, name, name_ar, slug, image, sort_order, parent_id, description,
           icon, hidden, featured, status, show_in_header, show_in_homepage,
           show_in_collections, show_in_search, default_mockup_style,
           poster_display_mode, sort_mode
    from categories
    order by sort_order asc, name asc
  `;
  return rows as unknown as Category[];
}

export type DbPoster = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  image_url: string;
  category_id: string | null;
  tags: string[];
  badge: string | null;
  sales_count: number;
  views_count: number;
  is_best_seller: boolean;
  hidden: boolean;
  trending: boolean;
  trending_order: number | null;
  pinned: boolean;
  sort_order: number;
  created_at: string;
  edit_settings: Json;
  seo_title: string | null;
  seo_description: string | null;
  alt_text: string | null;
};

export async function fetchPosterBySlugFromDb(slug: string): Promise<DbPoster | null> {
  const rows = await sql()`
    select id, title, slug, description, image_url, category_id, tags, badge,
           sales_count, views_count, is_best_seller, hidden, trending,
           trending_order, pinned, sort_order, created_at, edit_settings,
           seo_title, seo_description, alt_text
    from posters
    where slug = ${slug} and hidden = false
    limit 1
  `;
  return (rows[0] as unknown as DbPoster) ?? null;
}

export type CategorySortKey =
  | "newest"
  | "popular"
  | "bestselling"
  | "az"
  | "manual"
  | "trending"
  | "random"
  | "ai";

// Fixed, non-user-controlled whitelist — the neon() tagged template
// doesn't support composing raw SQL fragments (${} always binds as a
// parameter, which Postgres can't use for a column/direction name), so
// ORDER BY is built as a literal string picked from this map, then run
// via sql(text, params) with real placeholders for the actual values.
const SORT_ORDER_BY: Record<CategorySortKey, string> = {
  newest: "created_at desc",
  popular: "pinned desc, views_count desc",
  bestselling: "pinned desc, sales_count desc",
  az: "pinned desc, title asc",
  manual: "pinned desc, sort_order asc, created_at desc",
  trending: "trending desc, views_count desc",
  random: "id desc",
  ai: "sales_count desc, views_count desc",
};

export async function fetchPostersByCategoryFromDb(
  categoryIds: string[],
  opts: { offset?: number; limit?: number; sort?: CategorySortKey } = {},
): Promise<DbPoster[]> {
  if (categoryIds.length === 0) return [];
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 24;
  const orderBy = SORT_ORDER_BY[opts.sort ?? "newest"] ?? SORT_ORDER_BY.newest;

  const rows = await sql()(
    `select id, title, slug, description, image_url, category_id, tags, badge,
            sales_count, views_count, is_best_seller, hidden, trending,
            trending_order, pinned, sort_order, created_at, edit_settings,
            seo_title, seo_description, alt_text
     from posters
     where category_id = any($1) and hidden = false
     order by ${orderBy}
     offset $2 limit $3`,
    [categoryIds, offset, limit],
  );
  return rows as unknown as DbPoster[];
}

export type DbBestSellerRow = {
  id: string;
  poster_id: string;
  position: number;
  posters: {
    id: string;
    title: string;
    image_url: string;
    badge: string | null;
    category_id: string | null;
    hidden: boolean;
    sales_count: number | null;
    views_count: number | null;
    created_at: string;
    categories: { name: string; slug: string } | null;
  } | null;
};

// Best Sellers reuses the existing `posters.is_best_seller` flag rather
// than the old system's separate pinned/scheduled bundle table — simpler,
// and the admin bulk-toggle is enough for how this store actually curates
// this list. Shaped like the old curated-table rows (`posters` nested
// object) so the storefront route didn't need a rewrite.
export async function fetchBestSellersFromDb(): Promise<DbBestSellerRow[]> {
  const rows = await sql()`
    select p.id, p.title, p.image_url, p.badge, p.category_id, p.hidden,
           p.sales_count, p.views_count, p.created_at,
           c.name as category_name, c.slug as category_slug
    from posters p
    left join categories c on c.id = p.category_id
    where p.is_best_seller = true and p.hidden = false
    order by p.sales_count desc nulls last, p.created_at desc
    limit 200
  `;
  return (
    rows as unknown as Array<{
      id: string;
      title: string;
      image_url: string;
      badge: string | null;
      category_id: string | null;
      hidden: boolean;
      sales_count: number | null;
      views_count: number | null;
      created_at: string;
      category_name: string | null;
      category_slug: string | null;
    }>
  ).map((r, i) => ({
    id: r.id,
    poster_id: r.id,
    position: i,
    posters: {
      id: r.id,
      title: r.title,
      image_url: r.image_url,
      badge: r.badge,
      category_id: r.category_id,
      hidden: r.hidden,
      sales_count: r.sales_count,
      views_count: r.views_count,
      created_at: r.created_at,
      categories: r.category_slug ? { name: r.category_name ?? "", slug: r.category_slug } : null,
    },
  }));
}

export async function fetchTrendingPostersFromDb(): Promise<DbPoster[]> {
  const rows = await sql()`
    select id, title, slug, description, image_url, category_id, tags, badge,
           sales_count, views_count, is_best_seller, hidden, trending,
           trending_order, pinned, sort_order, created_at, edit_settings,
           seo_title, seo_description, alt_text
    from posters
    where trending = true and hidden = false
    order by trending_order asc nulls last, created_at desc
    limit 100
  `;
  return rows as unknown as DbPoster[];
}

// TEMPORARY (Phase 1, no image_variants pipeline yet): a plain lookup of
// each poster's own image_url, used everywhere the old system looked up a
// generated thumbnail/medium/large variant instead. See the comment on
// usePosterImageVariants in src/lib/public-images.ts.
export async function fetchPosterImagesByIdsFromDb(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await sql()`
    select id, image_url from posters where id = any(${ids})
  `;
  const out: Record<string, string> = {};
  for (const row of rows as Array<{ id: string; image_url: string | null }>) {
    if (row.image_url) out[row.id] = row.image_url;
  }
  return out;
}

export type RoomArtworkRow = { id: string; title: string; image_url: string };

// Simplified vs. the old Supabase version (which ranked candidates from a
// separate best_sellers table + image_variants for responsive srcsets):
// no best_sellers table or variants pipeline exist on Neon yet, so this
// just picks a best-seller/trending poster with an image, falling back to
// any visible poster. Good enough for a homepage decorative widget.
export async function fetchRoomTransformationArtworkFromDb(
  posterId: string | null,
): Promise<RoomArtworkRow | null> {
  if (posterId) {
    const rows = await sql()`
      select id, title, image_url from posters where id = ${posterId} and hidden = false limit 1
    `;
    const row = rows[0] as RoomArtworkRow | undefined;
    if (row) return row;
  }
  const preferred = await sql()`
    select id, title, image_url from posters
    where hidden = false and (is_best_seller = true or trending = true) and image_url is not null
    order by sales_count desc nulls last limit 1
  `;
  if (preferred[0]) return preferred[0] as RoomArtworkRow;
  const fallback = await sql()`
    select id, title, image_url from posters
    where hidden = false and image_url is not null
    order by created_at desc limit 1
  `;
  return (fallback[0] as RoomArtworkRow) ?? null;
}

// Poster interaction counters — replaces the old Supabase RPC functions
// (increment_poster_views, increment_poster_unique_views,
// increment_poster_cart_adds, increment_poster_sales,
// add_poster_view_seconds) with plain UPDATE statements against the same
// columns already on the `posters` table.
export async function incrementPosterViewsInDb(id: string): Promise<void> {
  await sql()`update posters set views_count = views_count + 1 where id = ${id}`;
}

export async function incrementPosterUniqueViewsInDb(id: string): Promise<void> {
  await sql()`update posters set unique_views_count = unique_views_count + 1 where id = ${id}`;
}

export async function incrementPosterCartAddsInDb(ids: string[], qty: number): Promise<void> {
  if (ids.length === 0) return;
  await sql()`update posters set cart_adds_count = cart_adds_count + ${qty} where id = any(${ids})`;
}

export async function incrementPosterSalesInDb(ids: string[], qty: number): Promise<void> {
  if (ids.length === 0) return;
  await sql()`update posters set sales_count = sales_count + ${qty} where id = any(${ids})`;
}

export async function addPosterViewSecondsInDb(id: string, seconds: number): Promise<void> {
  await sql()`update posters set total_view_seconds = total_view_seconds + ${seconds} where id = ${id}`;
}

export type HomeTrendingCandidate = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  trending: boolean | null;
  trending_order: number | null;
  featured: boolean | null;
  is_best_seller: boolean | null;
  review_status: string | null;
  views_count: number | null;
  created_at: string | null;
  categories: { name: string | null; slug: string | null } | null;
};

// Backs the homepage "Trending Now" carousel — candidates are trending,
// best-seller, or featured posters (plus any admin-pinned manual IDs),
// deduped/ranked client-side by the existing pure sort logic in
// TrendingNow.tsx. review_status/pinned/badge columns from the old
// Supabase catalog were never carried into Neon's simpler posters
// table, so those checks are dropped — hidden is the only gate here.
export async function fetchHomeTrendingCandidatesFromDb(
  manualIds: string[],
  limit: number,
): Promise<HomeTrendingCandidate[]> {
  const rows = await sql()(
    `select p.id, p.title, p.image_url, p.category_id, p.trending, p.trending_order,
            p.featured, p.is_best_seller, p.views_count, p.created_at,
            c.name as category_name, c.slug as category_slug
     from posters p
     left join categories c on c.id = p.category_id
     where p.hidden = false and p.image_url is not null and p.image_url <> ''
       and (p.trending = true or p.is_best_seller = true or p.featured = true or p.id = any($1))
     order by p.trending desc, p.trending_order asc nulls last, p.views_count desc nulls last, p.created_at desc
     limit $2`,
    [manualIds, limit],
  );
  return (
    rows as unknown as Array<{
      id: string;
      title: string;
      image_url: string;
      category_id: string | null;
      trending: boolean | null;
      trending_order: number | null;
      featured: boolean | null;
      is_best_seller: boolean | null;
      views_count: number | null;
      created_at: string | null;
      category_name: string | null;
      category_slug: string | null;
    }>
  ).map((r) => ({
    id: r.id,
    title: r.title,
    image_url: r.image_url,
    category_id: r.category_id,
    trending: r.trending,
    trending_order: r.trending_order,
    featured: r.featured,
    is_best_seller: r.is_best_seller,
    review_status: "ready",
    views_count: r.views_count,
    created_at: r.created_at,
    categories: r.category_slug ? { name: r.category_name, slug: r.category_slug } : null,
  }));
}

export type ShowcaseProductRow = {
  id: string;
  title: string;
  category_id: string | null;
  image_url: string | null;
  original_url: string | null;
  orientation: string | null;
  featured: boolean | null;
  is_best_seller: boolean | null;
  pinned: boolean | null;
  views_count: number | null;
  cart_adds_count: number | null;
  sales_count: number | null;
  created_at: string | null;
};

// Backs the homepage "Shop by Collection" AND "Category grids" sections'
// auto cover-image selection. The old Supabase version also supported an
// admin-curated manual override (collection_showcase_settings/
// collection_showcase_images tables) and an image_variants-based
// responsive srcset — neither exists on Neon (no admin UI was ever built
// to manage per-collection covers), so this always runs the "auto" path:
// rank visible posters in the given categories and let the caller pick
// top N, using image_url directly.
export async function fetchShowcaseProductsForCategoriesFromDb(
  categoryIds: string[],
): Promise<ShowcaseProductRow[]> {
  if (categoryIds.length === 0) return [];
  const rows = await sql()`
    select id, title, category_id, image_url, original_url, orientation,
           featured, is_best_seller, pinned, views_count, cart_adds_count,
           sales_count, created_at
    from posters
    where category_id = any(${categoryIds}) and hidden = false
    limit 2500
  `;
  return rows as unknown as ShowcaseProductRow[];
}

export type WallOfInspirationRow = {
  id: string;
  title: string;
  category_id: string | null;
  featured: boolean | null;
  trending: boolean | null;
  sales_count: number | null;
  views_count: number | null;
  created_at: string;
  categories: { name: string; slug: string } | null;
};

// Backs the homepage "Wall of Inspiration" gallery.
export async function fetchWallOfInspirationPostersFromDb(): Promise<WallOfInspirationRow[]> {
  const rows = await sql()`
    select p.id, p.title, p.category_id, p.featured, p.trending, p.sales_count,
           p.views_count, p.created_at, c.name as category_name, c.slug as category_slug
    from posters p
    join categories c on c.id = p.category_id
    where p.hidden = false and p.category_id is not null
    order by p.featured desc, p.trending desc, p.sales_count desc nulls last,
             p.views_count desc nulls last, p.created_at desc
    limit 72
  `;
  return (
    rows as unknown as Array<{
      id: string;
      title: string;
      category_id: string | null;
      featured: boolean | null;
      trending: boolean | null;
      sales_count: number | null;
      views_count: number | null;
      created_at: string;
      category_name: string;
      category_slug: string;
    }>
  ).map((r) => ({
    id: r.id,
    title: r.title,
    category_id: r.category_id,
    featured: r.featured,
    trending: r.trending,
    sales_count: r.sales_count,
    views_count: r.views_count,
    created_at: r.created_at,
    categories: { name: r.category_name, slug: r.category_slug },
  }));
}

export async function fetchRandomVisiblePostersFromDb(
  limit: number,
): Promise<Array<{ id: string; title: string; image_url: string }>> {
  const rows = await sql()`
    select id, title, image_url from posters where hidden = false limit ${limit}
  `;
  return rows as unknown as Array<{ id: string; title: string; image_url: string }>;
}

export async function fetchPosterSalesCountFromDb(id: string): Promise<number> {
  const rows = await sql()`select sales_count from posters where id = ${id}`;
  return Number((rows[0] as { sales_count?: number } | undefined)?.sales_count ?? 0);
}

export async function fetchSiteSettingsFromDb(keys: string[]): Promise<Record<string, Json>> {
  if (keys.length === 0) return {};
  const rows = await sql()`
    select key, value from site_settings where key = any(${keys})
  `;
  const map: Record<string, Json> = {};
  for (const row of rows as Array<{ key: string; value: Json }>) {
    map[row.key] = row.value;
  }
  return map;
}
