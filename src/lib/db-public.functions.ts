import { createServerFn } from "@tanstack/react-start";
import {
  fetchCategoriesFromDb,
  fetchPosterBySlugFromDb,
  fetchPostersByCategoryFromDb,
  fetchTrendingPostersFromDb,
  fetchSiteSettingsFromDb,
  fetchPosterImagesByIdsFromDb,
  type CategorySortKey,
} from "@/lib/db-catalog.server";
import { fetchEnabledHeroBannersFromDb, logSystemEventToDb } from "@/lib/db-content.server";
import type { Category } from "@/lib/use-categories";

export const getCategoriesPublic = createServerFn({ method: "GET" }).handler(async (): Promise<Category[]> => {
  return fetchCategoriesFromDb();
});

export const getPosterBySlugPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { slug: string }).slug)
  .handler(async ({ data: slug }) => {
    return fetchPosterBySlugFromDb(slug);
  });

export const getPostersByCategoryPublic = createServerFn({ method: "GET" })
  .validator(
    (data: unknown) =>
      data as {
        categoryIds: string[];
        offset?: number;
        limit?: number;
        sort?: CategorySortKey;
      },
  )
  .handler(async ({ data }) => {
    return fetchPostersByCategoryFromDb(data.categoryIds, {
      offset: data.offset,
      limit: data.limit,
      sort: data.sort,
    });
  });

export const getTrendingPostersPublic = createServerFn({ method: "GET" }).handler(async () => {
  return fetchTrendingPostersFromDb();
});

export const getPosterImagesByIdsPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { ids: string[] }).ids)
  .handler(async ({ data: ids }) => {
    return fetchPosterImagesByIdsFromDb(ids);
  });

export const getSiteSettingsPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { keys: string[] }).keys)
  .handler(async ({ data: keys }) => {
    return fetchSiteSettingsFromDb(keys);
  });

export const getHeroBannersPublic = createServerFn({ method: "GET" }).handler(async () => {
  return fetchEnabledHeroBannersFromDb();
});

// Public — client error capture (window.onerror / unhandledrejection /
// React error boundaries). Best-effort by design: never throws in a way
// that could surface to the reporting caller, matching the old
// error-logger.ts's "logging must never break the UI" contract.
export const logClientErrorPublic = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        level?: string;
        source?: string;
        category?: string;
        message: string;
        stack?: string;
        url?: string;
        userAgent?: string;
        metadata?: unknown;
      },
  )
  .handler(async ({ data }) => {
    try {
      await logSystemEventToDb({
        level: data.level ?? "error",
        source: data.source ?? "client",
        category: data.category ?? null,
        message: data.message,
        stack: data.stack,
        url: data.url,
        user_agent: data.userAgent,
        metadata: data.metadata,
      });
    } catch {
      /* logging must never throw */
    }
    return { ok: true };
  });
