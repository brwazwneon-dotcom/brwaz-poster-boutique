import { sql } from "@/lib/neon.server";

export type DbPhotoAlbum = {
  id: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  price: number;
  image_url: string | null;
  sort_order: number;
};

export async function fetchEnabledPhotoAlbumsFromDb(): Promise<DbPhotoAlbum[]> {
  const rows = await sql()`
    select id, name_en, name_ar, description_en, description_ar, price, image_url, sort_order
    from photo_albums
    where enabled = true
    order by sort_order asc, created_at asc
  `;
  return rows as unknown as DbPhotoAlbum[];
}

export type DbHeroBanner = {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  button_link: string | null;
  enabled: boolean;
  sort_order: number;
  webp_srcset: string | null;
  avif_srcset: string | null;
};

export async function fetchEnabledHeroBannersFromDb(): Promise<DbHeroBanner[]> {
  const rows = await sql()`
    select id, image_url, title, subtitle, button_text, button_link, enabled, sort_order,
           webp_srcset, avif_srcset
    from hero_banners
    where enabled = true and migration_status in ('not_applicable', 'migrated')
    order by sort_order asc
  `;
  return rows as unknown as DbHeroBanner[];
}

export async function fetchAllHeroBannersFromDb(): Promise<DbHeroBanner[]> {
  const rows = await sql()`
    select id, image_url, title, subtitle, button_text, button_link, enabled, sort_order,
           webp_srcset, avif_srcset
    from hero_banners
    order by sort_order asc
  `;
  return rows as unknown as DbHeroBanner[];
}

export type DbHighlight = {
  id: string;
  key: string;
  title: string;
  image_url: string | null;
  link: string;
  sort_order: number;
  enabled: boolean;
};

export async function fetchEnabledHighlightsFromDb(): Promise<DbHighlight[]> {
  const rows = await sql()`
    select id, key, title, image_url, link, sort_order, enabled
    from highlights
    where enabled = true
    order by sort_order asc
  `;
  return rows as unknown as DbHighlight[];
}

// Admin-defined "Category A + Category B" homepage blocks (migration 026
// — see neon/migrations/026_poster_merchandising.sql). Joined here with
// posters/categories so the public site never has to make a second round
// trip per card. Falls back to an empty list — never throws — if the
// migration hasn't been applied yet, since this is a brand-new,
// previously-nonexistent section: an empty list is exactly "not set up
// yet", the correct behavior either way.
export type DbDualCategorySection = {
  id: string;
  name: string;
  sort_order: number;
  left: {
    poster_id: string | null;
    image_url: string | null;
    title: string | null;
    button_text: string | null;
    category_slug: string | null;
    category_name: string | null;
  };
  right: {
    poster_id: string | null;
    image_url: string | null;
    title: string | null;
    button_text: string | null;
    category_slug: string | null;
    category_name: string | null;
  };
};

export async function fetchEnabledDualCategorySectionsFromDb(): Promise<DbDualCategorySection[]> {
  try {
    const rows = await sql()`
      select s.id, s.name, s.sort_order,
             s.left_poster_id, lp.image_url as left_image_url, s.left_title,
             s.left_button_text, lc.slug as left_category_slug, lc.name as left_category_name,
             s.right_poster_id, rp.image_url as right_image_url, s.right_title,
             s.right_button_text, rc.slug as right_category_slug, rc.name as right_category_name
      from dual_category_sections s
      left join posters lp on lp.id = s.left_poster_id
      left join categories lc on lc.id = s.left_category_id
      left join posters rp on rp.id = s.right_poster_id
      left join categories rc on rc.id = s.right_category_id
      where s.enabled = true
      order by s.sort_order asc, s.created_at asc
    `;
    return (
      rows as unknown as Array<{
        id: string;
        name: string;
        sort_order: number;
        left_poster_id: string | null;
        left_image_url: string | null;
        left_title: string | null;
        left_button_text: string | null;
        left_category_slug: string | null;
        left_category_name: string | null;
        right_poster_id: string | null;
        right_image_url: string | null;
        right_title: string | null;
        right_button_text: string | null;
        right_category_slug: string | null;
        right_category_name: string | null;
      }>
    ).map((r) => ({
      id: r.id,
      name: r.name,
      sort_order: r.sort_order,
      left: {
        poster_id: r.left_poster_id,
        image_url: r.left_image_url,
        title: r.left_title,
        button_text: r.left_button_text,
        category_slug: r.left_category_slug,
        category_name: r.left_category_name,
      },
      right: {
        poster_id: r.right_poster_id,
        image_url: r.right_image_url,
        title: r.right_title,
        button_text: r.right_button_text,
        category_slug: r.right_category_slug,
        category_name: r.right_category_name,
      },
    }));
  } catch (err) {
    if (err instanceof Error && /relation .* does not exist/i.test(err.message)) return [];
    throw err;
  }
}

export async function fetchAllHighlightsFromDb(): Promise<DbHighlight[]> {
  const rows = await sql()`
    select id, key, title, image_url, link, sort_order, enabled
    from highlights
    order by sort_order asc
  `;
  return rows as unknown as DbHighlight[];
}

export type DbCustomOffer = {
  id: string;
  title: string;
  subtitle: string | null;
  size: string;
  count: number;
  price: number;
  image_url: string | null;
  badge: string | null;
  sort_order: number;
  enabled: boolean;
};

export async function fetchEnabledCustomOffersFromDb(): Promise<DbCustomOffer[]> {
  const rows = await sql()`
    select id, title, subtitle, size, count, price, image_url, badge, sort_order, enabled
    from custom_offers
    where enabled = true
    order by sort_order asc, created_at desc
  `;
  return rows as unknown as DbCustomOffer[];
}

export async function fetchAllCustomOffersFromDb(): Promise<DbCustomOffer[]> {
  const rows = await sql()`
    select id, title, subtitle, size, count, price, image_url, badge, sort_order, enabled
    from custom_offers
    order by sort_order asc, created_at desc
  `;
  return rows as unknown as DbCustomOffer[];
}

export type DbSliderImage = {
  id: string;
  image_url: string;
  title: string | null;
  link_url: string | null;
  sort_order: number;
  enabled: boolean;
  webp_srcset: string | null;
  avif_srcset: string | null;
};

export async function fetchEnabledSliderImagesFromDb(): Promise<DbSliderImage[]> {
  const rows = await sql()`
    select id, image_url, title, link_url, sort_order, enabled, webp_srcset, avif_srcset
    from slider_images
    where enabled = true
    order by sort_order asc
  `;
  return rows as unknown as DbSliderImage[];
}

export async function fetchAllSliderImagesFromDb(): Promise<DbSliderImage[]> {
  const rows = await sql()`
    select id, image_url, title, link_url, sort_order, enabled, webp_srcset, avif_srcset
    from slider_images
    order by sort_order asc
  `;
  return rows as unknown as DbSliderImage[];
}

export type DbFrameSet = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  frames_count: number;
  price: number;
  old_price: number | null;
  enabled: boolean;
  featured: boolean;
  sort_order: number;
};

export async function fetchEnabledSetsFromDb(): Promise<DbFrameSet[]> {
  const rows = await sql()`
    select id, name, description, image_url, frames_count, price, old_price,
           enabled, featured, sort_order
    from sets
    where enabled = true
    order by sort_order asc, created_at desc
  `;
  return rows as unknown as DbFrameSet[];
}

export async function fetchAllSetsFromDb(): Promise<DbFrameSet[]> {
  const rows = await sql()`
    select id, name, description, image_url, frames_count, price, old_price,
           enabled, featured, sort_order
    from sets
    order by sort_order asc, created_at desc
  `;
  return rows as unknown as DbFrameSet[];
}

export type DbBeforeAfter = {
  id: string;
  title: string | null;
  description: string | null;
  before_url: string;
  after_url: string;
  location: string;
  sort_order: number;
  active: boolean;
};

export async function fetchActiveBeforeAfterFromDb(location: string): Promise<DbBeforeAfter[]> {
  const rows = await sql()`
    select id, title, description, before_url, after_url, location, sort_order, active
    from before_after
    where active = true and location = ${location}
    order by sort_order asc, created_at desc
  `;
  return rows as unknown as DbBeforeAfter[];
}

export async function fetchAllBeforeAfterFromDb(): Promise<DbBeforeAfter[]> {
  const rows = await sql()`
    select id, title, description, before_url, after_url, location, sort_order, active
    from before_after
    order by location asc, sort_order asc, created_at desc
  `;
  return rows as unknown as DbBeforeAfter[];
}

export type DbLandingPage = {
  id: string;
  audience_key: string;
  visible: boolean;
  title_ar: string | null;
  title_en: string | null;
  subtitle_ar: string | null;
  subtitle_en: string | null;
  hero_image: string | null;
  whatsapp_message: string | null;
  cta_text: string | null;
  source_category_id: string | null;
  display_mode: "manual" | "category" | "smart_mix";
  poster_limit: number;
  manual_poster_ids: string[];
  seo_title: string | null;
  meta_description: string | null;
};

export type DbLandingPoster = {
  id: string;
  title: string;
  image_url: string | null;
  category_id: string | null;
  sales_count: number | null;
  views_count: number | null;
};

export async function fetchLandingPageAdminFromDb(audience: string): Promise<DbLandingPage | null> {
  const rows = await sql()`select * from landing_pages where audience_key = ${audience} limit 1`;
  return (rows[0] as DbLandingPage | undefined) ?? null;
}

export async function fetchAllLandingPagesFromDb(): Promise<DbLandingPage[]> {
  const rows = await sql()`select * from landing_pages order by audience_key asc`;
  return rows as unknown as DbLandingPage[];
}

export async function fetchLandingBundleFromDb(
  audience: string,
): Promise<{ page: DbLandingPage; posters: DbLandingPoster[] } | null> {
  const page = await fetchLandingPageAdminFromDb(audience);
  if (!page || !page.visible) return null;

  const limit = Math.max(1, Math.min(200, page.poster_limit || 24));

  let posters: DbLandingPoster[] = [];
  if (page.display_mode === "manual") {
    if (page.manual_poster_ids.length > 0) {
      const rows = await sql()`
        select id, title, image_url, category_id, sales_count, views_count
        from posters
        where id = any(${page.manual_poster_ids}) and hidden = false
      `;
      const byId = new Map((rows as unknown as DbLandingPoster[]).map((r) => [r.id, r]));
      posters = page.manual_poster_ids
        .map((id) => byId.get(id))
        .filter((p): p is DbLandingPoster => !!p);
    }
  } else if (page.display_mode === "category" && page.source_category_id) {
    const rows = await sql()`
      select id, title, image_url, category_id, sales_count, views_count
      from posters
      where category_id = ${page.source_category_id} and hidden = false
      order by sales_count desc nulls last, created_at desc
      limit ${limit}
    `;
    posters = rows as unknown as DbLandingPoster[];
  } else {
    const rows = await sql()`
      select id, title, image_url, category_id, sales_count, views_count
      from posters
      where hidden = false and (trending = true or is_best_seller = true)
      order by sales_count desc nulls last, views_count desc nulls last
      limit ${limit}
    `;
    posters = rows as unknown as DbLandingPoster[];
    if (posters.length === 0) {
      const fallback = await sql()`
        select id, title, image_url, category_id, sales_count, views_count
        from posters
        where hidden = false
        order by created_at desc
        limit ${limit}
      `;
      posters = fallback as unknown as DbLandingPoster[];
    }
  }

  return { page, posters };
}

export async function logSystemEventToDb(input: {
  level: string;
  source?: string | null;
  category?: string | null;
  message: string;
  stack?: string | null;
  url?: string | null;
  user_agent?: string | null;
  metadata?: unknown;
}): Promise<void> {
  await sql()`
    insert into system_logs (level, source, category, message, stack, url, user_agent, metadata)
    values (
      ${input.level}, ${input.source ?? null}, ${input.category ?? null}, ${input.message.slice(0, 1000)},
      ${input.stack?.slice(0, 4000) ?? null}, ${input.url ?? null}, ${input.user_agent ?? null},
      ${JSON.stringify(input.metadata ?? {})}
    )
  `;
}
