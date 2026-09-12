import { createFileRoute, Link } from "@tanstack/react-router";
import { SafeImage } from "@/components/SafeImage";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { getPostersByIdsPublic, getCustomOffersPublic } from "@/lib/db-public.functions";
import { useCart } from "@/lib/cart";
import { useCategories } from "@/lib/use-categories";
import {
  FRAME_COLORS,
  FRAME_TYPES,
  type FrameColorId,
  type FrameTypeId,
  type SizeId,
} from "@/lib/poster-options";
import { whatsappLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { usePricing, useEnabledFrameVariants } from "@/lib/use-settings";
import { LiveVisitors, RecentOrdersBadge } from "@/components/SocialProof";
import { usePosterResponsiveImages } from "@/lib/public-images";
import { FramedArtwork } from "@/components/FramedArtwork";
import { resolveProductArtwork } from "@/lib/public-images";
import { useInfiniteProducts } from "@/hooks/useInfiniteProducts";
import { InfiniteProductGrid } from "@/components/InfiniteProductGrid";

export const Route = createFileRoute("/offers")({
  head: () => {
    const title = "Offers — BRWAZWNEON";
    const description =
      "Limited-time BRWAZWNEON framed poster bundles and offers with delivery across Egypt.";
    const url = "https://brwazwneon.com/offers";
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
  component: OffersPage,
});

type Bundle = {
  key: string;
  title: string;
  subtitle?: string | null;
  sizeLabel: string;
  size: SizeId;
  count: number;
  price: number;
  image?: string | null;
  badge?: string | null;
};

type CustomOffer = {
  id: string;
  title: string;
  subtitle: string | null;
  size: string;
  count: number;
  price: number;
  image_url: string | null;
  badge: string | null;
};

function useBundles(): Bundle[] {
  const pricing = usePricing();
  const defaults: Bundle[] = [
    {
      key: "bundle-6-20x30",
      title: "6 Frames Bundle",
      sizeLabel: "20 × 30 cm",
      size: "20x30",
      count: 6,
      price: pricing.offers.bundle6_20x30,
    },
    {
      key: "bundle-4-30x40",
      title: "4 Frames Bundle",
      sizeLabel: "30 × 40 cm",
      size: "30x40",
      count: 4,
      price: pricing.offers.bundle4_30x40,
    },
  ];
  const { data: custom = [] } = useQuery<CustomOffer[]>({
    queryKey: ["custom-offers"],
    staleTime: 60_000,
    queryFn: async (): Promise<CustomOffer[]> => {
      return getCustomOffersPublic() as Promise<CustomOffer[]>;
    },
  });
  const customBundles: Bundle[] = custom.map((o) => {
    const sizeLabel = String(o.size).replace("x", " × ") + " cm";
    return {
      key: `custom-${o.id}`,
      title: o.title,
      subtitle: o.subtitle,
      sizeLabel,
      size: o.size as SizeId,
      count: o.count,
      price: Number(o.price),
      image: o.image_url,
      badge: o.badge,
    };
  });
  return [...defaults, ...customBundles];
}

type Poster = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
};

type PosterSelectionMeta = Pick<Poster, "id" | "title" | "image_url">;

function OffersPage() {
  const { t } = useTranslation();
  const bundles = useBundles();
  const [bundleKey, setBundleKey] = useState<Bundle["key"] | null>(null);
  const bundle = bundles.find((b) => b.key === bundleKey) ?? null;

  return (
    <div className="container-page py-16">
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
        {t("offers.limitedTime")}
      </div>
      <h1 className="text-display mt-2 text-5xl sm:text-7xl">{t("offers.heading")}</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">{t("offers.description")}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <LiveVisitors variant="offer" />
        <RecentOrdersBadge surface="offer" />
      </div>

      <div className="mt-12 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {bundles.map((b) => {
          const active = bundleKey === b.key;
          return (
            <button
              key={b.key}
              onClick={() => setBundleKey(b.key)}
              className={cn(
                "group relative flex flex-col items-start gap-3 bg-card p-8 text-left transition",
                active ? "ring-2 ring-inset ring-primary" : "hover:bg-accent",
              )}
            >
              {b.badge && (
                <span className="absolute right-4 top-4 rounded-sm bg-primary px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-primary-foreground">
                  {b.badge}
                </span>
              )}
              {b.image && (
                <div className="mb-2 h-32 w-full overflow-hidden rounded-sm bg-muted">
                  <SafeImage src={b.image} alt={b.title} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                {t("offers.bundle")} · {b.count} frames
              </div>
              <div className="text-display text-5xl">{b.title}</div>
              <div className="text-sm text-muted-foreground">{b.sizeLabel}</div>
              {b.subtitle && <div className="text-xs text-muted-foreground">{b.subtitle}</div>}
              <div className="text-display mt-4 text-4xl">
                {b.price} <span className="text-lg text-muted-foreground">{t("egp")}</span>
              </div>
              <span
                className={cn(
                  "mt-4 inline-flex rounded-sm border px-4 py-2 text-[10px] font-semibold uppercase tracking-widest",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {active ? t("offers.selected") : t("offers.chooseBundle")}
              </span>
            </button>
          );
        })}
      </div>

      {bundle && <BundleBuilder bundle={bundle} />}
    </div>
  );
}

function BundleBuilder({ bundle }: { bundle: Bundle }) {
  const { t } = useTranslation();
  const { data: categories = [] } = useCategories();
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [frameType, setFrameType] = useState<FrameTypeId>("pvc");
  const [color, setColor] = useState<FrameColorId>("black");
  const enabledVariants = useEnabledFrameVariants();
  const availableColors = FRAME_COLORS.filter((c) => enabledVariants.includes(c.id));
  const { add } = useCart();

  const categoryIds = useMemo(
    () => (categoryId === "all" ? categories.map((c) => c.id) : [categoryId]),
    [categoryId, categories],
  );

  const {
    products,
    state: paginationState,
    error: paginationError,
    loadMore,
    retry,
  } = useInfiniteProducts(categoryIds, { sort: "newest" }, `offers-${categoryId}`);

  // Keep a separate map so we can still show selections after switching filters.
  const { data: selectionMeta = [] } = useQuery<PosterSelectionMeta[]>({
    queryKey: ["offers-selected", selectedIds],
    enabled: selectedIds.length > 0,
    queryFn: async (): Promise<PosterSelectionMeta[]> => {
      const rows = await getPostersByIdsPublic({ data: { ids: selectedIds } });
      return rows.map((r) => ({ id: r.id, title: r.title, image_url: r.image_url }));
    },
  });

  const selectedMap = useMemo(() => {
    const m = new Map<string, PosterSelectionMeta>();
    products.forEach((p) => m.set(p.id, { id: p.id, title: p.title, image_url: p.cardArtworkUrl }));
    selectionMeta.forEach((p) => m.set(p.id, p));
    return m;
  }, [products, selectionMeta]);
  const selectedImages = usePosterResponsiveImages(Array.from(selectedMap.keys()), "80px");

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= bundle.count) {
        toast.error(`This bundle is exactly ${bundle.count} posters`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const complete = selectedIds.length === bundle.count;

  const handleAdd = () => {
    if (!complete) {
      toast.error(`Select exactly ${bundle.count} posters`);
      return;
    }
    const posters = selectedIds.map((id) => selectedMap.get(id)).filter(Boolean) as {
      id: string;
      title: string;
      image_url: string;
    }[];
    const first = posters[0];
    add({
      posterId: bundle.key,
      title: `${bundle.title} · ${bundle.sizeLabel}`,
      image: first.image_url,
      categoryId: null,
      categoryName: "Bundle",
      frameType,
      size: bundle.size,
      color,
      price: bundle.price,
      bundle: {
        key: bundle.key,
        label: `${bundle.title} · ${bundle.sizeLabel}`,
        posters: posters.map((p) => ({
          posterId: p.id,
          title: p.title,
          image: p.image_url,
        })),
      },
    });
    toast.success("Bundle added to cart");
    setSelectedIds([]);
  };

  const waMsg =
    `Hi BRWAZWNEON, I'd like the ${bundle.title} (${bundle.sizeLabel}) — ${bundle.price} ${t("egp")}\n` +
    `Frame: ${FRAME_TYPES.find((f) => f.id === frameType)?.label}\n` +
    `Color: ${FRAME_COLORS.find((c) => c.id === color)?.label}\n` +
    `Posters:\n` +
    selectedIds.map((id, i) => `${i + 1}. ${selectedMap.get(id)?.title ?? id}`).join("\n");

  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={categoryId === "all"} onClick={() => setCategoryId("all")}>
            {t("offers.all")}
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </FilterChip>
          ))}
        </div>

        <InfiniteProductGrid
          products={products}
          state={paginationState}
          error={paginationError}
          selectedIds={selectedIds}
          onToggle={toggle}
          onLoadMore={loadMore}
          onRetry={retry}
        />
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-sm border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              {bundle.title}
            </div>
            <div className="text-display text-2xl">
              {bundle.price} {t("egp")}
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{bundle.sizeLabel}</div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-widest">
              <span>Selected</span>
              <span className={cn(complete ? "text-primary" : "text-muted-foreground")}>
                {selectedIds.length} / {bundle.count}
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${Math.min(100, (selectedIds.length / bundle.count) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-6 gap-1.5">
            {Array.from({ length: bundle.count }).map((_, i) => {
              const id = selectedIds[i];
              const p = id ? selectedMap.get(id) : undefined;
              const image = id ? selectedImages[id] : undefined;
              return (
                <div
                  key={i}
                  className={cn(
                    "relative aspect-[3/4] overflow-hidden rounded-sm border",
                    p ? "border-primary" : "border-dashed border-border bg-muted/40",
                  )}
                >
                  {p && (
                    <>
                      <FramedArtwork
                        posterUrl={resolveProductArtwork(p, selectedImages)}
                        avifSrcSet={image?.avifSrcSet}
                        webpSrcSet={image?.webpSrcSet}
                        sizes={image?.sizes}
                        title={p.title}
                        frameType={frameType}
                        color={color}
                        aspectClassName="h-full w-full"
                        loading="lazy"
                        posterFallbackUrl={p.image_url || ""}
                      />
                      <button
                        onClick={() => setSelectedIds((prev) => prev.filter((x) => x !== id))}
                        aria-label={`Remove ${p.title}`}
                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background/90"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <OptionGroup label={t("offers.frameType")}>
            {FRAME_TYPES.map((f) => (
              <OptionButton
                key={f.id}
                active={frameType === f.id}
                onClick={() => setFrameType(f.id)}
              >
                {f.label}
              </OptionButton>
            ))}
          </OptionGroup>

          <OptionGroup label={t("offers.frameColor")}>
            {(availableColors.length ? availableColors : FRAME_COLORS).map((c) => (
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

          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              onClick={handleAdd}
              disabled={!complete}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-sm px-4 py-3 text-xs font-semibold uppercase tracking-widest transition",
                complete
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
            >
              <Check className="h-4 w-4" /> {t("offers.addBundle")}
            </button>
            <a
              href={whatsappLink(waMsg)}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "rounded-sm border border-border px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest hover:bg-accent",
                !complete && "pointer-events-none opacity-50",
              )}
            >
              {t("whatsappLabel")}
            </a>
          </div>
          {!complete && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {t("offers.selectExactly", { count: bundle.count })}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function FilterChip({
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
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-1.5 text-xs uppercase tracking-widest transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
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
