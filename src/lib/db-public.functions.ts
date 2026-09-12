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
