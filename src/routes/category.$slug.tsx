import { createFileRoute, Link, Navigate, notFound, useNavigate } from "@tanstack/react-router";
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
import {
  usePricing,
  priceForFrame,
  useEnabledFrameVariants,
  useFrameMockups,
} from "@/lib/use-settings";
import { usePosterConfig, MOST_POPULAR_SIZE, type PosterConfigurator } from "@/lib/poster-config";
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
    //
    // This also populates useCategories()'s react-query cache, but that
    // cache lives in a QueryClient created fresh per environment (see
    // getRouter() in src/router.tsx) — there's no dehydration bridging the
    // server's populated cache to the client's empty one, so useCategories()
    // alone would resolve to two different values on the server's render
    // and the client's first paint: a real, reproducible hydration
    // mismatch. Returning the same data as loaderData sidesteps that,
    // since TanStack Router already serializes loaderData to the client
    // reliably (the same mechanism poster.$slug.tsx relies on) — the
    // component below falls back to it until useCategories() itself
    // resolves on the client.
    const categories = await context.queryClient.ensureQueryData({
      queryKey: CATEGORIES_QUERY_KEY,
      queryFn: fetchCategories,
      staleTime: 60_000,
    });
    return { categories };
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

// True from the `lg` breakpoint up, where the options panel sits beside the grid
// and the phone bar / bottom sheet must not appear as well.
function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

function CategoryPage() {
  const { slug } = Route.useParams();
  const isCustomSlug = slug === "custom";
  const { categories: loaderCategories } = Route.useLoaderData();
  // Falls back to the loader's data (identical on server and client — see
  // the loader's own comment) until this client-only query resolves, so
  // the very first client render matches what the server sent instead of
  // briefly rendering with an empty categories list.
  const { data: categories = loaderCategories, isLoading: categoriesLoading } = useCategories();

  // Resolved from the already-fetched categories list rather than its own
  // query — same data, one less round trip, and it was the last direct
  // supabase.from("categories") call left in this file.
  const category = isCustomSlug ? undefined : categories.find((c) => c.slug === slug);
  const catLoading = categoriesLoading;

  // ONE active poster drives the preview, the option panel and the cart. The
  // grid highlights it, the panel shows it — nothing else holds a selection.
  const [activePosterId, setActivePosterId] = useState<string | null>(null);
  // Frame / size / colour / quantity, shared by the panel and the phone bar.
  const configurator = usePosterConfig();
  const isDesktop = useIsDesktop();
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
  // bestselling/popular used to share the same "Most Popular" key, so the
  // two SORTS buttons that render them (see below) showed the identical
  // label — a real, visible duplicate, not just an admin-config alias.
  // Each now points at its own already-existing, distinct translation.
  const sortLabels: Record<SortKey, string> = {
    newest: "category.sortNewest",
    bestselling: "category.sortBestSelling",
    popular: "category.sortMostViewed",
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
  } = useInfiniteProducts(
    includedCategoryIds,
    { sort },
    `category-${category?.id ?? slug}-${sort}-${activeSubId || "all"}`,
  );

  // The active poster always comes from the grid's loaded products, so the
  // preview can only ever show a poster that is really listed (deleted or
  // hidden posters are never returned by the catalog query).
  const productsById = useMemo(() => {
    const m = new Map<string, NormalizedProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);
  const activeFromGrid = activePosterId ? productsById.get(activePosterId) : undefined;
  const activePoster: Poster | null = useMemo(
    () =>
      activeFromGrid
        ? {
            id: activeFromGrid.id,
            title: activeFromGrid.title,
            image_url: activeFromGrid.cardArtworkUrl,
            webp_srcset: activeFromGrid.webpSrcSet,
            avif_srcset: activeFromGrid.avifSrcSet,
            category_id: activeFromGrid.categoryId,
            badge: activeFromGrid.badge,
            sales_count: activeFromGrid.salesCount,
            views_count: activeFromGrid.viewsCount,
            is_best_seller: activeFromGrid.isBestSeller,
          }
        : null,
    [activeFromGrid],
  );

  // A different category, sub-category or sort is a different list: drop the
  // selection right away so no preview of the old context is left behind.
  const listKey = `${category?.id ?? slug}|${sort}|${activeSubId}`;
  useEffect(() => {
    setActivePosterId(null);
  }, [listKey]);
  // Safety net: once the list has finished loading, an active poster that is
  // not in it (e.g. after a reload of the list) is cleared, not kept as a ghost.
  const listSettled =
    paginationState === "end" || (paginationState === "idle" && products.length > 0);
  useEffect(() => {
    if (activePosterId && listSettled && !productsById.has(activePosterId)) {
      setActivePosterId(null);
    }
  }, [activePosterId, listSettled, productsById]);

  if (isCustomSlug) {
    return <Navigate to="/custom-design" replace />;
  }

  if (!catLoading && !category) throw notFound();

  const selectPoster = (id: string) => {
    // Clicking the active poster again keeps it active; any other poster
    // replaces it immediately.
    if (id === activePosterId) return;
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
    setActivePosterId(id);
    configurator.setQuantity(1);
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
        {/* The badges appear after load; reserving their height keeps the
            rest of the page from jumping down when they do. */}
        <div className="mt-4 flex min-h-[60px] flex-wrap content-start items-center gap-3 sm:min-h-[30px]">
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
                selectedIds={activePosterId ? [activePosterId] : []}
                onToggle={selectPoster}
                selectionMode="single"
                onLoadMore={loadMore}
                onRetry={retry}
              />
            )}
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-[90px] lg:self-start lg:h-[calc(100vh-110px)]">
            {activePoster && category ? (
              <Customizer
                poster={activePoster}
                category={category}
                configurator={configurator}
                onClose={() => setActivePosterId(null)}
                fitHeight
              />
            ) : (
              <div className="rounded-sm border border-border bg-card p-8 text-center">
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {t("category.step")} 1
                </div>
                <p className="mt-3 text-lg">{t("product.selectAPosterFirst")}</p>
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

          {activePoster && category && !isDesktop && (
            <MobileCustomizerBar
              poster={activePoster}
              category={category}
              configurator={configurator}
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
      {activePoster && (
        <RelatedPosters
          poster={activePoster}
          categorySlug={category?.slug}
          categoryName={category?.name}
        />
      )}
      {activePoster && <FrameComparison />}
      {activePoster && <BeforeAfter location="product" />}
      {!perf.emergency_fast_mode && <RecentlyViewed />}
      {!perf.emergency_fast_mode && <CustomerReviews posterId={activePoster?.id} />}
      {!perf.emergency_fast_mode && <ProductInfoSections variant="all" />}
    </>
  );
}

/**
 * The product configurator for ONE poster: preview → frame type → colour →
 * size → quantity → live price → add to cart.
 *
 * `poster` is the single source of truth for what is shown and what is added
 * to the cart; `configurator` holds the frame / size / colour / quantity
 * choices. Both come from the parent (category page) or, on a product page,
 * from this component's own state. There is no list of "selected posters" and
 * no separate preview index, so the preview can never disagree with the
 * selection.
 */
export function Customizer({
  poster,
  category,
  configurator,
  onClose,
  onAdded,
  fitHeight,
}: {
  poster: Poster;
  category: Category;
  configurator?: PosterConfigurator;
  /** Clears the selection (shows a close button when provided). */
  onClose?: () => void;
  /** Called after the poster was added to the cart. */
  onAdded?: () => void;
  /**
   * The parent gives this panel a fixed height (side panel, bottom sheet).
   * Layout is then header → preview (takes the space left) → options (scrolls)
   * → price bar, so the whole frame is always visible and the price bar never
   * covers it. Without it the panel grows with its content (product page).
   */
  fitHeight?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const own = usePosterConfig();
  const { config, setFrameType, setSize, setColor, setQuantity } = configurator ?? own;
  const { frameType, size, color, quantity } = config;

  const { add } = useCart();
  const pricing = usePricing();
  const mockups = useFrameMockups();
  const enabledVariants = useEnabledFrameVariants();
  const isCustom = /custom/i.test(category.slug) || /custom/i.test(category.name);
  const customFee = isCustom ? pricing.customDesignFee : 0;
  const priceOf = (sid: SizeId) => priceForFrame(pricing, frameType, sid) + customFee;
  const unit = priceOf(size);
  const total = unit * quantity;
  const sizeOptions = sizesForFrame(frameType);

  const handleAdd = () => {
    // Everything below comes from the poster and options on screen right now.
    for (let n = 0; n < quantity; n++) {
      add({
        posterId: poster.id,
        title: poster.title,
        image: poster.image_url ?? "",
        categoryId: category.id,
        categoryName: category.name,
        frameType,
        size,
        color,
        price: unit,
        editSettings: normalizeEditSettings(poster.edit_settings) ?? DEFAULT_EDIT_SETTINGS,
      });
    }
    toast.success(t("product.addedToCart"), {
      action: { label: t("product.viewCart"), onClick: () => navigate({ to: "/cart" }) },
    });
    setQuantity(1);
    onAdded?.();
  };

  const waMsg =
    `Hi BRWAZWNEON, I'd like to order:\n` +
    `1. ${poster.title} — ${FRAME_TYPES.find((f) => f.id === frameType)?.label}, ${SIZES.find((x) => x.id === size)?.label}, ${FRAME_COLORS.find((c) => c.id === color)?.label}` +
    `\nQuantity: ${quantity}` +
    `\nTotal: ${total} EGP`;

  const hasBadges =
    (poster.sales_count ?? 0) > 0 || (poster.views_count ?? 0) > 0 || !!poster.is_best_seller;
  const badges = hasBadges ? (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground",
        fitHeight ? "mt-1 shrink-0" : "mt-3",
      )}
    >
      {(poster.sales_count ?? 0) > 0 && <span>✔ {formatCount(poster.sales_count)} sold</span>}
      {(poster.views_count ?? 0) > 0 && <span>👁 {formatCount(poster.views_count)} views</span>}
      {poster.is_best_seller ? (
        <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
          ⭐ {t("category.bestSeller")}
        </span>
      ) : null}
    </div>
  ) : null;

  const shippingInfo = (className: string) => (
    <div
      className={cn(
        "flex-col gap-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Truck className="h-3.5 w-3.5 shrink-0" />
        <span>{t("product.shippingInfo")}</span>
      </div>
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>{t("product.productionTime")}</span>
      </div>
    </div>
  );

  // Remounted per poster: a new poster starts from its own loading skeleton,
  // so the previous image can never stay on screen.
  const gallery = (
    <PosterGallery
      key={poster.id}
      fit={fitHeight}
      posterId={poster.id}
      posterUrl={poster.image_url ?? ""}
      avifSrcSet={poster.avif_srcset ?? undefined}
      webpSrcSet={poster.webp_srcset ?? undefined}
      title={poster.title}
      frameType={frameType}
      color={color}
      editSettings={poster.edit_settings}
    />
  );

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-sm border border-border bg-card",
        // The panel is a size container so the layout below can react to its
        // own width and height (stacked, or preview beside options).
        fitHeight && "relative min-h-0 overflow-hidden [container-type:size]",
      )}
    >
      {fitHeight ? (
        <>
          {/* The poster's name is not repeated above the preview: the space goes
              to the frame. Screen readers still get it, and the close button
              floats in the corner (the phone sheet has its own in that spot). */}
          <span className="sr-only">{poster.title}</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("product.clearSelection")}
              className="absolute right-1 top-1 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-background/85 text-muted-foreground backdrop-blur hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </>
      ) : (
        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-3 border-b border-border py-3 pl-5",
            onClose ? "pr-5" : "pr-14",
          )}
        >
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {t("product.posterLabel")}
            </div>
            <div className="truncate text-base font-semibold" title={poster.title}>
              {poster.title}
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("product.clearSelection")}
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <div
        className={cn(
          fitHeight
            ? "flex min-h-0 flex-1 flex-col [@container(min-width:480px)_and_(max-height:720px)]:flex-row"
            : "flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]",
        )}
      >
        {/* Preview: always gets at least 66% (74% on wide panels) of the space
            above the price bar (the options scroll instead of squeezing it) and
            grows when the options are short. On wide-but-short panels it moves
            to its own column beside the options. The frame inside is sized from
            this box, never the other way round, so it fits whole for any poster. */}
        {fitHeight ? (
          <div className="flex min-h-[66%] flex-[1_1_0] [@container(min-width:520px)]:min-h-[74%] flex-col px-4 pb-1 pt-2 [@container(min-width:480px)_and_(max-height:720px)]:min-h-0 [@container(min-width:480px)_and_(max-height:720px)]:px-2 [@container(min-width:480px)_and_(max-height:720px)]:flex-[0_0_52%]">
            {gallery}
            {badges}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[min(240px,30vh)] sm:max-w-[min(340px,36vh)]">
            {gallery}
          </div>
        )}
        <div
          className={cn(
            fitHeight &&
              "min-h-0 shrink overflow-y-auto border-t border-border/60 px-5 pb-4 [scrollbar-width:thin] [&>:first-child]:mt-3 [@container(min-width:480px)_and_(max-height:720px)]:flex-1 [@container(min-width:480px)_and_(max-height:720px)]:border-l [@container(min-width:480px)_and_(max-height:720px)]:border-t-0",
          )}
        >
          {!fitHeight && badges}

          <OptionGroup label={t("product.frameType")}>
            <div className="grid w-full grid-cols-2 gap-2 [@container(min-width:480px)_and_(max-width:699px)_and_(max-height:720px)]:grid-cols-1">
              {FRAME_TYPES.map((f) => (
                <FrameTypeCard
                  key={f.id}
                  active={frameType === f.id}
                  label={t(`product.frame_${f.id}` as const)}
                  thumb={mockups[f.id === "wood" ? "wood" : "black"]?.image}
                  onClick={() => setFrameType(f.id)}
                />
              ))}
            </div>
          </OptionGroup>

          {frameType !== "wood" && enabledVariants.some((v) => v !== "wood") && (
            <OptionGroup label={t("product.frameColor")}>
              <div className="flex flex-wrap gap-2">
                {FRAME_COLORS.filter((c) => c.id !== "wood" && enabledVariants.includes(c.id)).map(
                  (c) => (
                    <ColorSwatch
                      key={c.id}
                      id={c.id}
                      swatch={c.swatch}
                      label={t(`product.color_${c.id}` as const)}
                      active={color === c.id}
                      onClick={() => setColor(c.id)}
                    />
                  ),
                )}
              </div>
            </OptionGroup>
          )}

          <OptionGroup label={t("product.size")}>
            <div className="grid w-full grid-cols-3 gap-2">
              {sizeOptions.map((sid) => (
                <SizeCard
                  key={sid}
                  label={sid.replace("x", "×")}
                  ariaLabel={`${t(`product.size_${sid}` as const)} — ${priceOf(sid)} EGP`}
                  price={priceOf(sid)}
                  popular={sid === MOST_POPULAR_SIZE}
                  popularLabel={t("product.mostPopular")}
                  active={size === sid}
                  onClick={() => setSize(sid)}
                />
              ))}
            </div>
          </OptionGroup>
          <SizeGuide availableIds={sizeOptions} />

          <OptionGroup label={t("product.quantity")}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity(quantity - 1)}
                disabled={quantity <= 1}
                className="flex h-11 w-11 items-center justify-center rounded-sm border border-border hover:bg-accent disabled:opacity-40"
                aria-label={t("product.decreaseQty")}
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="min-w-[3rem] text-center text-lg font-semibold tabular-nums">
                {quantity}
              </div>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                disabled={quantity >= 99}
                className="flex h-11 w-11 items-center justify-center rounded-sm border border-border hover:bg-accent disabled:opacity-40"
                aria-label={t("product.increaseQty")}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </OptionGroup>
          {fitHeight && shippingInfo("mt-5 flex")}
        </div>
      </div>

      <div
        data-preview-footer=""
        className={cn(
          "border-t border-border bg-card px-5",
          fitHeight ? "shrink-0 py-3" : "sticky bottom-0 py-4",
        )}
      >
        {/* Wide panels put the price and the buttons on one row so
            the bar takes as little height as possible. */}
        <div
          className={cn(
            fitHeight &&
              "[@container(min-width:520px)]:flex [@container(min-width:520px)]:items-end [@container(min-width:520px)]:gap-4",
          )}
        >
          <div
            className={cn(
              "flex items-end justify-between",
              fitHeight
                ? "mb-2 [@container(min-width:520px)]:mb-0 [@container(min-width:520px)]:shrink-0 [@container(min-width:520px)]:gap-3"
                : "mb-3",
            )}
          >
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                {t("product.total")}
              </div>
              <div className="text-display text-3xl leading-none tabular-nums">
                {total} <span className="text-base text-muted-foreground">EGP</span>
              </div>
            </div>
            {quantity > 1 && (
              <div
                className={cn(
                  "text-xs text-muted-foreground",
                  // One-row bar: the unit price is already on the size cards, and
                  // this line would squeeze the buttons and change the bar's height.
                  fitHeight && "[@container(min-width:520px)]:hidden",
                )}
              >
                {t("product.eachPrice", { price: unit })} × {quantity}
              </div>
            )}
          </div>
          <div
            className={cn(
              "grid grid-cols-2 gap-2",
              fitHeight &&
                "[@container(min-width:520px)]:min-w-0 [@container(min-width:520px)]:flex-1",
            )}
          >
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
            >
              <Check className="h-4 w-4" /> {t("product.addToCart")}
            </button>
            <a
              href={whatsappLink(waMsg)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center rounded-sm border border-border px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest hover:bg-accent"
            >
              {t("nav.whatsappOrder")}
            </a>
          </div>
        </div>
        {!fitHeight && shippingInfo("mt-3 flex")}
      </div>
    </div>
  );
}

/** Phone bar: the active poster, its live price and one button that opens the configurator. */
function MobileCustomizerBar({
  poster,
  category,
  configurator,
}: {
  poster: Poster;
  category: Category;
  configurator: PosterConfigurator;
}) {
  const [open, setOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const pricing = usePricing();
  const isCustom = /custom/i.test(category.slug) || /custom/i.test(category.name);
  const isRtl = i18n.language?.startsWith("ar");
  const { frameType, size, quantity } = configurator.config;
  const total =
    (priceForFrame(pricing, frameType, size) + (isCustom ? pricing.customDesignFee : 0)) * quantity;

  const customizeAction: BarAction = {
    kind: "customize",
    label: isRtl ? "تخصيص التصميم" : "CUSTOMIZE",
    onClick: () => setOpen(true),
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <StickyProductBar
        content={{ price: `${total} EGP`, size: poster.title }}
        primary={customizeAction}
      />
      {/* The sheet's own close button gets a thumb-sized hit area. */}
      <SheetContent
        side="bottom"
        className="h-[92vh] overflow-hidden p-0 supports-[height:1dvh]:h-[92dvh] [&>button:first-child]:right-1 [&>button:first-child]:top-2 [&>button:first-child]:flex [&>button:first-child]:h-11 [&>button:first-child]:w-11 [&>button:first-child]:items-center [&>button:first-child]:justify-center"
        style={{ zIndex: 80 }}
      >
        <div className="h-full">
          <Customizer
            poster={poster}
            category={category}
            configurator={configurator}
            onAdded={() => setOpen(false)}
            fitHeight
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function FrameTypeCard({
  active,
  label,
  thumb,
  onClick,
}: {
  active: boolean;
  label: string;
  thumb?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex min-h-[64px] items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors duration-200",
        active
          ? "border-primary bg-accent text-foreground"
          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-background/60">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="h-7 w-5 border-4 border-foreground/70" />
        )}
      </span>
      <span className="text-[13px] font-medium leading-tight">{label}</span>
      {active && (
        <Check
          aria-hidden="true"
          className="absolute right-2 top-2 h-3.5 w-3.5 rounded-full bg-primary p-0.5 text-primary-foreground"
        />
      )}
    </button>
  );
}

function ColorSwatch({
  id,
  swatch,
  label,
  active,
  onClick,
}: {
  id: FrameColorId;
  swatch: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "flex min-h-[44px] items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-sm transition-colors duration-200",
        active ? "border-primary bg-accent" : "border-border hover:border-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className="relative flex h-7 w-7 items-center justify-center rounded-full border border-border"
        style={{
          background: id === "wood" ? "linear-gradient(135deg, #8a5a33, #5a3a20)" : swatch,
        }}
      >
        {active && (
          <Check
            className={cn("h-3.5 w-3.5", id === "white" ? "text-neutral-900" : "text-white")}
          />
        )}
      </span>
      {label}
    </button>
  );
}

function SizeCard({
  label,
  ariaLabel,
  price,
  popular,
  popularLabel,
  active,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  price: number;
  popular: boolean;
  popularLabel: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        "relative flex min-h-[64px] flex-col items-center justify-center rounded-sm border px-2 py-2 text-center transition-colors duration-200",
        active
          ? "border-primary bg-accent text-foreground"
          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
      )}
    >
      <span className="text-sm font-semibold tabular-nums">
        {label} <span className="text-[10px] font-normal">cm</span>
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{price} EGP</span>
      {popular && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-primary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-primary-foreground">
          {popularLabel}
        </span>
      )}
    </button>
  );
}
