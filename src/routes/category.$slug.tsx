import { createFileRoute, Link, Navigate, notFound } from "@tanstack/react-router";
import { LiveVisitors, RecentOrdersBadge } from "@/components/SocialProof";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useCategories,
  descendantIds,
  CATEGORIES_QUERY_KEY,
  fetchCategories,
  type Category,
} from "@/lib/use-categories";
import {
  FRAME_COLORS,
  FRAME_TYPES,
  sizesForFrame,
  SIZES,
  type FrameColorId,
  type FrameTypeId,
  type SizeId,
} from "@/lib/poster-options";
import { useCart } from "@/lib/cart";
import { whatsappLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FramedArtwork } from "@/components/FramedArtwork";
import { formatCount } from "@/lib/poster-badges";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { RelatedPosters } from "@/components/RelatedPosters";
import { CustomerReviews } from "@/components/CustomerReviews";
import { PosterGallery } from "@/components/PosterGallery";
import { trackEvent, enqueueEvent } from "@/lib/meta-pixel";
import { FrameComparison } from "@/components/FrameComparison";
import { BeforeAfter } from "@/components/BeforeAfter";
import { ProductInfoSections } from "@/components/ProductInfoSections";
import { useRecentlyViewed } from "@/lib/recently-viewed";
import { trackPosterView } from "@/lib/poster-tracking";
import { track as behavior } from "@/lib/behavior";
import { DEFAULT_EDIT_SETTINGS, normalizeEditSettings } from "@/lib/poster-edit";
import { usePricing, priceForFrame, useEnabledFrameVariants } from "@/lib/use-settings";
import { SizeGuide } from "@/components/SizeGuide";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Minus, Plus, Truck, Clock } from "lucide-react";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { useTranslation } from "react-i18next";
import { StickyProductBar, type BarAction } from "@/components/StickyProductBar";
import { useInfiniteProducts } from "@/hooks/useInfiniteProducts";
import { InfiniteProductGrid } from "@/components/InfiniteProductGrid";
import type { NormalizedProduct } from "@/hooks/useInfiniteProducts";

export type Poster = {
  id: string;
  title: string;
  image_url?: string;
  webp_srcset?: string | null;
  avif_srcset?: string | null;
  category_id: string | null;
  tags?: string[] | null;
  edit_settings?: unknown;
  badge?: string | null;
  sales_count?: number | null;
  views_count?: number | null;
  is_best_seller?: boolean | null;
};

type SortKey =
  "newest" | "popular" | "bestselling" | "az" | "manual" | "trending" | "random" | "ai";
type SortDef = { id: SortKey; label: string; col: string; asc: boolean };
const SORTS: SortDef[] = [
  { id: "newest", label: "Newest", col: "created_at", asc: false },
  { id: "bestselling", label: "Best Selling", col: "sales_count", asc: false },
  { id: "popular", label: "Most Viewed", col: "views_count", asc: false },
  { id: "az", label: "Alphabetically", col: "title", asc: true },
];

export const Route = createFileRoute("/category/$slug")({
  loader: async ({ context }) => {
    // Prefetches the categories list server-side so the category this slug
    // resolves to (and its subcategories, for the product filter below) are
    // available in the initial render instead of only after a client round
    // trip. Does not touch the product grid itself — useInfiniteProducts
    // stays client-driven, this only fixes the category-resolution half.
    await context.queryClient.ensureQueryData({
      queryKey: CATEGORIES_QUERY_KEY,
      queryFn: fetchCategories,
      staleTime: 60_000,
    });
  },
  head: ({ params }) => {
    const pretty = params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const title = `${pretty} Posters — BRWAZWNEON`;
    const description = `Browse our premium framed ${pretty} posters. High-quality prints in PVC and Wooden Portrait frames, delivered across Egypt with cash on delivery.`;
    const url = `https://brwazwneon.com/category/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: "https://brwazwneon.com/",
              },
              { "@type": "ListItem", position: 2, name: pretty, item: url },
            ],
          }),
        },
      ],
    };
  },
  component: CategoryPage,
  notFoundComponent: () => (
    <div className="container-page py-24 text-center">
      <h1 className="text-display text-4xl">Category not found</h1>
      <Link to="/" className="mt-6 inline-block underline">
        Back home
      </Link>
    </div>
  ),
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const isCustomSlug = slug === "custom";
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();

  // Resolved from the already-fetched categories list rather than its own
  // query — same data, one less round trip, and it was the last direct
  // supabase.from("categories") call left in this file.
  const category = isCustomSlug ? undefined : categories.find((c) => c.slug === slug);
  const catLoading = categoriesLoading;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Default the sort selector to what the admin configured for this category.
  const initialSort = (category?.sort_mode as SortKey | undefined) || "newest";
  const [sort, setSort] = useState<SortKey>(initialSort);
  useEffect(() => {
    const m = category?.sort_mode as SortKey | undefined;
    if (m && (SORTS.some((s) => s.id === m) || m === "manual")) {
      setSort(m);
    }
  }, [category?.id]);
  const [activeSubId, setActiveSubId] = useState<string>("");
  const { record } = useRecentlyViewed();

  const perf = usePerformanceFlags();
  const { t } = useTranslation();
  const sortLabels: Record<SortKey, string> = {
    newest: "category.sortNewest",
    bestselling: "category.sortPopular",
    popular: "category.sortPopular",
    az: "category.sortNameAsc",
    manual: "category.sortNewest",
    trending: "category.sortPopular",
    random: "category.sortNewest",
    ai: "category.sortPopular",
  };
  const sortLabel = (id: SortKey) => t(sortLabels[id]);

  // Retargeting: fire ViewCategory once per category mount.
  useEffect(() => {
    if (!category) return;
    enqueueEvent("ViewCategory", {
      category_id: category.id,
      category_slug: category.slug,
      category_name: category.name,
    });
    // Personalization: browsing a category is a strong interest signal.
    behavior.categoryBrowse(category.id);
  }, [category?.id]);

  const includedCategoryIds = useMemo(() => {
    if (!category) return [];
    if (activeSubId) return descendantIds(categories, activeSubId);
    return descendantIds(categories, category.id);
  }, [categories, category, activeSubId]);
  const subcategories = useMemo(
    () =>
      category
        ? categories.filter((c) => c.parent_id === category.id && !c.hidden && c.status !== "draft")
        : [],
    [categories, category],
  );

  // Reset sub filter when navigating to a different top category
  useEffect(() => {
    setActiveSubId("");
  }, [category?.id]);

  const {
    products,
    state: paginationState,
    error: paginationError,
    loadMore,
    retry,
  } = useInfiniteProducts(includedCategoryIds, { sort }, `category-${category?.id ?? slug}-${sort}-${activeSubId || "all"}`);

  const selectedPosters: Poster[] = useMemo(
    () =>
      selectedIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is NormalizedProduct => p != null)
        .map(
          (p) =>
            ({
              id: p.id,
              title: p.title,
              image_url: p.cardArtworkUrl,
              webp_srcset: p.webpSrcSet,
              avif_srcset: p.avifSrcSet,
              category_id: p.categoryId,
              badge: p.badge,
              sales_count: p.salesCount,
              views_count: p.viewsCount,
              is_best_seller: p.isBestSeller,
            }) as Poster,
        ),
    [selectedIds, products],
  );

  if (isCustomSlug) {
    return <Navigate to="/custom-design" replace />;
  }

  if (!catLoading && !category) throw notFound();

  const toggle = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    if (category) {
      record({
        id: p.id,
        title: p.title,
        image_url: p.cardArtworkUrl,
        category_id: p.categoryId,
        category_slug: category.slug,
        category_name: category.name,
      });
      trackPosterView(p.id);
      try {
        behavior.productView(p.id, { categoryId: p.categoryId, tags: [] });
      } catch {
        /* noop */
      }
      try {
        trackEvent("ViewContent", {
          content_ids: [p.id],
          content_name: p.title,
          content_type: "product",
          content_category: category.name,
          currency: "EGP",
        });
      } catch {
        /* noop */
      }
    }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <>
      <div className="container-page py-12">
        <div className="mb-2 text-xs uppercase tracking-[0.4em] text-muted-foreground">
          {t("home.collection")}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-display text-4xl sm:text-6xl">{category?.name ?? "…"}</h1>
          <p className="text-sm text-muted-foreground">{t("category.tapToSelect")}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <LiveVisitors variant="product" />
          <RecentOrdersBadge surface="product" />
        </div>

        {subcategories.length > 0 && (
          <div className="mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0 sm:overflow-visible sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setActiveSubId("")}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition",
                !activeSubId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t("category.all")}
            </button>
            {subcategories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveSubId(c.id === activeSubId ? "" : c.id)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition",
                  activeSubId === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("category.sortBy")}
          </span>
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={cn(
                "rounded-sm border px-3 py-1.5 text-xs uppercase tracking-widest transition",
                sort === s.id
                  ? "border-primary bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {sortLabel(s.id)}
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.85fr_minmax(440px,540px)]">
          <div>
            {catLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[2/3] animate-pulse rounded-sm bg-muted/30" />
                ))}
              </div>
            ) : (
              <InfiniteProductGrid
                products={products}
                state={paginationState}
                error={paginationError}
                selectedIds={selectedIds}
                onToggle={toggle}
                onLoadMore={loadMore}
                onRetry={retry}
              />
            )}
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-[90px] lg:self-start lg:h-[calc(100vh-110px)]">
            {selectedPosters.length > 0 && category ? (
              <Customizer
                posters={selectedPosters}
                category={category}
                onRemove={(id) => setSelectedIds((prev) => prev.filter((x) => x !== id))}
                onClear={() => setSelectedIds([])}
              />
            ) : (
              <div className="rounded-sm border border-border bg-card p-8 text-center">
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {t("category.step")} 1
                </div>
                <p className="mt-3 text-lg">{t("category.selectPosters")}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t("category.tapToSelect")}</p>
                <Link
                  to="/offers"
                  className="mt-6 inline-flex rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
                >
                  {t("nav.orGrabBundle")}
                </Link>
              </div>
            )}
          </aside>

          {selectedPosters.length > 0 && category && (
            <MobileCustomizerBar
              posters={selectedPosters}
              category={category}
              onRemove={(id) => setSelectedIds((prev) => prev.filter((x) => x !== id))}
              onClear={() => setSelectedIds([])}
            />
          )}
        </div>

        {subcategories.length > 0 && (
          <div className="mt-16 border-t border-border pt-10">
            <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              {t("category.moreIn")} {category?.name ?? "this collection"}
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {subcategories.map((c) => (
                <Link
                  key={c.slug}
                  to="/category/$slug"
                  params={{ slug: c.slug }}
                  className="rounded-sm border border-border px-4 py-2 text-sm hover:bg-accent"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      {selectedPosters[0] && (
        <RelatedPosters
          poster={selectedPosters[0]}
          categorySlug={category?.slug}
          categoryName={category?.name}
        />
      )}
      {selectedPosters[0] && <FrameComparison />}
      {selectedPosters[0] && <BeforeAfter location="product" />}
      {!perf.emergency_fast_mode && <RecentlyViewed />}
      {!perf.emergency_fast_mode && <CustomerReviews posterId={selectedPosters[0]?.id} />}
      {!perf.emergency_fast_mode && <ProductInfoSections variant="all" />}
    </>
  );
}

export function Customizer({
  posters,
  category,
  onRemove,
  onClear,
}: {
  posters: Poster[];
  category: Category;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  type PerPoster = { frameType: FrameTypeId; size: SizeId; color: FrameColorId };
  const normalizeCombo = (c: PerPoster): PerPoster => {
    const { frameType } = c;
    let { size, color } = c;
    if (frameType === "wood") {
      color = "wood";
    } else if (color === "wood") {
      color = "black";
    }
    const allowed = sizesForFrame(frameType);
    if (!allowed.includes(size)) size = allowed[0];
    return { frameType, size, color };
  };
  const [frameType, setFrameType] = useState<FrameTypeId>("pvc");
  const [size, setSize] = useState<SizeId>("30x40");
  const [color, setColor] = useState<FrameColorId>("black");
  const [applyAll, setApplyAll] = useState(true);
  const [perPoster, setPerPoster] = useState<Record<string, PerPoster>>({});
  const enabledVariants = useEnabledFrameVariants();
  const [quantity, setQuantity] = useState(1);
  const [previewIndex, setPreviewIndex] = useState(0);
  useEffect(() => {
    if (previewIndex > posters.length - 1) setPreviewIndex(0);
  }, [posters.length, previewIndex]);
  // Seed per-poster settings for any newly added poster from the current
  // shared defaults so each image starts with sensible values.
  useEffect(() => {
    setPerPoster((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of posters) {
        if (!next[p.id]) {
          next[p.id] = { frameType, size, color };
          changed = true;
        }
      }
      // Prune removed
      for (const id of Object.keys(next)) {
        if (!posters.find((p) => p.id === id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // Only depend on posters length + ids
  }, [posters.map((p) => p.id).join(","), frameType, size, color]);

  const primaryIdEarly = posters[previewIndex]?.id ?? posters[0]?.id ?? "";
  const current: PerPoster = perPoster[primaryIdEarly] ?? { frameType, size, color };

  const applyPatch = (patch: Partial<PerPoster>) => {
    setPerPoster((prev) => {
      const next = { ...prev };
      if (applyAll) {
        for (const p of posters) {
          const base = next[p.id] ?? { frameType, size, color };
          next[p.id] = normalizeCombo({ ...base, ...patch });
        }
      } else {
        const base = next[primaryIdEarly] ?? { frameType, size, color };
        next[primaryIdEarly] = normalizeCombo({ ...base, ...patch });
      }
      return next;
    });
    if (applyAll) {
      if (patch.frameType !== undefined) setFrameType(patch.frameType);
      if (patch.size !== undefined) setSize(patch.size);
      if (patch.color !== undefined) setColor(patch.color);
    }
  };

  const handleFrameType = (next: FrameTypeId) => {
    const base = current;
    const combo = normalizeCombo({
      frameType: next,
      size: base.size,
      color: base.color,
    });
    applyPatch(combo);
  };
  const { add } = useCart();
  const pricing = usePricing();
  const isCustom = /custom/i.test(category.slug) || /custom/i.test(category.name);
  const unitFor = (id: string) => {
    const s = perPoster[id] ?? { frameType, size, color };
    return priceForFrame(pricing, s.frameType, s.size) + (isCustom ? pricing.customDesignFee : 0);
  };
  const postersUnitSum = posters.reduce((sum, p) => sum + unitFor(p.id), 0);
  const total = postersUnitSum * quantity;

  const primary = posters[previewIndex] ?? posters[0];
  const goPrev = () => setPreviewIndex((i) => (i - 1 + posters.length) % posters.length);
  const goNext = () => setPreviewIndex((i) => (i + 1) % posters.length);

  const handleAdd = () => {
    for (let n = 0; n < quantity; n++) {
      posters.forEach((poster) => {
        const s = perPoster[poster.id] ?? { frameType, size, color };
        add({
          posterId: poster.id,
          title: poster.title,
          image: poster.image_url ?? "",
          categoryId: category.id,
          categoryName: category.name,
          frameType: s.frameType,
          size: s.size,
          color: s.color,
          price: unitFor(poster.id),
          editSettings: normalizeEditSettings(poster.edit_settings) ?? DEFAULT_EDIT_SETTINGS,
        });
      });
    }
    const totalItems = posters.length * quantity;
    toast.success(t("product.addToCart", { count: totalItems }));
    onClear();
  };

  const waMsg =
    `Hi BRWAZWNEON, I'd like to order:\n` +
    posters
      .map((p, i) => {
        const s = perPoster[p.id] ?? { frameType, size, color };
        return `${i + 1}. ${p.title} — ${FRAME_TYPES.find((f) => f.id === s.frameType)?.label}, ${SIZES.find((x) => x.id === s.size)?.label}, ${FRAME_COLORS.find((c) => c.id === s.color)?.label}`;
      })
      .join("\n") +
    `\nQuantity: ${quantity}` +
    `\nTotal: ${total} EGP`;

  return (
    <div className="flex h-full flex-col rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {posters.length} {t("category.selected")}
        </div>
        <button
          onClick={onClear}
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          {t("common.clearAll")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-3 [scrollbar-width:thin]">
        <div className="relative mx-auto flex w-full items-center justify-center gap-2">
          {posters.length > 1 && (
            <button
              type="button"
              onClick={goPrev}
              aria-label={t("category.previousPoster")}
              className="absolute left-0 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/90 shadow hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="w-full max-w-[min(340px,36vh)]">
            <PosterGallery
              key={primary.id}
              posterId={primary.id}
              posterUrl={primary.image_url ?? ""}
              avifSrcSet={primary.avif_srcset ?? undefined}
              webpSrcSet={primary.webp_srcset ?? undefined}
              title={primary.title}
              frameType={current.frameType}
              color={current.color}
              editSettings={primary.edit_settings}
            />
          </div>
          {posters.length > 1 && (
            <button
              type="button"
              onClick={goNext}
              aria-label={t("category.nextPoster")}
              className="absolute right-0 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/90 shadow hover:bg-accent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
        {posters.length > 1 && (
          <div className="mt-2 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Preview {previewIndex + 1} / {posters.length} · {primary.title}
          </div>
        )}
        {(primary.sales_count ?? 0) > 0 ||
        (primary.views_count ?? 0) > 0 ||
        primary.is_best_seller ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {(primary.sales_count ?? 0) > 0 && (
              <span>✔ {formatCount(primary.sales_count)} sold</span>
            )}
            {(primary.views_count ?? 0) > 0 && (
              <span>👁 {formatCount(primary.views_count)} views</span>
            )}
            {primary.is_best_seller ? (
              <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
                ⭐ {t("category.bestSeller")}
              </span>
            ) : null}
          </div>
        ) : null}
        {posters.length > 1 && (
          <div className="mt-3 grid grid-cols-5 gap-2">
            {posters.map((p, i) => {
              const s = perPoster[p.id] ?? { frameType, size, color };
              return (
                <div
                  key={p.id}
                  className={cn(
                    "group relative aspect-[2/3] overflow-hidden rounded-sm border transition",
                    i === previewIndex
                      ? "border-primary ring-2 ring-primary"
                      : "border-transparent hover:border-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(i)}
                    aria-label={`Preview ${p.title}`}
                    className="absolute inset-0 z-10"
                  />
                  <FramedArtwork
                    posterUrl={p.image_url ?? ""}
                    avifSrcSet={p.avif_srcset ?? undefined}
                    webpSrcSet={p.webp_srcset ?? undefined}
                    title={p.title}
                    frameType={s.frameType}
                    color={s.color}
                    editSettings={p.edit_settings}
                    className="h-full w-full"
                  />
                  <span className="pointer-events-none absolute bottom-0 inset-x-0 z-10 bg-background/85 px-1 py-0.5 text-center text-[8px] font-semibold uppercase tracking-widest">
                    {s.size}
                  </span>
                  <button
                    onClick={() => onRemove(p.id)}
                    aria-label={`Remove ${p.title}`}
                    className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 opacity-0 transition group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {posters.length > 1 && (
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-sm border border-border bg-background/60 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest">
              {applyAll
                ? t("category.sameOptionsForAll")
                : `${t("category.editing")}: ${primary.title}`}
            </span>
            <input
              type="checkbox"
              checked={applyAll}
              onChange={(e) => setApplyAll(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        )}

        <OptionGroup label={t("product.frameType")}>
          {FRAME_TYPES.map((f) => (
            <OptionButton
              key={f.id}
              active={current.frameType === f.id}
              onClick={() => handleFrameType(f.id)}
            >
              {t(`product.frame_${f.id}` as const)}
            </OptionButton>
          ))}
        </OptionGroup>

        <OptionGroup label={t("product.size")}>
          {sizesForFrame(current.frameType).map((sid) => {
            const s = SIZES.find((x) => x.id === sid)!;
            return (
              <OptionButton
                key={s.id}
                active={current.size === s.id}
                onClick={() => applyPatch({ size: s.id })}
              >
                {t(`product.size_${s.id}` as const)}
              </OptionButton>
            );
          })}
        </OptionGroup>
        <SizeGuide availableIds={sizesForFrame(current.frameType)} />

        {current.frameType !== "wood" && enabledVariants.some((v) => v !== "wood") && (
          <OptionGroup label={t("product.frameColor")}>
            {FRAME_COLORS.filter((c) => c.id !== "wood" && enabledVariants.includes(c.id)).map(
              (c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => applyPatch({ color: c.id })}
                  className={cn(
                    "flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition",
                    current.color === c.id
                      ? "border-primary bg-accent"
                      : "border-border hover:border-muted-foreground",
                  )}
                >
                  <span
                    className="h-5 w-5 rounded-full border border-border"
                    style={{ backgroundColor: c.swatch }}
                  />
                  {t(`product.color_${c.id}` as const)}
                </button>
              ),
            )}
          </OptionGroup>
        )}

        <OptionGroup label={t("product.quantity")}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-sm border border-border hover:bg-accent"
              aria-label={t("product.decreaseQty")}
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="min-w-[3rem] text-center text-lg font-semibold">{quantity}</div>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              className="flex h-9 w-9 items-center justify-center rounded-sm border border-border hover:bg-accent"
              aria-label={t("product.increaseQty")}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </OptionGroup>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-card px-5 py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="text-display text-3xl leading-none">
            {total} <span className="text-base text-muted-foreground">EGP</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {postersUnitSum} EGP × {quantity}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleAdd}
            className="rounded-sm bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 inline-flex items-center justify-center gap-2"
          >
            <Check className="h-4 w-4" /> {t("category.addToCart", { count: posters.length })}
          </button>
          <a
            href={whatsappLink(waMsg)}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-border px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest hover:bg-accent"
          >
            {t("nav.whatsappOrder")}
          </a>
        </div>
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Truck className="h-3.5 w-3.5" />
            <span>{t("product.shippingInfo")}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{t("product.productionTime")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileCustomizerBar({
  posters,
  category,
  onRemove,
  onClear,
}: {
  posters: Poster[];
  category: Category;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const pricing = usePricing();
  const isCustom = /custom/i.test(category.slug) || /custom/i.test(category.name);
  const isRtl = i18n.language?.startsWith("ar");
  // Quick estimate at default 30x40 PVC for the bar
  const estUnit = priceForFrame(pricing, "pvc", "30x40") + (isCustom ? pricing.customDesignFee : 0);
  const estTotal = estUnit * posters.length;
  const priceLabel = `${estTotal} EGP`;

  const customizeAction: BarAction = {
    kind: "customize",
    label: isRtl ? "تخصيص التصميم" : "CUSTOMIZE",
    onClick: () => setOpen(true),
  };

  const cartAction: BarAction = {
    kind: "cart",
    label: t("category.customize"),
    onClick: () => setOpen(true),
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <StickyProductBar
        content={{
          price: priceLabel,
          size: `${posters.length} ${t("category.selected")}`,
        }}
        primary={customizeAction}
        secondary={cartAction}
      />
      <SheetContent side="bottom" className="h-[92vh] overflow-hidden p-0" style={{ zIndex: 80 }}>
        <div className="h-full">
          <Customizer
            posters={posters}
            category={category}
            onRemove={onRemove}
            onClear={() => {
              onClear();
              setOpen(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm border px-3 py-2 text-sm transition",
        active
          ? "border-primary bg-accent text-foreground"
          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
