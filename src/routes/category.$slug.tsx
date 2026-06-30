import { createFileRoute, Link, Navigate, notFound } from "@tanstack/react-router";
import { SafeImage } from "@/components/SafeImage";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCategories, descendantIds, type Category } from "@/lib/use-categories";
import {
  FRAME_COLORS,
  FRAME_TYPES,
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
import { trackEvent } from "@/lib/meta-pixel";
import { FrameComparison } from "@/components/FrameComparison";
import { BeforeAfter } from "@/components/BeforeAfter";
import { POSTER_BADGES } from "@/lib/poster-badges";
import { useRecentlyViewed } from "@/lib/recently-viewed";
import { trackPosterView } from "@/lib/poster-tracking";
import { DEFAULT_EDIT_SETTINGS, normalizeEditSettings } from "@/lib/poster-edit";
import { usePricing, priceForFrame } from "@/lib/use-settings";

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
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.replace(/-/g, " ")} posters — BRWAZWNEON` },
      { name: "description", content: "Premium framed posters." },
    ],
  }),
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
  const [badgeFilter, setBadgeFilter] = useState<string>("");
  const { record } = useRecentlyViewed();

  const includedCategoryIds = useMemo(
    () => (category ? descendantIds(categories, category.id) : []),
    [categories, category],
  );
  const subcategories = useMemo(
    () => (category ? categories.filter((c) => c.parent_id === category.id) : []),
    [categories, category],
  );

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
    () => (badgeFilter ? posters.filter((p) => p.badge === badgeFilter) : posters),
    [posters, badgeFilter],
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
        <div className="mt-6 flex flex-wrap gap-2">
          {subcategories.map((c) => (
            <Link
              key={c.id}
              to="/category/$slug"
              params={{ slug: c.slug }}
              className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
            >
              {c.name}
            </Link>
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Badge</span>
        <button
          onClick={() => setBadgeFilter("")}
          className={cn(
            "rounded-sm border px-3 py-1.5 text-xs uppercase tracking-widest transition",
            !badgeFilter ? "border-primary bg-accent" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          All
        </button>
        {POSTER_BADGES.map((b) => (
          <button
            key={b.id}
            onClick={() => setBadgeFilter(b.id)}
            className={cn(
              "rounded-sm border px-3 py-1.5 text-xs uppercase tracking-widest transition",
              badgeFilter === b.id ? "border-primary bg-accent" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
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
                        "group relative aspect-[3/4] overflow-hidden rounded-sm border-2 bg-card transition",
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
                        aspectClassName="aspect-[3/4]"
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
                      <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-2 py-1 text-left text-[10px] uppercase tracking-widest">
                        {p.title}
                      </span>
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

        <aside className="lg:sticky lg:top-24 lg:self-start">
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
      </div>

      {categories.length > 1 && (
        <div className="mt-16 border-t border-border pt-10">
          <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            More categories
          </h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories
              .filter((c) => c.slug !== slug)
              .map((c) => (
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
  const handleFrameType = (next: FrameTypeId) => {
    setFrameType(next);
    if (next === "wood") {
      setColor("wood");
      setSize("30x40");
    } else if (color === "wood") {
      setColor("black");
    }
  };
  const { add } = useCart();
  const pricing = usePricing();
  const isCustom = /custom/i.test(category.slug) || /custom/i.test(category.name);
  const unit = priceForFrame(pricing, frameType, size) + (isCustom ? pricing.customDesignFee : 0);
  const total = unit * posters.length;

  const primary = posters[0];

  const handleAdd = () => {
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
    toast.success(`Added ${posters.length} poster${posters.length > 1 ? "s" : ""} to cart`);
    onClear();
  };

  const waMsg =
    `Hi BRWAZWNEON, I'd like to order:\n` +
    posters.map((p, i) => `${i + 1}. ${p.title}`).join("\n") +
    `\nFrame: ${FRAME_TYPES.find((f) => f.id === frameType)?.label}` +
    `\nSize: ${SIZES.find((s) => s.id === size)?.label}` +
    `\nColor: ${FRAME_COLORS.find((c) => c.id === color)?.label}` +
    `\nTotal: ${total} EGP`;

  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <div className="flex items-center justify-between">
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
      <div className="mt-4 mx-auto w-full max-w-[260px]">
        <PosterGallery
          posterId={primary.id}
          posterUrl={primary.image_url}
          title={primary.title}
          frameType={frameType}
          color={color}
          editSettings={primary.edit_settings}
        />
      </div>
      {(primary.sales_count ?? 0) > 0 || (primary.views_count ?? 0) > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {(primary.sales_count ?? 0) > 0 && (
            <span>✔ {formatCount(primary.sales_count)} customers purchased this design</span>
          )}
          {(primary.views_count ?? 0) > 0 && (
            <span>👁 {formatCount(primary.views_count)} views</span>
          )}
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-5 gap-2">
        {posters.map((p) => (
          <div key={p.id} className="group relative aspect-[3/4] overflow-hidden rounded-sm">
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
      <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
        <div className="text-display text-3xl">
          {total} <span className="text-base text-muted-foreground">EGP</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {unit} EGP × {posters.length}
        </div>
      </div>

      <OptionGroup label="Frame Type">
        {FRAME_TYPES.map((f) => (
          <OptionButton key={f.id} active={frameType === f.id} onClick={() => handleFrameType(f.id)}>
            {f.label}
          </OptionButton>
        ))}
      </OptionGroup>

      <OptionGroup label="Size">
        {SIZES.map((s) => (
          <OptionButton key={s.id} active={size === s.id} onClick={() => setSize(s.id)}>
            {s.label}
          </OptionButton>
        ))}
      </OptionGroup>

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

      <div className="mt-6 grid grid-cols-2 gap-2">
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