import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ImageOff, Loader2, RotateCcw } from "lucide-react";
import { searchCategoryImagesAdmin, type CategoryImageFilter } from "@/lib/db-admin.functions";
import { PosterEditorPanel } from "@/components/admin/PosterEditorPanel";
import type { AdminCategory, AdminPoster } from "@/components/admin/tabs/shared";

const PAGE_SIZE = 24;

const FILTERS: { value: CategoryImageFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "trending", label: "Trending" },
  { value: "best_seller", label: "Best Seller" },
  { value: "multiple_categories", label: "Multiple Categories" },
];

type CategoryImageRow = {
  id: string;
  title: string;
  slug: string;
  image_url: string;
  hidden: boolean;
  trending: boolean;
  trending_order: number | null;
  is_best_seller: boolean;
  best_seller_order: number | null;
  has_multiple_categories: boolean;
  category: { name: string; slug: string } | null;
};

/**
 * Phase 2 of the Categories → Poster Management Center plan: browsing,
 * filtering, and editing every poster in one category "tree" (a parent +
 * its subcategories, or a single subcategory) without ever leaving the
 * Categories tab. Editing reuses PosterEditorPanel exactly as ProductsTab
 * does — no separate editor, no duplicated save/mockup/Website Placement
 * logic.
 *
 * All server-side filtering/search/pagination via searchCategoryImagesAdmin
 * — the grid never loads more than one page's worth of posters, and
 * switching filters re-queries rather than filtering an already-loaded
 * list client-side.
 */
export function CategoryPosterManager({
  categoryId,
  label,
  parentLabel,
  treeIds,
  totalCount,
  categories,
  onBack,
  onOpenInProducts,
}: {
  categoryId: string;
  label: string;
  // Set only when this is a subcategory — renders the extra breadcrumb
  // segment and the "← Back to X" button targets the parent's label.
  parentLabel?: string;
  treeIds: string[];
  // The precomputed tree total from the Categories list (getCategoryImageCountsAdmin) —
  // shown as "N Posters" in the header. Not re-derived from a paginated
  // query result, since a page only ever returns up to PAGE_SIZE rows.
  totalCount: number;
  categories: AdminCategory[];
  onBack: () => void;
  // Optional escape hatch (set by Dashboard, same as ProductsTab's
  // focusCategoryId) to the full Products tab — bulk actions, the Bulk
  // Upload Studio for adding new posters, etc. Poster creation isn't
  // supported from this view, so the empty state offers this instead of
  // inventing a new upload workflow.
  onOpenInProducts?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<CategoryImageFilter>("all");
  const [offset, setOffset] = useState(0);
  const [editingPoster, setEditingPoster] = useState<CategoryImageRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const {
    data: posters,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["category-poster-manager", treeIds, debouncedSearch, filter, offset],
    queryFn: async () =>
      (await searchCategoryImagesAdmin({
        data: {
          categoryTreeIds: treeIds,
          query: debouncedSearch,
          filter,
          offset,
          limit: PAGE_SIZE,
        },
      })) as CategoryImageRow[],
  });

  const changeFilter = (f: CategoryImageFilter) => {
    setFilter(f);
    setOffset(0);
  };

  return (
    <div>
      {/* ---- Breadcrumb ---- */}
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <button onClick={onBack} className="hover:text-foreground hover:underline">
          Categories
        </button>
        {parentLabel && (
          <>
            <span>→</span>
            <span>{parentLabel}</span>
          </>
        )}
        <span>→</span>
        <span className="font-medium text-foreground">{label}</span>
      </div>
      <button onClick={onBack} className="mb-4 text-xs text-cyan-500 hover:underline">
        ← Back to {parentLabel ?? "Categories"}
      </button>

      {/* ---- Header: count + search ---- */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {totalCount} Poster{totalCount === 1 ? "" : "s"}
        </h2>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posters..."
            className="w-full rounded-sm border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* ---- Filters ---- */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => changeFilter(f.value)}
            className={`shrink-0 rounded-sm border px-3 py-1.5 text-xs font-medium ${
              filter === f.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ---- Poster editor — opens in place, same spot ProductsTab uses,
           so closing it returns to exactly this search/filter/page state. ---- */}
      {editingPoster && (
        <PosterEditorPanel
          key={editingPoster.id}
          poster={editingPoster as unknown as Partial<AdminPoster>}
          categories={categories}
          onSaved={() => {
            setEditingPoster(null);
            refetch();
          }}
          onClose={() => setEditingPoster(null)}
        />
      )}

      {/* ---- Grid / states ---- */}
      {isFetching && !posters ? (
        <SkeletonGrid />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
          <p>Couldn't load posters.</p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : !posters || posters.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {debouncedSearch || filter !== "all" ? (
            "No posters match this search/filter."
          ) : (
            <>
              No posters in this subcategory yet.
              {onOpenInProducts && (
                <div className="mt-3">
                  <button
                    onClick={onOpenInProducts}
                    className="rounded-sm border border-border px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    Go to Products
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {posters.map((p) => (
            <button
              key={p.id}
              onClick={() => setEditingPoster(p)}
              className="group overflow-hidden rounded-sm border border-border bg-card text-left transition hover:border-foreground/40"
            >
              <div className="aspect-square w-full overflow-hidden bg-muted">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="space-y-1 p-2">
                <div className="truncate text-xs font-medium">{p.title}</div>
                <div className="text-[10px] text-muted-foreground">
                  {p.hidden ? "○ Hidden" : "✓ Visible"}
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.trending && (
                    <span className="rounded-sm bg-success/15 px-1 py-0.5 text-[9px] font-semibold text-success">
                      🔥 Trending
                    </span>
                  )}
                  {p.is_best_seller && (
                    <span className="rounded-sm bg-warning/15 px-1 py-0.5 text-[9px] font-semibold text-warning">
                      ★ Best Seller
                    </span>
                  )}
                  {p.has_multiple_categories && (
                    <span className="rounded-sm bg-info/15 px-1 py-0.5 text-[9px] font-semibold text-info">
                      🔵 Multiple
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ---- Pagination ---- */}
      {posters && posters.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs">
          <button
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            className="rounded-sm border border-border px-3 py-1.5 uppercase tracking-widest hover:bg-accent disabled:opacity-40"
          >
            Previous
          </button>
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <button
            disabled={posters.length < PAGE_SIZE}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            className="rounded-sm border border-border px-3 py-1.5 uppercase tracking-widest hover:bg-accent disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-sm border border-border bg-card">
          <div className="aspect-square w-full animate-pulse bg-muted" />
          <div className="space-y-1.5 p-2">
            <div className="h-2.5 w-3/4 animate-pulse rounded-sm bg-muted" />
            <div className="h-2 w-1/2 animate-pulse rounded-sm bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
