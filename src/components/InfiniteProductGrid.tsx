import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useGridDisplayMode } from "@/lib/use-settings";
import { ProductCard } from "@/components/ProductCard";
import type { NormalizedProduct, RequestState } from "@/hooks/useInfiniteProducts";

type Props = {
  products: NormalizedProduct[];
  state: RequestState;
  error: Error | null;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
};

export function InfiniteProductGrid({
  products,
  state,
  error,
  selectedIds,
  onToggle,
  onLoadMore,
  onRetry,
}: Props) {
  const { t } = useTranslation();
  const gridMode = useGridDisplayMode();

  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(state !== "end");
  const isLoadingRef = useRef(state === "loading");

  onLoadMoreRef.current = onLoadMore;
  hasMoreRef.current = state !== "end";
  isLoadingRef.current = state === "loading";

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreRef.current && !isLoadingRef.current) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: "800px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (state === "loading" && products.length === 0) {
    return (
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        data-grid-version="simple-infinite-v2"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] animate-pulse rounded-sm bg-muted/30" />
        ))}
      </div>
    );
  }

  if (state === "error" && products.length === 0) {
    return (
      <div
        className="rounded-sm border border-dashed border-destructive/40 p-12 text-center text-sm text-destructive"
        data-grid-version="simple-infinite-v2"
      >
        <p>{t("category.couldNotLoad")}</p>
        <button
          onClick={onRetry}
          className="mt-4 rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          {t("category.retry")}
        </button>
      </div>
    );
  }

  if (state === "end" && products.length === 0) {
    return (
      <div
        className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground"
        data-grid-version="simple-infinite-v2"
      >
        {t("category.noPosters")}
      </div>
    );
  }

  return (
    <div data-grid-version="simple-infinite-v2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product, idx) => {
          const sel = selectedIds.includes(product.id);
          const selectionIdx = selectedIds.indexOf(product.id);
          return (
            <ProductCard
              key={product.id}
              product={product}
              gridIndex={idx}
              selected={sel}
              selectionIndex={selectionIdx}
              onToggle={onToggle}
              gridMode={gridMode}
            />
          );
        })}
      </div>

      <div ref={sentinelRef} data-load-sentinel className="h-px" />

      {state === "loading" && products.length > 0 && (
        <div className="mt-4 flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      )}

      {state === "error" && products.length > 0 && (
        <div className="mt-4 rounded-sm border border-dashed border-destructive/40 p-6 text-center text-sm text-destructive">
          <p>{t("category.couldNotLoad")}</p>
          <button
            onClick={onRetry}
            className="mt-3 rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            {t("category.retry")}
          </button>
        </div>
      )}

      {state !== "loading" && state !== "end" && state !== "error" && (
        <div className="mt-8 text-center">
          <button
            onClick={onLoadMore}
            className="rounded-sm border border-border px-6 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
          >
            Load next batch manually
          </button>
        </div>
      )}
    </div>
  );
}
