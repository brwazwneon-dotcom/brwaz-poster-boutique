import { useEffect, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  ImageOff,
  Loader2,
  RotateCcw,
  ChevronDown,
  Pencil,
  Eye,
  EyeOff,
  Flame,
  Star,
  MoreHorizontal,
} from "lucide-react";
import {
  searchCategoryImagesAdmin,
  bulkUpdatePosters,
  bulkSetPosterCategoryAdmin,
  deletePoster,
  type CategoryImageFilter,
} from "@/lib/db-admin.functions";
import { PosterEditorPanel } from "@/components/admin/PosterEditorPanel";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";
import type { AdminCategory, AdminPoster } from "@/components/admin/tabs/shared";

const PAGE_SIZE = 24;
// Same threshold ProductsTab's own Additional-Category bulk action uses —
// confirm first for a large batch, not for a quick handful.
const CONFIRM_THRESHOLD = 20;

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
  category_id: string | null;
  trending: boolean;
  trending_order: number | null;
  is_best_seller: boolean;
  best_seller_order: number | null;
  has_multiple_categories: boolean;
  category: { name: string; slug: string } | null;
};

type BulkPanel = null | "add_category" | "remove_category";

/**
 * Phase 2/3 of the Categories → Poster Management Center plan: browsing,
 * filtering, multi-selecting, bulk-editing, and single-editing every
 * poster in one category "tree" without ever leaving the Categories tab.
 *
 * Bulk actions reuse the exact same server functions ProductsTab's own
 * bulk bar already calls (bulkUpdatePosters, bulkSetPosterCategoryAdmin) —
 * one request per action, never one per selected poster. Single-poster
 * editing reuses PosterEditorPanel from Phase 1 — no separate editor.
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
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<CategoryImageFilter>("all");
  const [offset, setOffset] = useState(0);
  const [editingPoster, setEditingPoster] = useState<CategoryImageRow | null>(null);

  // ---- Selection (Phase 3) ----
  // A page/filter/search change invalidates the loaded result set, so
  // selection is cleared then too — never carries stale ids from a
  // different set of posters into a bulk action. Opening/closing the
  // single-poster editor deliberately does NOT clear it (an admin fixing
  // one poster's title mid-way through a bulk job shouldn't lose the rest
  // of their selection) — bulk actions below always operate on the
  // intersection with the currently-loaded page anyway, so a poster that
  // no longer matches after a save can never be silently included.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionsOpen, setActionsOpen] = useState(false);
  const [bulkPanel, setBulkPanel] = useState<BulkPanel>(null);
  const [bulkCategoryChoice, setBulkCategoryChoice] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  // ---- Per-card Quick Actions ----
  // A poster id currently running any quick action — disables that
  // card's whole action row (not just the clicked button) so two
  // concurrent patches on the same poster can never race, and a
  // second click can never fire a duplicate request.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [cardMenuFor, setCardMenuFor] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // Clear selection whenever the underlying result set changes.
  useEffect(() => {
    setSelected(new Set());
    setActionsOpen(false);
    setBulkPanel(null);
  }, [debouncedSearch, filter, offset]);

  // Close the Actions dropdown on an outside click.
  useEffect(() => {
    if (!actionsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
        setBulkPanel(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [actionsOpen]);

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
    // Keeps the previous page's grid on screen (instead of flashing back
    // to the skeleton) while a new search/filter/page request is
    // in-flight — the pagination row's own spinner already signals that.
    placeholderData: keepPreviousData,
  });

  const changeFilter = (f: CategoryImageFilter) => {
    setFilter(f);
    setOffset(0);
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOnPageSelected = Boolean(posters?.length) && posters!.every((p) => selected.has(p.id));
  const toggleSelectAllOnPage = () =>
    setSelected((prev) => {
      if (!posters) return prev;
      if (allOnPageSelected) return new Set();
      return new Set(posters.map((p) => p.id));
    });

  // Selection intersected with what's actually loaded right now — self-
  // heals if a poster left this result set (e.g. a Save moved it to a
  // different category) after a refetch, instead of trusting stale ids.
  const selectedPosters = (posters ?? []).filter((p) => selected.has(p.id));
  const selectedIds = selectedPosters.map((p) => p.id);
  const selectedCount = selectedIds.length;

  const closeBulkUI = () => {
    setActionsOpen(false);
    setBulkPanel(null);
    setBulkCategoryChoice("");
  };

  const runBulkUpdate = async (
    patch: { hidden?: boolean; trending?: boolean; is_best_seller?: boolean },
    successVerb: string,
  ) => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      await bulkUpdatePosters({ data: { ids: selectedIds, patch } });
      toast.success(`${successVerb} ${selectedIds.length} poster(s)`);
      setSelected(new Set());
      closeBulkUI();
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleHide = async () => {
    if (selectedIds.length === 0) return;
    if (!(await confirm(`Hide ${selectedIds.length} poster(s)?`))) return;
    runBulkUpdate({ hidden: true }, "Hid");
  };
  const handleUnhide = () => runBulkUpdate({ hidden: false }, "Unhid");
  const handleTrendingOn = () => runBulkUpdate({ trending: true }, "Added to Trending:");
  const handleTrendingOff = () => runBulkUpdate({ trending: false }, "Removed from Trending:");
  const handleBestSellerOn = () => runBulkUpdate({ is_best_seller: true }, "Added to Best Seller:");
  const handleBestSellerOff = () =>
    runBulkUpdate({ is_best_seller: false }, "Removed from Best Seller:");

  // The category selected here is the one that will be added/removed as
  // an ADDITIONAL category (poster_categories) — this can never touch
  // posters.category_id (the primary category), regardless of what's
  // picked, since bulkSetPosterCategoryAdmin only ever writes to the
  // junction table. The primaryConflictCount below is purely informational
  // (some posters may have this same category as their PRIMARY already,
  // where "remove" would correctly have nothing to remove there).
  const primaryConflictCount =
    bulkPanel === "remove_category" && bulkCategoryChoice
      ? selectedPosters.filter((p) => p.category_id === bulkCategoryChoice).length
      : 0;

  const applyBulkCategory = async (mode: "add" | "remove") => {
    if (selectedIds.length === 0 || !bulkCategoryChoice) return;
    if (
      selectedIds.length > CONFIRM_THRESHOLD &&
      !(await confirm(
        `${mode === "add" ? "Add" : "Remove"} this category ${mode === "add" ? "to" : "from"} ${selectedIds.length} posters?`,
      ))
    )
      return;
    setBulkBusy(true);
    try {
      await bulkSetPosterCategoryAdmin({
        data: { posterIds: selectedIds, categoryId: bulkCategoryChoice, mode },
      });
      toast.success(`Updated ${selectedIds.length} poster(s)`);
      setSelected(new Set());
      closeBulkUI();
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    if (
      !(await confirm(
        `Delete ${selectedIds.length} poster(s)? These posters will be permanently removed.`,
      ))
    )
      return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => deletePoster({ data: id })));
      const failed = results.filter((r) => r.status === "rejected").length;
      const ok = selectedIds.length - failed;
      if (ok > 0) toast.success(`Deleted ${ok} poster(s)`);
      if (failed > 0) toast.error(`${failed} poster(s) failed to delete`);
      setSelected(new Set());
      closeBulkUI();
      refetch();
    } finally {
      setBulkBusy(false);
    }
  };

  // ---- Quick Actions (per poster card) ----
  // Same bulkUpdatePosters/deletePoster calls as the bulk bar above, just
  // with a one-element ids array — no second backend function, no
  // duplicated patch logic. A real production write fires the moment the
  // admin clicks one of these (Hide/Trending/Best Seller), by design —
  // unlike the bulk bar's category/delete actions there's no extra
  // confirm step for these three, matching how instant a single toggle
  // is expected to feel; Delete still confirms, same wording as the bulk
  // one, just for the one poster.
  const runQuickUpdate = async (
    poster: CategoryImageRow,
    patch: { hidden?: boolean; trending?: boolean; is_best_seller?: boolean },
    successMsg: string,
  ) => {
    if (busyIds.has(poster.id)) return;
    setBusyIds((prev) => new Set(prev).add(poster.id));
    try {
      await bulkUpdatePosters({ data: { ids: [poster.id], patch } });
      toast.success(successMsg);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(poster.id);
        return next;
      });
    }
  };

  const quickToggleHide = (poster: CategoryImageRow) =>
    runQuickUpdate(
      poster,
      { hidden: !poster.hidden },
      poster.hidden ? `"${poster.title}" is now visible` : `"${poster.title}" is now hidden`,
    );
  const quickToggleTrending = (poster: CategoryImageRow) =>
    runQuickUpdate(
      poster,
      { trending: !poster.trending },
      poster.trending
        ? `Removed "${poster.title}" from Trending`
        : `Added "${poster.title}" to Trending`,
    );
  const quickToggleBestSeller = (poster: CategoryImageRow) =>
    runQuickUpdate(
      poster,
      { is_best_seller: !poster.is_best_seller },
      poster.is_best_seller
        ? `Removed "${poster.title}" from Best Seller`
        : `Added "${poster.title}" to Best Seller`,
    );

  // Reuses the exact same bulk category picker UI (Add/Remove Category
  // above) by selecting just this one poster and opening it directly —
  // no second category-management UI.
  const openCategoriesFor = (poster: CategoryImageRow) => {
    setCardMenuFor(null);
    setSelected(new Set([poster.id]));
    setActionsOpen(true);
    setBulkPanel(null);
  };

  const quickDelete = async (poster: CategoryImageRow) => {
    setCardMenuFor(null);
    if (!(await confirm(`Delete "${poster.title}"? This poster will be permanently removed.`)))
      return;
    setBusyIds((prev) => new Set(prev).add(poster.id));
    try {
      await deletePoster({ data: poster.id });
      toast.success(`Deleted "${poster.title}"`);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(poster.id);
        return next;
      });
    }
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
            aria-label="Search posters"
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
            aria-pressed={filter === f.value}
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

      {/* ---- Select all on this page ---- */}
      {posters && posters.length > 0 && (
        <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} />
          Select all {posters.length} on this page
        </label>
      )}

      {/* ---- Bulk action bar ---- */}
      {selectedCount > 0 && (
        <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-3 rounded-sm border border-primary/40 bg-primary/5 p-3">
          <span className="text-xs font-medium">{selectedCount} selected</span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear selection
          </button>

          <div ref={actionsRef} className="relative ml-auto">
            <button
              onClick={() => setActionsOpen((o) => !o)}
              disabled={bulkBusy}
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              className="flex items-center gap-1 rounded-sm border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              {bulkBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  Actions
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>

            {actionsOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-sm border border-border bg-card p-2 shadow-lg">
                {bulkPanel === "add_category" || bulkPanel === "remove_category" ? (
                  <div className="space-y-2">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {bulkPanel === "add_category" ? "Add Category" : "Remove Category"}
                    </p>
                    <select
                      value={bulkCategoryChoice}
                      onChange={(e) => setBulkCategoryChoice(e.target.value)}
                      aria-label={bulkPanel === "add_category" ? "Add category" : "Remove category"}
                      className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="">Choose a category…</option>
                      {categories
                        .filter((c) => !c.parent_id)
                        .map((main) => {
                          const subs = categories.filter((c) => c.parent_id === main.id);
                          return (
                            <optgroup key={main.id} label={main.name}>
                              <option value={main.id}>{main.name}</option>
                              {subs.map((s) => (
                                <option key={s.id} value={s.id}>
                                  — {s.name}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                    </select>
                    {bulkPanel === "remove_category" && primaryConflictCount > 0 && (
                      <p className="rounded-sm bg-warning/10 p-2 text-[10px] text-warning">
                        {primaryConflictCount} of the selected posters have this as their PRIMARY
                        category — removing it here only affects Additional Categories and never
                        changes a primary category.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        disabled={!bulkCategoryChoice || bulkBusy}
                        onClick={() =>
                          applyBulkCategory(bulkPanel === "add_category" ? "add" : "remove")
                        }
                        className="flex-1 rounded-sm bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => {
                          setBulkPanel(null);
                          setBulkCategoryChoice("");
                        }}
                        className="rounded-sm border border-border px-2 py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <BulkMenuButton onClick={() => setBulkPanel("add_category")}>
                      Add Category
                    </BulkMenuButton>
                    <BulkMenuButton onClick={() => setBulkPanel("remove_category")}>
                      Remove Category
                    </BulkMenuButton>
                    <div className="my-1 border-t border-border" />
                    <BulkMenuButton onClick={handleTrendingOn} disabled={bulkBusy}>
                      Add to Trending
                    </BulkMenuButton>
                    <BulkMenuButton onClick={handleTrendingOff} disabled={bulkBusy}>
                      Remove from Trending
                    </BulkMenuButton>
                    <div className="my-1 border-t border-border" />
                    <BulkMenuButton onClick={handleBestSellerOn} disabled={bulkBusy}>
                      Add to Best Seller
                    </BulkMenuButton>
                    <BulkMenuButton onClick={handleBestSellerOff} disabled={bulkBusy}>
                      Remove from Best Seller
                    </BulkMenuButton>
                    <div className="my-1 border-t border-border" />
                    <BulkMenuButton onClick={handleHide} disabled={bulkBusy}>
                      Hide
                    </BulkMenuButton>
                    <BulkMenuButton onClick={handleUnhide} disabled={bulkBusy}>
                      Unhide
                    </BulkMenuButton>
                    <div className="my-1 border-t border-border" />
                    <BulkMenuButton onClick={handleDelete} disabled={bulkBusy} danger>
                      Delete
                    </BulkMenuButton>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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
          {posters.map((p) => {
            const busy = busyIds.has(p.id);
            return (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-sm border border-border bg-card text-left transition hover:border-foreground/40"
              >
                <label
                  className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-sm bg-background/90"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelected(p.id)}
                    aria-label={`Select ${p.title}`}
                  />
                </label>
                <button onClick={() => setEditingPoster(p)} className="block w-full text-left">
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

                {/* ---- Quick Actions — one request per click, no editor
                     required. Disabling the whole row while `busy` (rather
                     than just the clicked button) prevents two concurrent
                     patches racing on the same poster. ---- */}
                <div className="flex items-center gap-0.5 border-t border-border p-1">
                  <button
                    onClick={() => setEditingPoster(p)}
                    disabled={busy}
                    title="Edit"
                    aria-label={`Edit ${p.title} poster`}
                    className="flex flex-1 items-center justify-center rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => quickToggleHide(p)}
                    disabled={busy}
                    title={p.hidden ? "Show" : "Hide"}
                    aria-label={p.hidden ? `Show ${p.title} poster` : `Hide ${p.title} poster`}
                    className="flex flex-1 items-center justify-center rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  >
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : p.hidden ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={() => quickToggleTrending(p)}
                    disabled={busy}
                    title={p.trending ? "Remove Trending" : "Trending"}
                    aria-label={
                      p.trending
                        ? `Remove ${p.title} poster from Trending`
                        : `Add ${p.title} poster to Trending`
                    }
                    className={`flex flex-1 items-center justify-center rounded-sm p-1 hover:bg-accent disabled:opacity-40 ${
                      p.trending ? "text-success" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Flame className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => quickToggleBestSeller(p)}
                    disabled={busy}
                    title={p.is_best_seller ? "Remove Best Seller" : "Best Seller"}
                    aria-label={
                      p.is_best_seller
                        ? `Remove ${p.title} poster from Best Seller`
                        : `Add ${p.title} poster to Best Seller`
                    }
                    className={`flex flex-1 items-center justify-center rounded-sm p-1 hover:bg-accent disabled:opacity-40 ${
                      p.is_best_seller
                        ? "text-warning"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Star className="h-3 w-3" />
                  </button>
                  <CardMoreMenu
                    poster={p}
                    busy={busy}
                    open={cardMenuFor === p.id}
                    onOpen={() => setCardMenuFor(p.id)}
                    onClose={() => setCardMenuFor(null)}
                    onCategories={() => openCategoriesFor(p)}
                    onDelete={() => quickDelete(p)}
                  />
                </div>
              </div>
            );
          })}
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

function CardMoreMenu({
  poster,
  busy,
  open,
  onOpen,
  onClose,
  onCategories,
  onDelete,
}: {
  poster: CategoryImageRow;
  busy: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCategories: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative flex-1">
      <button
        onClick={() => (open ? onClose() : onOpen())}
        disabled={busy}
        title="More"
        aria-label={`More actions for ${poster.title} poster`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center justify-center rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <MoreHorizontal className="h-3 w-3" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-40 rounded-sm border border-border bg-card p-1 shadow-lg"
        >
          <button
            role="menuitem"
            onClick={onCategories}
            aria-label={`Manage categories for ${poster.title} poster`}
            className="w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
          >
            Categories
          </button>
          <button
            role="menuitem"
            onClick={onDelete}
            aria-label={`Delete ${poster.title} poster`}
            className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-red-500 hover:bg-accent"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function BulkMenuButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-40 ${
        danger ? "text-red-500" : ""
      }`}
    >
      {children}
    </button>
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
