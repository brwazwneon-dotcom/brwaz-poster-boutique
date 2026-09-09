import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

export type SortConfig = {
  query: (qb: QueryBuilder) => QueryBuilder;
};

export type RequestState = "idle" | "loading" | "error" | "end";

export function getBatchSize(): number {
  if (typeof window === "undefined") return 12;
  if (window.innerWidth >= 1024) return 24;
  return 12;
}

async function fetchThumbnails(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const variantTypes = ["small_avif", "small_webp", "small", "thumb_avif", "thumb_webp", "thumb"];
  const rankMap: Record<string, number> = {
    small_avif: 0,
    small_webp: 1,
    small: 2,
    thumb_avif: 3,
    thumb_webp: 4,
    thumb: 5,
  };
  const result: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 80) {
    const batch = ids.slice(i, i + 80);
    const { data } = await supabase
      .from("image_variants")
      .select("source_id,url,variant")
      .eq("source_table", "posters")
      .in("variant", variantTypes)
      .eq("status", "done")
      .in("source_id", batch);
    const best: Record<string, { url: string; rank: number }> = {};
    for (const row of data ?? []) {
      const sid = String(row.source_id ?? "");
      if (!sid || !row.url) continue;
      const rank = rankMap[row.variant] ?? 99;
      if (!best[sid] || rank < best[sid].rank) best[sid] = { url: row.url, rank };
    }
    for (const id of batch) if (best[id]) result[id] = best[id].url;
  }
  return result;
}

export function useInfiniteProducts(
  categoryIds: string[],
  sortConfig: SortConfig,
  queryKey: string,
) {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [state, setState] = useState<RequestState>("idle");
  const [error, setError] = useState<Error | null>(null);

  const rawOffsetRef = useRef(0);
  const loadingRef = useRef(false);
  const stateRef = useRef<RequestState>("idle");
  const categoryIdsRef = useRef(categoryIds);
  const sortConfigRef = useRef(sortConfig);
  const buildCache = useRef<((offset: number, batchSize: number) => { q: QueryBuilder; from: number; to: number }) | null>(null);

  categoryIdsRef.current = categoryIds;
  sortConfigRef.current = sortConfig;

  function buildQuery(offset: number, batchSize: number) {
    const from = offset;
    const to = offset + batchSize - 1;
    let q = supabase
      .from("posters")
      .select(
        "id,title,category_id,tags,badge,sales_count,views_count,is_best_seller,pinned,sort_order,trending,image_url,created_at",
      )
      .in("category_id", categoryIdsRef.current)
      .eq("hidden", false);
    q = sortConfigRef.current.query(q);
    return { q, from, to };
  }

  const loadOneBatch = useCallback(async (offset: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    stateRef.current = "loading";
    setState("loading");
    setError(null);

    try {
      const batchSize = getBatchSize();
      const { q, from, to } = buildQuery(offset, batchSize);
      const { data, error: dbError } = await q.range(from, to);
      if (dbError) throw dbError;

      const rows = (data ?? []) as Array<{
        id: string;
        title: string;
        category_id: string | null;
        tags?: string[] | null;
        badge?: string | null;
        sales_count?: number | null;
        views_count?: number | null;
        is_best_seller?: boolean | null;
        image_url?: string | null;
        created_at: string;
      }>;

      if (rows.length === 0) {
        stateRef.current = "end";
        setState("end");
        return;
      }

      rawOffsetRef.current = offset + rows.length;

      const ids = rows.map((r) => r.id);
      const thumbs = await fetchThumbnails(ids);

      const normalized: NormalizedProduct[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        cardArtworkUrl: thumbs[r.id] ?? r.image_url ?? "",
        fallbackArtworkUrl: r.image_url ?? "",
        categoryId: r.category_id,
        badge: r.badge,
        salesCount: r.sales_count,
        viewsCount: r.views_count,
        isBestSeller: r.is_best_seller,
        image_url: r.image_url,
      }));

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
  }, [queryKey]);

  return { products, state, error, loadMore, retry };
}
