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
