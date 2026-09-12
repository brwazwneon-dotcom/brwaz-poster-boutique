import { createServerFn } from "@tanstack/react-start";
import {
  fetchApprovedReviewsFromDb,
  fetchCategoriesFromDb,
  fetchPosterBySlugFromDb,
  fetchPostersByCategoryFromDb,
  fetchTrendingPostersFromDb,
  fetchBestSellersFromDb,
  fetchHomeTrendingCandidatesFromDb,
  fetchPosterSalesCountFromDb,
  fetchPostersByIdsFromDb,
  fetchRandomVisiblePostersFromDb,
  fetchRelatedPostersFromDb,
  fetchRoomTransformationArtworkFromDb,
  fetchSearchPostersFromDb,
  fetchShowcaseProductsForCategoriesFromDb,
  fetchSiteSettingsFromDb,
  fetchTrendingSearchesFromDb,
  fetchWallOfInspirationPostersFromDb,
  incrementPosterViewsInDb,
  incrementPosterUniqueViewsInDb,
  incrementPosterCartAddsInDb,
  incrementPosterSalesInDb,
  addPosterViewSecondsInDb,
  fetchPosterImagesByIdsFromDb,
  type CategorySortKey,
} from "@/lib/db-catalog.server";
import {
  fetchEnabledHeroBannersFromDb,
  fetchEnabledHighlightsFromDb,
  fetchEnabledCustomOffersFromDb,
  fetchEnabledSliderImagesFromDb,
  fetchEnabledSetsFromDb,
  logSystemEventToDb,
} from "@/lib/db-content.server";
import {
  logVisitToDb,
  logPosterEventToDb,
  logSearchQueryToDb,
  logPerfMetricToDb,
} from "@/lib/db-analytics.server";
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

export const getHighlightsPublic = createServerFn({ method: "GET" }).handler(async () => {
  return fetchEnabledHighlightsFromDb();
});

export const getSliderImagesPublic = createServerFn({ method: "GET" }).handler(async () => {
  return fetchEnabledSliderImagesFromDb();
});

export const getSetsPublic = createServerFn({ method: "GET" }).handler(async () => {
  return fetchEnabledSetsFromDb();
});

export const getCustomOffersPublic = createServerFn({ method: "GET" }).handler(async () => {
  return fetchEnabledCustomOffersFromDb();
});

export const getBestSellersPublic = createServerFn({ method: "GET" }).handler(async () => {
  return fetchBestSellersFromDb();
});

export const getApprovedReviewsPublic = createServerFn({ method: "GET" })
  .validator(
    (data: unknown) => (data as { posterId?: string | null; limit?: number } | undefined) ?? {},
  )
  .handler(async ({ data }) => {
    return fetchApprovedReviewsFromDb(data.posterId ?? null, data.limit ?? 20);
  });

export const getPostersByIdsPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { ids: string[] }).ids)
  .handler(async ({ data: ids }) => {
    return fetchPostersByIdsFromDb(ids);
  });

export const getPosterSalesCountPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    return fetchPosterSalesCountFromDb(id);
  });

// Public — poster interaction counters, fired from anonymous storefront
// browsing (view/cart-add/checkout). Best-effort: failures never throw
// in a way that could interrupt the shopping flow.
export const incrementPosterViewsPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    try {
      await incrementPosterViewsInDb(id);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const incrementPosterUniqueViewsPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    try {
      await incrementPosterUniqueViewsInDb(id);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const incrementPosterCartAddsPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { ids: string[]; qty: number })
  .handler(async ({ data }) => {
    try {
      await incrementPosterCartAddsInDb(data.ids, data.qty);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const incrementPosterSalesPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { ids: string[]; qty: number })
  .handler(async ({ data }) => {
    try {
      await incrementPosterSalesInDb(data.ids, data.qty);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const addPosterViewSecondsPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; seconds: number })
  .handler(async ({ data }) => {
    try {
      await addPosterViewSecondsInDb(data.id, data.seconds);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

// Public — lightweight marketing/behavior analytics. Best-effort: never
// throws in a way that could interrupt browsing or checkout.
export const logVisitPublic = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        visitor_id: string;
        session_id: string;
        path: string;
        referrer: string;
        source: string;
        device: string;
        browser: string;
        os: string;
        country: string | null;
        country_code: string | null;
        city: string | null;
        governorate: string | null;
        user_agent: string;
      },
  )
  .handler(async ({ data }) => {
    try {
      await logVisitToDb(data);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const logPosterEventPublic = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        poster_id: string | null;
        visitor_id: string;
        session_id: string;
        event_type: string;
        duration_seconds: number | null;
      },
  )
  .handler(async ({ data }) => {
    try {
      await logPosterEventToDb(data);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const logSearchQueryPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { query: string; results_count: number; visitor_id: string })
  .handler(async ({ data }) => {
    try {
      await logSearchQueryToDb(data);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const logPerfMetricPublic = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        page_path: string;
        metric: string;
        value_ms: number;
        session_id: string | null;
        user_agent: string;
        metadata: unknown;
      },
  )
  .handler(async ({ data }) => {
    try {
      await logPerfMetricToDb(data);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const getHomeTrendingCandidatesPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { manualIds: string[]; limit: number })
  .handler(async ({ data }) => {
    return fetchHomeTrendingCandidatesFromDb(data.manualIds, data.limit);
  });

export const getShowcaseProductsForCategoriesPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { categoryIds: string[] }).categoryIds)
  .handler(async ({ data: categoryIds }) => {
    return fetchShowcaseProductsForCategoriesFromDb(categoryIds);
  });

export const getRelatedPostersPublic = createServerFn({ method: "GET" })
  .validator(
    (data: unknown) =>
      data as { posterId: string; categoryIds: string[]; tags: string[]; words: string[] },
  )
  .handler(async ({ data }) => {
    return fetchRelatedPostersFromDb(data.posterId, data.categoryIds, data.tags, data.words);
  });

export const searchPostersPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { q: string; limit: number })
  .handler(async ({ data }) => {
    return fetchSearchPostersFromDb(data.q, data.limit);
  });

export const getTrendingSearchesPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { limit?: number } | undefined) ?? {})
  .handler(async ({ data }) => {
    return fetchTrendingSearchesFromDb(data.limit ?? 8);
  });

export const getWallOfInspirationPostersPublic = createServerFn({ method: "GET" }).handler(
  async () => fetchWallOfInspirationPostersFromDb(),
);

export const getRandomVisiblePostersPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { limit?: number } | undefined) ?? {})
  .handler(async ({ data }) => {
    return fetchRandomVisiblePostersFromDb(data.limit ?? 40);
  });

export const getRoomTransformationArtworkPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { posterId: string | null } | undefined) ?? { posterId: null })
  .handler(async ({ data }) => {
    return fetchRoomTransformationArtworkFromDb(data.posterId);
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
