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
  fetchRoomWallPostersFromDb,
  fetchSearchPostersFromDb,
  fetchShowcaseProductsForCategoriesFromDb,
  fetchSiteSettingsFromDb,
  fetchTrendingSearchesFromDb,
  fetchWallOfInspirationPostersFromDb,
  fetchPosterImagesFromDb,
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
  fetchActiveBeforeAfterFromDb,
  fetchLandingBundleFromDb,
  fetchEnabledPhotoAlbumsFromDb,
  logSystemEventToDb,
} from "@/lib/db-content.server";
import {
  logVisitToDb,
  logPosterEventToDb,
  logSearchQueryToDb,
  logPerfMetricToDb,
  logEventsToDb,
} from "@/lib/db-analytics.server";
import { isProductionRequest, requestHost } from "@/lib/analytics-host.server";
import {
  ALLOWED_EVENT_TYPES,
  MAX_EVENTS_PER_BATCH,
  cleanId,
  cleanPath,
  isUuid,
  sanitizeAttribution,
  sanitizeEvent,
  type CleanEvent,
} from "@/lib/analytics-events-schema";
import { normalizeSource } from "@/lib/attribution";
import type { Category } from "@/lib/use-categories";

export const getCategoriesPublic = createServerFn({ method: "GET" }).handler(
  async (): Promise<Category[]> => {
    return fetchCategoriesFromDb();
  },
);

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

export const getPhotoAlbumsPublic = createServerFn({ method: "GET" }).handler(async () => {
  return fetchEnabledPhotoAlbumsFromDb();
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

export const getBeforeAfterPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { location: string }).location)
  .handler(async ({ data: location }) => {
    return fetchActiveBeforeAfterFromDb(location);
  });

export const getPosterImagesPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { posterId: string }).posterId)
  .handler(async ({ data: posterId }) => {
    return fetchPosterImagesFromDb(posterId);
  });

export const getLandingBundlePublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { audience: string }).audience)
  .handler(async ({ data: audience }) => {
    return fetchLandingBundleFromDb(audience);
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
      if (isProductionRequest()) await incrementPosterViewsInDb(id);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const incrementPosterUniqueViewsPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    try {
      if (isProductionRequest()) await incrementPosterUniqueViewsInDb(id);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const incrementPosterCartAddsPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { ids: string[]; qty: number })
  .handler(async ({ data }) => {
    try {
      if (isProductionRequest()) await incrementPosterCartAddsInDb(data.ids, data.qty);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const incrementPosterSalesPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { ids: string[]; qty: number })
  .handler(async ({ data }) => {
    try {
      if (isProductionRequest()) await incrementPosterSalesInDb(data.ids, data.qty);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

export const addPosterViewSecondsPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; seconds: number })
  .handler(async ({ data }) => {
    try {
      if (isProductionRequest()) await addPosterViewSecondsInDb(data.id, data.seconds);
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
        attribution?: unknown;
      },
  )
  .handler(async ({ data }) => {
    // Development / preview traffic shares this database — it is refused here
    // (by the request's Host header, not anything the browser claims).
    if (!isProductionRequest()) return { ok: true, skipped: "non_production_host" };
    try {
      const { attribution, ...visit } = data;
      const clean = sanitizeAttribution(attribution);
      await logVisitToDb({
        ...visit,
        // One taxonomy everywhere: the legacy `source` column mirrors the
        // session's last touch instead of being re-guessed per page view.
        source: clean.last_source ?? normalizeSource(visit.source) ?? "direct",
        host: requestHost(),
        attribution: clean,
      });
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
        path?: string;
        attribution?: unknown;
      },
  )
  .handler(async ({ data }) => {
    if (!isProductionRequest()) return { ok: true, skipped: "non_production_host" };
    // Previously any string was stored; now only the known vocabulary.
    if (!ALLOWED_EVENT_TYPES.includes(data.event_type)) {
      return { ok: true, skipped: "unknown_event" };
    }
    const visitor_id = cleanId(data.visitor_id);
    const session_id = cleanId(data.session_id);
    if (!visitor_id || !session_id) return { ok: true, skipped: "invalid" };
    try {
      await logPosterEventToDb({
        poster_id: isUuid(data.poster_id) ? data.poster_id : null,
        visitor_id,
        session_id,
        event_type: data.event_type,
        duration_seconds:
          typeof data.duration_seconds === "number" && Number.isFinite(data.duration_seconds)
            ? Math.max(0, Math.min(86_400, Math.round(data.duration_seconds)))
            : null,
        host: requestHost(),
        path: cleanPath(data.path),
        attribution: sanitizeAttribution(data.attribution),
      });
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

/**
 * Batched funnel / click events from the unified tracking sink
 * (src/lib/analytics-events.ts). Public and anonymous like the rest of the
 * storefront tracking, so it is strict: allow-listed event names, allow-listed
 * prop keys, pathname-only paths, capped batch size — and it never stores
 * anything from a non-production host.
 */
export const logAnalyticsEventsPublic = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        visitor_id: string;
        session_id: string;
        attribution?: unknown;
        events: unknown[];
      },
  )
  .handler(async ({ data }) => {
    if (!isProductionRequest()) return { ok: true, stored: 0, skipped: "non_production_host" };
    const visitor_id = cleanId(data.visitor_id);
    const session_id = cleanId(data.session_id);
    if (!visitor_id || !session_id || !Array.isArray(data.events)) return { ok: true, stored: 0 };
    const events = data.events
      .slice(0, MAX_EVENTS_PER_BATCH)
      .map((e) => sanitizeEvent(e))
      .filter((e): e is CleanEvent => e !== null);
    if (events.length === 0) return { ok: true, stored: 0 };
    try {
      await logEventsToDb({
        visitor_id,
        session_id,
        host: requestHost(),
        attribution: sanitizeAttribution(data.attribution),
        events,
      });
      return { ok: true, stored: events.length };
    } catch {
      return { ok: true, stored: 0 };
    }
  });

export const logSearchQueryPublic = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) => data as { query: string; results_count: number; visitor_id: string },
  )
  .handler(async ({ data }) => {
    try {
      if (isProductionRequest()) await logSearchQueryToDb(data);
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
      if (isProductionRequest()) await logPerfMetricToDb(data);
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
  .validator(
    (data: unknown) => (data as { posterId: string | null } | undefined) ?? { posterId: null },
  )
  .handler(async ({ data }) => {
    return fetchRoomTransformationArtworkFromDb(data.posterId);
  });

// Public — posters shown on the homepage gallery wall (up to 6).
export const getRoomWallPostersPublic = createServerFn({ method: "GET" })
  .validator(
    (data: unknown) => (data as { posterId: string | null } | undefined) ?? { posterId: null },
  )
  .handler(async ({ data }) => {
    return fetchRoomWallPostersFromDb(data.posterId, 6);
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
