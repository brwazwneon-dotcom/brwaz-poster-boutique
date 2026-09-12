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
