import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SafeImage } from "@/components/SafeImage";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { whatsappLink } from "@/lib/whatsapp";
import { useState } from "react";
import { ProductInfoSections } from "@/components/ProductInfoSections";
import { getSetsPublic } from "@/lib/db-public.functions";

export const Route = createFileRoute("/sets")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: SETS_QUERY_KEY,
      queryFn: fetchSets,
    });
  },
  head: () => ({
    meta: [
      { title: "Frame Sets — BRWAZWNEON" },
      {
        name: "description",
        content: "Shop curated BRWAZWNEON frame sets and wall bundles delivered across Egypt.",
      },
      { property: "og:title", content: "Frame Sets — BRWAZWNEON" },
      {
        property: "og:description",
        content: "Shop curated BRWAZWNEON frame sets and wall bundles delivered across Egypt.",
      },
      { property: "og:url", content: "https://brwazwneon.com/sets" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://brwazwneon.com/sets" }],
  }),
  component: SetsPage,
});

type FrameSet = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  frames_count: number;
  price: number;
  old_price: number | null;
  enabled: boolean;
  featured: boolean;
  sort_order: number;
};

const SETS_QUERY_KEY = ["sets", "public"];

async function fetchSets(): Promise<FrameSet[]> {
  return getSetsPublic() as Promise<FrameSet[]>;
}

function SetsPage() {
  const { t } = useTranslation();
  const { data: sets = [], isLoading } = useQuery({
    queryKey: SETS_QUERY_KEY,
    queryFn: fetchSets,
  });

  return (
    <div className="bg-background text-foreground">
      <section className="border-b border-border">
        <div className="container-page py-16">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            {t("sets.curatedBundles")}
          </p>
          <h1 className="text-display mt-3 text-5xl sm:text-7xl">{t("sets.heading")}</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">{t("sets.description")}</p>
        </div>
      </section>

      <section className="container-page py-14">
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-sm bg-muted/40" />
            ))}
          </div>
        ) : sets.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-14 text-center text-sm text-muted-foreground">
            {t("sets.droppingSoon")}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sets.map((s) => (
              <SetCard key={s.id} set={s} />
            ))}
          </div>
        )}
      </section>
      <ProductInfoSections variant="all" />
    </div>
  );
}

function SetCard({ set }: { set: FrameSet }) {
  const { t } = useTranslation();
  const { add } = useCart();
  const [open, setOpen] = useState(false);

  const addToCart = () => {
    add({
      // Prefixed, deliberately not UUID-shaped: a set is its own catalog
      // (the `sets` table, not `posters`), so its cart line must never be
      // treated as a real posters.id — cart.tsx's asUuid() guard already
      // nulls out selected_poster for any non-UUID posterId, same
      // mechanism custom-design.tsx relies on for its own line items.
      posterId: `set-${set.id}`,
      title: `${set.name} (Set of ${set.frames_count})`,
      image: set.image_url ?? "",
      categoryId: null,
      categoryName: "Set",
      frameType: "pvc",
      size: "30x40",
      color: "black",
      price: Number(set.price) || 0,
    });
    toast.success("Set added to cart");
  };

  const wa = whatsappLink(
    `Hello BRWAZWNEON, I want to order the "${set.name}" set (${set.frames_count} frames) — ${set.price} ${t("egp")}.`,
  );

  return (
    <div className="group flex flex-col overflow-hidden rounded-sm border border-border bg-card">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {set.image_url ? (
          <SafeImage
            src={set.image_url}
            alt={set.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">
            {set.frames_count} frames
          </div>
        )}
        {set.featured ? (
          <span className="absolute left-3 top-3 rounded-sm bg-primary px-2 py-1 text-[10px] uppercase tracking-widest text-primary-foreground">
            {t("sets.featured")}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-display text-2xl leading-tight">{set.name}</h3>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              {set.frames_count} Frame{set.frames_count > 1 ? "s" : ""}
            </p>
          </div>
          <div className="text-right">
            {set.old_price && Number(set.old_price) > Number(set.price) ? (
              <div className="text-xs text-muted-foreground line-through">
                {set.old_price} {t("egp")}
              </div>
            ) : null}
            <div className="text-display text-2xl">
              {set.price}
              <span className="ml-1 text-xs uppercase tracking-widest text-muted-foreground">
                {t("egp")}
              </span>
            </div>
          </div>
        </div>
        {set.description ? (
          <p className={`text-sm text-muted-foreground ${open ? "" : "line-clamp-2"}`}>
            {set.description}
          </p>
        ) : null}
        {set.description && set.description.length > 90 ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="self-start text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            {open ? t("sets.hideDetails") : t("sets.viewDetails")}
          </button>
        ) : null}
        <div className="mt-auto flex gap-2 pt-2">
          <button
            onClick={addToCart}
            className="flex-1 rounded-sm bg-primary px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
          >
            {t("sets.addToCart")}
          </button>
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-border px-4 py-3 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
          >
            {t("whatsappLabel")}
          </a>
        </div>
      </div>
    </div>
  );
}
