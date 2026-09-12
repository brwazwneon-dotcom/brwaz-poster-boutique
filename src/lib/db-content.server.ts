import { sql } from "@/lib/neon.server";

export type DbHeroBanner = {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  button_link: string | null;
  enabled: boolean;
  sort_order: number;
};

export async function fetchEnabledHeroBannersFromDb(): Promise<DbHeroBanner[]> {
  const rows = await sql()`
    select id, image_url, title, subtitle, button_text, button_link, enabled, sort_order
    from hero_banners
    where enabled = true
    order by sort_order asc
  `;
  return rows as unknown as DbHeroBanner[];
}

export async function fetchAllHeroBannersFromDb(): Promise<DbHeroBanner[]> {
  const rows = await sql()`
    select id, image_url, title, subtitle, button_text, button_link, enabled, sort_order
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
};

export async function fetchEnabledSliderImagesFromDb(): Promise<DbSliderImage[]> {
  const rows = await sql()`
    select id, image_url, title, link_url, sort_order, enabled
    from slider_images
    where enabled = true
    order by sort_order asc
  `;
  return rows as unknown as DbSliderImage[];
}

export async function fetchAllSliderImagesFromDb(): Promise<DbSliderImage[]> {
  const rows = await sql()`
    select id, image_url, title, link_url, sort_order, enabled
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
      posters = page.manual_poster_ids.map((id) => byId.get(id)).filter((p): p is DbLandingPoster => !!p);
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
