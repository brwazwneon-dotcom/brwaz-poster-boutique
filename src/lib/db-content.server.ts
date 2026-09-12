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
