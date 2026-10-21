import { useCallback, useEffect, useRef, useState } from "react";
import { getPostersByCategoryPublic } from "@/lib/db-public.functions";
import type { CategorySortKey } from "@/lib/db-catalog.server";

export type NormalizedProduct = {
  id: string;
  title: string;
  cardArtworkUrl: string;
  fallbackArtworkUrl: string;
  categoryId: string | null;
  badge?: string | null;
  salesCount?: number | null;
  viewsCount?: number | null;
  isBestSeller?: boolean | null;
  image_url?: string | null;
  webpSrcSet?: string | null;
  avifSrcSet?: string | null;
};

export type PosterRow = Awaited<ReturnType<typeof getPostersByCategoryPublic>>[number];

/** The first page of a list, fetched on the server so it is already in the HTML (see the category route loader). */
export type InitialProducts = { key: string; limit: number; rows: PosterRow[] };

function normalizeRows(rows: PosterRow[]): NormalizedProduct[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    cardArtworkUrl: r.image_url ?? "",
    fallbackArtworkUrl: r.image_url ?? "",
    categoryId: r.category_id,
    badge: r.badge,
    salesCount: r.sales_count,
    viewsCount: r.views_count,
    isBestSeller: r.is_best_seller,
    image_url: r.image_url,
    webpSrcSet: r.webp_srcset,
    avifSrcSet: r.avif_srcset,
  }));
}

export type SortConfig = {
  sort: CategorySortKey;
};

export type RequestState = "idle" | "loading" | "error" | "end";

export function getBatchSize(): number {
  if (typeof window === "undefined") return 12;
  if (window.innerWidth >= 1024) return 24;
  return 12;
}

export function useInfiniteProducts(
  categoryIds: string[],
  sortConfig: SortConfig,
  queryKey: string,
  initial?: InitialProducts | null,
) {
  // A first page that came with the page (server-rendered) for exactly this list: shown at once, and the
  // first request is skipped.
  const seed = initial && initial.key === queryKey && initial.rows.length > 0 ? initial : null;
  const seedState: RequestState = seed && seed.rows.length < seed.limit ? "end" : "idle";
  const [products, setProducts] = useState<NormalizedProduct[]>(() =>
    seed ? normalizeRows(seed.rows) : [],
  );
  const [state, setState] = useState<RequestState>(seedState);
  const [error, setError] = useState<Error | null>(null);

  const rawOffsetRef = useRef(seed ? seed.rows.length : 0);
  const loadingRef = useRef(false);
  const stateRef = useRef<RequestState>(seedState);
  const seededKeyRef = useRef<string | null>(seed ? seed.key : null);
  const categoryIdsRef = useRef(categoryIds);
  const sortConfigRef = useRef(sortConfig);

  categoryIdsRef.current = categoryIds;
  sortConfigRef.current = sortConfig;

  const loadOneBatch = useCallback(async (offset: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    stateRef.current = "loading";
    setState("loading");
    setError(null);

    try {
      const batchSize = getBatchSize();
      const rows = await getPostersByCategoryPublic({
        data: {
          categoryIds: categoryIdsRef.current,
          offset,
          limit: batchSize,
          sort: sortConfigRef.current.sort,
        },
      });

      if (rows.length === 0) {
        stateRef.current = "end";
        setState("end");
        return;
      }

      rawOffsetRef.current = offset + rows.length;

      const normalized = normalizeRows(rows);

      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const deduped = [...prev];
        for (const p of normalized) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            deduped.push(p);
          }
        }
        return deduped;
      });

      const nextState = rows.length < batchSize ? "end" : "idle";
      stateRef.current = nextState;
      setState(nextState);
    } catch (err) {
      stateRef.current = "error";
      setState("error");
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const loadMore = useCallback(() => {
    if (loadingRef.current) return;
    if (stateRef.current === "end") return;
    if (categoryIdsRef.current.length === 0) return;
    loadOneBatch(rawOffsetRef.current);
  }, [loadOneBatch]);

  const retry = useCallback(() => {
    if (loadingRef.current) return;
    rawOffsetRef.current = 0;
    setProducts([]);
    setError(null);
    stateRef.current = "idle";
    setState("idle");
    loadOneBatch(0);
  }, [loadOneBatch]);

  useEffect(() => {
    if (seededKeyRef.current === queryKey) {
      // The list is already on screen from the server: nothing to reset or fetch for this key.
      seededKeyRef.current = null;
      return;
    }
    rawOffsetRef.current = 0;
    setProducts([]);
    setError(null);
    loadingRef.current = false;

    if (categoryIdsRef.current.length === 0) {
      stateRef.current = "end";
      setState("end");
      return;
    }

    stateRef.current = "idle";
    setState("idle");
    loadOneBatch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  return { products, state, error, loadMore, retry };
}
