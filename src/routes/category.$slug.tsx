import { createFileRoute, Link, Navigate, notFound } from "@tanstack/react-router";
import { SafeImage } from "@/components/SafeImage";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCategories, descendantIds, type Category } from "@/lib/use-categories";
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
import { FramePreview } from "@/components/FramePreview";
import { WishlistHeart } from "@/components/WishlistHeart";
import { PosterBadge } from "@/components/PosterBadge";
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
import { DEFAULT_EDIT_SETTINGS, normalizeEditSettings } from "@/lib/poster-edit";
import { usePricing, priceForFrame } from "@/lib/use-settings";
import { useGridDisplayMode } from "@/lib/use-settings";
import { SizeGuide } from "@/components/SizeGuide";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Minus, Plus } from "lucide-react";

type Poster = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  tags?: string[] | null;
  edit_settings?: unknown;
  badge?: string | null;
  sales_count?: number | null;
  views_count?: number | null;
};

const PAGE_SIZE = 48;

type SortKey = "newest" | "popular" | "bestselling" | "az";
type SortDef = { id: SortKey; label: string; col: string; asc: boolean };
const SORTS: SortDef[] = [
  { id: "newest", label: "Newest", col: "created_at", asc: false },
  { id: "bestselling", label: "Best Selling", col: "sales_count", asc: false },
  { id: "popular", label: "Most Viewed", col: "views_count", asc: false },
  { id: "az", label: "Alphabetically", col: "title", asc: true },
];

export const Route = createFileRoute("/category/$slug")({
  head: ({ params }) => {
    const pretty = params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const title = `${pretty} Posters — BRWAZWNEON`;
    const description = `Browse our premium framed ${pretty} posters. High-quality prints in PVC and Wooden Portrait frames, delivered across Egypt with cash on delivery.`;
    const url = `https://brwaz-poster-boutique.lovable.app/category/${params.slug}`;
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
    };
  },
  component: CategoryPage,
  notFoundComponent: () => (
    <div className="container-page py-24 text-center">
      <h1 className="text-display text-4xl">Category not found</h1>
      <Link to="/" className="mt-6 inline-block underline">Back home</Link>
    </div>
  ),
});

function CategoryPage() {
  const { slug } = Route.useParams();
  if (slug === "custom") {
    return <Navigate to="/custom-design" replace />;
  }
  const { data: categories = [] } = useCategories();

  const { data: category, isLoading: catLoading } = useQuery({
    queryKey: ["category", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,slug,image,sort_order,parent_id,description")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data as Category | null;
    },
  });

  if (!catLoading && !category) throw notFound();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("newest");
  const [activeSubId, setActiveSubId] = useState<string>("");
  const { record } = useRecentlyViewed();
  const gridMode = useGridDisplayMode();

  // Retargeting: fire ViewCategory once per category mount.
  useEffect(() => {
    if (!category) return;
    enqueueEvent("ViewCategory", {
      category_id: category.id,
      category_slug: category.slug,
      category_name: category.name,
    });
  }, [category?.id]);

  const includedCategoryIds = useMemo(
    () => {
      if (!category) return [];
      if (activeSubId) return descendantIds(categories, activeSubId);
      return descendantIds(categories, category.id);
    },
    [categories, category, activeSubId],
  );
  const subcategories = useMemo(
    () => (category ? categories.filter((c) => c.parent_id === category.id && !c.hidden) : []),
    [categories, category],
  );

  // Reset sub filter when navigating to a different top category
  useEffect(() => {
    setActiveSubId("");
  }, [category?.id]);

  const postersQ = useInfiniteQuery({
    queryKey: ["posters", category?.id ?? slug, sort, includedCategoryIds.join(",")],
    enabled: !!category?.id,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const sortDef = SORTS.find((s) => s.id === sort)!;
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,category_id,tags,edit_settings,badge,sales_count,views_count")
        .in("category_id", includedCategoryIds)
        .eq("hidden", false)
        .order(sortDef.col, { ascending: sortDef.asc })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as Poster[];
    },
    getNextPageParam: (last, pages) =>
      last.length === PAGE_SIZE ? pages.length : undefined,
  });

  const posters: Poster[] = postersQ.data?.pages.flat() ?? [];
  const filteredPosters = useMemo(
    () => posters,
    [posters],
  );
  const selectedPosters = useMemo(
    () => selectedIds
      .map((id) => posters.find((p) => p.id === id))
      .filter(Boolean) as Poster[],
    [selectedIds, posters],
  );

  const toggle = (p: Poster) => {
    if (category) {
      record({
        id: p.id,
        title: p.title,
        image_url: p.image_url,
        category_id: p.category_id,
        category_slug: category.slug,
        category_name: category.name,
      });
      trackPosterView(p.id);
      try {
        trackEvent("ViewContent", {
          content_ids: [p.id],
          content_name: p.title,
          content_type: "product",
          content_category: category.name,
          currency: "EGP",
        });
      } catch { /* noop */ }
    }
    setSelectedIds((prev) =>
      prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
    );
  };

  return (
    <>
    <div className="container-page py-12">
      <div className="mb-2 text-xs uppercase tracking-[0.4em] text-muted-foreground">
        Collection
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-display text-4xl sm:text-6xl">
          {category?.name ?? "…"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Tap any poster to select. Select multiple to add a matching set.
        </p>
      </div>

      {subcategories.length > 0 && (
        <div
          className="mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0 sm:overflow-visible sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
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
            All
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
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Sort by</span>
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
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.85fr_minmax(440px,540px)]">
        <div>
          {postersQ.isLoading || catLoading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">
              Loading posters…
            </div>
          ) : filteredPosters.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No posters in this category yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filteredPosters.map((p) => {
                  const active = selectedIds.includes(p.id);
                  const idx = selectedIds.indexOf(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p)}
                      className={cn(
                        "group relative aspect-[2/3] overflow-hidden rounded-sm border-2 bg-card transition",
                        active
                          ? "border-primary ring-4 ring-primary/30"
                          : "border-transparent hover:border-border",
                      )}
                    >
                        <WishlistHeart posterId={p.id} />
                        <PosterBadge badge={p.badge} />
                      <FramePreview
                        posterUrl={p.image_url}
                        title={p.title}
                        editSettings={p.edit_settings}
                        aspectClassName="aspect-[2/3]"
                        frameType={gridMode === "wood" ? "wood" : "pvc"}
                        color={gridMode === "wood" ? "wood" : gridMode === "white" ? "white" : "black"}
                        bare
                        loading="lazy"
                        className={cn(
                          "h-full w-full transition",
                          active && "scale-[1.02]",
                        )}
                      />
                      {active && (
                        <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {idx + 1}
                        </span>
                      )}
                      {(p.sales_count ?? 0) > 0 && (
                        <span className="pointer-events-none absolute bottom-7 right-2 rounded-sm bg-background/85 px-1.5 py-0.5 text-[9px] uppercase tracking-widest opacity-0 transition group-hover:opacity-100">
                          ✔ {formatCount(p.sales_count)} sold
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {postersQ.hasNextPage && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => postersQ.fetchNextPage()}
                    disabled={postersQ.isFetchingNextPage}
                    className="rounded-sm border border-border px-6 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-accent disabled:opacity-50"
                  >
                    {postersQ.isFetchingNextPage ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-[90px] lg:self-start lg:h-[calc(100vh-110px)]">
          {selectedPosters.length > 0 && category ? (
            <Customizer
              posters={selectedPosters}
              category={category}
              onRemove={(id) =>
                setSelectedIds((prev) => prev.filter((x) => x !== id))
              }
              onClear={() => setSelectedIds([])}
            />
          ) : (
            <div className="rounded-sm border border-border bg-card p-8 text-center">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Step 1
              </div>
              <p className="mt-3 text-lg">Select one or more posters.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Tap images to add them, then pick your frame, size and color.
              </p>
              <Link
                to="/offers"
                className="mt-6 inline-flex rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
              >
                Or grab a bundle offer →
              </Link>
            </div>
          )}
        </aside>

        {selectedPosters.length > 0 && category && (
          <MobileCustomizerBar
            posters={selectedPosters}
            category={category}
            onRemove={(id) =>
              setSelectedIds((prev) => prev.filter((x) => x !== id))
            }
            onClear={() => setSelectedIds([])}
          />
        )}
      </div>

      {subcategories.length > 0 && (
        <div className="mt-16 border-t border-border pt-10">
          <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            More in {category?.name ?? "this collection"}
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
    <RecentlyViewed />
    <CustomerReviews posterId={selectedPosters[0]?.id} />
    <ProductInfoSections variant="all" />
    </>
  );
}

function Customizer({
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
  const [frameType, setFrameType] = useState<FrameTypeId>("pvc");
  const [size, setSize] = useState<SizeId>("30x40");
  const [color, setColor] = useState<FrameColorId>("black");
  const [quantity, setQuantity] = useState(1);
  const handleFrameType = (next: FrameTypeId) => {
    setFrameType(next);
    if (next === "wood") {
      setColor("wood");
    } else if (color === "wood") {
      setColor("black");
      if (!(["20x30", "30x40", "40x50"] as SizeId[]).includes(size)) {
        setSize("30x40");
      }
    }
  };
  const { add } = useCart();
  const pricing = usePricing();
  const isCustom = /custom/i.test(category.slug) || /custom/i.test(category.name);
  const unit = priceForFrame(pricing, frameType, size) + (isCustom ? pricing.customDesignFee : 0);
  const total = unit * posters.length * quantity;

  const primary = posters[0];

  const handleAdd = () => {
    for (let n = 0; n < quantity; n++) {
      posters.forEach((poster) => {
        add({
          posterId: poster.id,
          title: poster.title,
          image: poster.image_url,
          categoryId: category.id,
          categoryName: category.name,
          frameType,
          size,
          color,
          price: unit,
          editSettings: normalizeEditSettings(poster.edit_settings) ?? DEFAULT_EDIT_SETTINGS,
        });
      });
    }
    const totalItems = posters.length * quantity;
    toast.success(`Added ${totalItems} poster${totalItems > 1 ? "s" : ""} to cart`);
    onClear();
  };

  const waMsg =
    `Hi BRWAZWNEON, I'd like to order:\n` +
    posters.map((p, i) => `${i + 1}. ${p.title}`).join("\n") +
    `\nFrame: ${FRAME_TYPES.find((f) => f.id === frameType)?.label}` +
    `\nSize: ${SIZES.find((s) => s.id === size)?.label}` +
    `\nColor: ${FRAME_COLORS.find((c) => c.id === color)?.label}` +
    `\nQuantity: ${quantity}` +
    `\nTotal: ${total} EGP`;

  return (
    <div className="flex h-full flex-col rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {posters.length} selected
        </div>
        <button
          onClick={onClear}
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Clear all
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
        <div className="mx-auto flex w-full justify-center">
          <div className="w-full max-w-[min(260px,28vh)]">
            <PosterGallery
              posterId={primary.id}
              posterUrl={primary.image_url}
              title={primary.title}
              frameType={frameType}
              color={color}
              editSettings={primary.edit_settings}
            />
          </div>
        </div>
      {(primary.sales_count ?? 0) > 0 || (primary.views_count ?? 0) > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {(primary.sales_count ?? 0) > 0 && (
            <span>✔ {formatCount(primary.sales_count)} sold</span>
          )}
          {(primary.views_count ?? 0) > 0 && (
            <span>👁 {formatCount(primary.views_count)} views</span>
          )}
        </div>
      ) : null}
      {posters.length > 1 && (
      <div className="mt-3 grid grid-cols-5 gap-2">
        {posters.map((p) => (
          <div key={p.id} className="group relative aspect-[2/3] overflow-hidden rounded-sm">
            <FramePreview
              posterUrl={p.image_url}
              title={p.title}
              frameType={frameType}
              color={color}
              editSettings={p.edit_settings}
              bare
              className="h-full w-full"
            />
            <button
              onClick={() => onRemove(p.id)}
              aria-label={`Remove ${p.title}`}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 opacity-0 transition group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      )}

      <OptionGroup label="Frame Type">
        {FRAME_TYPES.map((f) => (
          <OptionButton key={f.id} active={frameType === f.id} onClick={() => handleFrameType(f.id)}>
            {f.label}
          </OptionButton>
        ))}
      </OptionGroup>

      <OptionGroup label="Size">
        {sizesForFrame(frameType).map((sid) => {
          const s = SIZES.find((x) => x.id === sid)!;
          return (
          <OptionButton key={s.id} active={size === s.id} onClick={() => setSize(s.id)}>
            {s.label}
          </OptionButton>
          );
        })}
      </OptionGroup>
      <SizeGuide availableIds={sizesForFrame(frameType)} />

      {frameType !== "wood" && (
      <OptionGroup label="Frame Color">
        {FRAME_COLORS.filter((c) => c.id !== "wood").map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setColor(c.id)}
            className={cn(
              "flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition",
              color === c.id
                ? "border-primary bg-accent"
                : "border-border hover:border-muted-foreground",
            )}
          >
            <span
              className="h-5 w-5 rounded-full border border-border"
              style={{ backgroundColor: c.swatch }}
            />
            {c.label}
          </button>
        ))}
      </OptionGroup>
      )}

      <OptionGroup label="Quantity">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-border hover:bg-accent"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="min-w-[3rem] text-center text-lg font-semibold">{quantity}</div>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(99, q + 1))}
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-border hover:bg-accent"
            aria-label="Increase quantity"
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
            {unit} × {posters.length}
            {quantity > 1 ? ` × ${quantity}` : ""}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleAdd}
          className="rounded-sm bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 inline-flex items-center justify-center gap-2"
        >
          <Check className="h-4 w-4" /> Add {posters.length} to cart
        </button>
        <a
          href={whatsappLink(waMsg)}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm border border-border px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest hover:bg-accent"
        >
          WhatsApp order
        </a>
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
  const pricing = usePricing();
  const isCustom = /custom/i.test(category.slug) || /custom/i.test(category.name);
  // Quick estimate at default 30x40 PVC for the bar
  const estUnit = priceForFrame(pricing, "pvc", "30x40") + (isCustom ? pricing.customDesignFee : 0);
  const estTotal = estUnit * posters.length;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {posters.length} selected
            </div>
            <div className="truncate text-sm font-semibold">
              from {estTotal} EGP
            </div>
          </div>
          <SheetTrigger asChild>
            <button
              type="button"
              className="rounded-sm bg-primary px-5 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
            >
              Customize
            </button>
          </SheetTrigger>
        </div>
      </div>
      <SheetContent
        side="bottom"
        className="h-[92vh] overflow-hidden p-0"
      >
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