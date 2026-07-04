import { createFileRoute, Link } from "@tanstack/react-router";
import { SafeImage } from "@/components/SafeImage";
import { FramePreview } from "@/components/FramePreview";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useCategories } from "@/lib/use-categories";
import { FRAME_COLORS, FRAME_TYPES, type FrameColorId, type FrameTypeId, type SizeId } from "@/lib/poster-options";
import { whatsappLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { usePricing } from "@/lib/use-settings";

export const Route = createFileRoute("/offers")({
  head: () => {
    const title = "Special Offers — BRWAZWNEON";
    const description = "Bundle deals on framed posters: 6 frames 20×30 for 790 EGP or 4 frames 30×40 for 890 EGP. Cash on delivery across Egypt.";
    const url = "https://brwaz-poster-boutique.lovable.app/offers";
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
  key: "bundle-6-20x30" | "bundle-4-30x40";
  title: string;
  sizeLabel: string;
  size: SizeId;
  count: number;
  price: number;
};

function useBundles(): Bundle[] {
  const pricing = usePricing();
  return [
    { key: "bundle-6-20x30", title: "6 Frames Bundle", sizeLabel: "20 × 30 cm", size: "20x30", count: 6, price: pricing.offers.bundle6_20x30 },
    { key: "bundle-4-30x40", title: "4 Frames Bundle", sizeLabel: "30 × 40 cm", size: "30x40", count: 4, price: pricing.offers.bundle4_30x40 },
  ];
}

type Poster = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
};

const PAGE_SIZE = 48;

function OffersPage() {
  const bundles = useBundles();
  const [bundleKey, setBundleKey] = useState<Bundle["key"] | null>(null);
  const bundle = bundles.find((b) => b.key === bundleKey) ?? null;

  return (
    <div className="container-page py-16">
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
        Limited time
      </div>
      <h1 className="text-display mt-2 text-5xl sm:text-7xl">Special offers</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Pick a bundle, then choose your exact set of posters. Mix any
        categories — pay one flat price.
      </p>

      <div className="mt-12 grid gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-2">
        {bundles.map((b) => {
          const active = bundleKey === b.key;
          return (
            <button
              key={b.key}
              onClick={() => setBundleKey(b.key)}
              className={cn(
                "group flex flex-col items-start gap-3 bg-card p-8 text-left transition",
                active ? "ring-2 ring-inset ring-primary" : "hover:bg-accent",
              )}
            >
              <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                Bundle · {b.count} frames
              </div>
              <div className="text-display text-5xl">{b.title}</div>
              <div className="text-sm text-muted-foreground">{b.sizeLabel}</div>
              <div className="text-display mt-4 text-4xl">
                {b.price} <span className="text-lg text-muted-foreground">EGP</span>
              </div>
              <span
                className={cn(
                  "mt-4 inline-flex rounded-sm border px-4 py-2 text-[10px] font-semibold uppercase tracking-widest",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border",
                )}
              >
                {active ? "Selected · pick your posters below" : "Choose this bundle"}
              </span>
            </button>
          );
        })}
      </div>

      {bundle && <BundleBuilder bundle={bundle} />}
    </div>
  );
}

function BundleBuilder({
  bundle,
}: {
  bundle: Bundle;
}) {
  const { data: categories = [] } = useCategories();
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [frameType, setFrameType] = useState<FrameTypeId>("pvc");
  const [color, setColor] = useState<FrameColorId>("black");
  const { add } = useCart();

  const postersQ = useInfiniteQuery({
    queryKey: ["offers-posters", categoryId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("posters")
        .select("id,title,image_url,category_id")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (categoryId !== "all") q = q.eq("category_id", categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Poster[];
    },
    getNextPageParam: (last, pages) =>
      last.length === PAGE_SIZE ? pages.length : undefined,
  });

  const posters: Poster[] = postersQ.data?.pages.flat() ?? [];

  // Keep a separate map so we can still show selections after switching filters.
  const { data: selectionMeta = [] } = useQuery({
    queryKey: ["offers-selected", selectedIds],
    enabled: selectedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url")
        .in("id", selectedIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedMap = useMemo(() => {
    const m = new Map<string, { id: string; title: string; image_url: string }>();
    posters.forEach((p) => m.set(p.id, p));
    selectionMeta.forEach((p: any) => m.set(p.id, p));
    return m;
  }, [posters, selectionMeta]);

  const toggle = (p: Poster) => {
    setSelectedIds((prev) => {
      if (prev.includes(p.id)) return prev.filter((x) => x !== p.id);
      if (prev.length >= bundle.count) {
        toast.error(`This bundle is exactly ${bundle.count} posters`);
        return prev;
      }
      return [...prev, p.id];
    });
  };

  const complete = selectedIds.length === bundle.count;

  const handleAdd = () => {
    if (!complete) {
      toast.error(`Select exactly ${bundle.count} posters`);
      return;
    }
    const posters = selectedIds
      .map((id) => selectedMap.get(id))
      .filter(Boolean) as { id: string; title: string; image_url: string }[];
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
    `Hi BRWAZWNEON, I'd like the ${bundle.title} (${bundle.sizeLabel}) — ${bundle.price} EGP\n` +
    `Frame: ${FRAME_TYPES.find((f) => f.id === frameType)?.label}\n` +
    `Color: ${FRAME_COLORS.find((c) => c.id === color)?.label}\n` +
    `Posters:\n` +
    selectedIds
      .map((id, i) => `${i + 1}. ${selectedMap.get(id)?.title ?? id}`)
      .join("\n");

  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={categoryId === "all"} onClick={() => setCategoryId("all")}>
            All
          </FilterChip>
          {categories.map((c) => (
            <FilterChip
              key={c.id}
              active={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </FilterChip>
          ))}
        </div>

        {postersQ.isLoading ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            Loading posters…
          </div>
        ) : posters.length === 0 ? (
          <div className="mt-6 rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No posters available.
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {posters.map((p) => {
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
                    <FramePreview
                      posterUrl={p.image_url}
                      title={p.title}
                      frameType={frameType}
                      color={color}
                      aspectClassName="h-full w-full"
                      className="transition-transform duration-300 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                    {active && (
                      <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {idx + 1}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-2 py-1 text-left text-[10px] uppercase tracking-widest">
                      {p.title}
                    </span>
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
        <div className="rounded-sm border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              {bundle.title}
            </div>
            <div className="text-display text-2xl">{bundle.price} EGP</div>
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
                      <FramePreview
                        posterUrl={p.image_url}
                        title={p.title}
                        frameType={frameType}
                        color={color}
                        aspectClassName="h-full w-full"
                        bare
                        loading="lazy"
                      />
                      <button
                        onClick={() =>
                          setSelectedIds((prev) => prev.filter((x) => x !== id))
                        }
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

          <OptionGroup label="Frame Type">
            {FRAME_TYPES.map((f) => (
              <OptionButton key={f.id} active={frameType === f.id} onClick={() => setFrameType(f.id)}>
                {f.label}
              </OptionButton>
            ))}
          </OptionGroup>

          <OptionGroup label="Frame Color">
            {FRAME_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.id)}
                className={cn(
                  "flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition",
                  color === c.id ? "border-primary bg-accent" : "border-border hover:border-muted-foreground",
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
              <Check className="h-4 w-4" /> Add bundle
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
              WhatsApp
            </a>
          </div>
          {!complete && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Select exactly {bundle.count} posters to continue.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function OptionButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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