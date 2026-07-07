import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { FramePreview } from "@/components/FramePreview";

export type CollectionCard = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  link: string;
  enabled?: boolean;
  /** Cover behavior */
  coverMode?: "auto" | "manual" | "selected";
  /** When coverMode = "selected" */
  coverPosterIds?: string[];
  /** Apply grayscale by default (default true) */
  bw?: boolean;
  /** Milliseconds between rotations (default 6000) */
  transitionMs?: number;
  /** 0..1 dark overlay strength (default 0.55) */
  overlayOpacity?: number;
};

export const DEFAULT_COLLECTIONS: CollectionCard[] = [
  { id: "football",      title: "Football",      subtitle: "Legends of the game",          image: "", link: "/category/football",      enabled: true },
  { id: "movies",        title: "Movies",        subtitle: "Cinema on your wall",          image: "", link: "/category/movies",        enabled: true },
  { id: "tv-series",     title: "TV Series",     subtitle: "Binge-worthy artwork",         image: "", link: "/category/tv-series",     enabled: true },
  { id: "marvel-dc",     title: "Marvel & DC",   subtitle: "Heroes & villains",            image: "", link: "/category/marvel-dc",     enabled: true },
  { id: "anime",         title: "Anime",         subtitle: "Iconic anime moments",         image: "", link: "/category/anime",         enabled: true },
  { id: "cars",          title: "Cars",          subtitle: "Machines & motorsport",        image: "", link: "/category/cars",          enabled: true },
  { id: "custom-design", title: "Custom Design", subtitle: "Your image, framed",           image: "", link: "/custom-design",          enabled: true },
  { id: "photo-printing",title: "Photo Printing",subtitle: "Print your memories",          image: "", link: "/photo-printing",         enabled: true },
];

function extractCategorySlug(link: string): string | null {
  const m = link.match(/^\/category\/([^/?#]+)/);
  return m ? m[1] : null;
}

export function useHomeCollections() {
  return useQuery({
    queryKey: ["home-collections"],
    staleTime: 60_000,
    initialData: { visible: true, cards: DEFAULT_COLLECTIONS },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", ["home_collections", "home_collections_visible"]);
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      const raw = map.get("home_collections");
      const visibleRaw = map.get("home_collections_visible");
      const visible = visibleRaw === undefined ? true : !!visibleRaw;
      let cards: CollectionCard[] = DEFAULT_COLLECTIONS;
      if (Array.isArray(raw) && raw.length > 0) {
        cards = (raw as CollectionCard[]).map((c, i) => ({
          id: c.id ?? String(i),
          title: c.title ?? "",
          subtitle: c.subtitle ?? "",
          image: c.image ?? "",
          link: c.link ?? "/",
          enabled: c.enabled !== false,
          coverMode: c.coverMode ?? "auto",
          coverPosterIds: Array.isArray(c.coverPosterIds) ? c.coverPosterIds : [],
          bw: c.bw === true,
          transitionMs: typeof c.transitionMs === "number" ? c.transitionMs : 6000,
          overlayOpacity:
            typeof c.overlayOpacity === "number" ? c.overlayOpacity : 0.55,
        }));
      }
      return { visible, cards };
    },
  });
}

/** Fetch rotating cover images for a card according to its cover settings. */
function useCoverImages(card: CollectionCard) {
  const mode = card.coverMode ?? "auto";
  const slug = extractCategorySlug(card.link);
  const idsKey = (card.coverPosterIds ?? []).join(",");

  return useQuery({
    queryKey: ["collection-cover", card.id, mode, slug, idsKey, card.image],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      if (mode === "manual") return card.image ? [card.image] : [];
      if (mode === "selected") {
        const ids = (card.coverPosterIds ?? []).filter(Boolean);
        if (ids.length === 0) return card.image ? [card.image] : [];
        const { data, error } = await supabase
          .from("posters")
          .select("id,image_url")
          .in("id", ids);
        if (error) throw error;
        return (data ?? [])
          .map((p) => p.image_url as string)
          .filter((u): u is string => !!u);
      }
      // auto
      if (!slug) return card.image ? [card.image] : [];
      const { data, error } = await supabase
        .from("posters")
        .select("image_url,categories!inner(slug)")
        .eq("categories.slug", slug)
        .eq("hidden", false)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      const urls = (data ?? [])
        .map((p) => p.image_url as string)
        .filter((u): u is string => !!u);
      // shuffle
      for (let i = urls.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [urls[i], urls[j]] = [urls[j], urls[i]];
      }
      return urls.slice(0, 8);
    },
  });
}

function CollectionCover({ card }: { card: CollectionCard }) {
  const { data: images = [] } = useCoverImages(card);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const valid = useMemo(() => images.filter((u) => !broken[u]), [images, broken]);
  const [index, setIndex] = useState(0);
  const interval = Math.max(2000, card.transitionMs ?? 6000);
  const bw = card.bw === true;
  const overlay = Math.max(0, Math.min(1, card.overlayOpacity ?? 0.55));

  useEffect(() => {
    if (valid.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % valid.length);
    }, interval);
    return () => clearInterval(id);
  }, [valid.length, interval]);

  useEffect(() => {
    if (index >= valid.length) setIndex(0);
  }, [valid.length, index]);

  return (
    <>
      {/* Fallback gradient — always present so gaps are never blank */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-black" />

      {/* Framed poster cover — centered inside the card */}
      <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-8">
        <div className="relative aspect-[2/3] h-full max-h-full w-auto transition-transform duration-700 group-hover:scale-[1.04]">
          {valid.map((url, i) => (
            <div
              key={url + i}
              className={[
                "absolute inset-0 transition-opacity duration-[1400ms] ease-in-out",
                bw ? "grayscale group-hover:grayscale-[30%]" : "",
                i === index ? "opacity-100" : "opacity-0",
              ].join(" ")}
            >
              <FramePreview
                posterUrl={url}
                title={card.title}
                aspectClassName="aspect-[2/3]"
                loading="lazy"
              />
              {/* Detect broken source so we can drop it from rotation */}
              <img
                src={url}
                alt=""
                aria-hidden="true"
                className="hidden"
                onError={() => setBroken((b) => ({ ...b, [url]: true }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dark overlay */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent transition-opacity duration-500 group-hover:opacity-90"
        style={{ opacity: 0.35 + overlay * 0.65 }}
      />
    </>
  );
}

export function ShopByCollection() {
  const { data } = useHomeCollections();
  if (!data || !data.visible) return null;
  const cards = data.cards.filter((c) => c.enabled !== false);
  if (cards.length === 0) return null;

  return (
    <section className="border-b border-border bg-background">
      <div className="container-page py-20">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              Curated · Collections
            </p>
            <h2 className="text-display mt-3 text-4xl sm:text-6xl">Shop By Collection</h2>
          </div>
        </div>

        {/* Mobile: swipeable cards. Desktop: grid */}
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {cards.map((c) => (
            <a
              key={c.id}
              href={c.link}
              className="group relative block aspect-[4/5] min-w-[78%] shrink-0 snap-start overflow-hidden rounded-sm border border-border bg-muted sm:min-w-0"
            >
              <CollectionCover card={c} />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                <p className="text-[10px] uppercase tracking-[0.4em] text-white/60">
                  {c.subtitle}
                </p>
                <h3 className="text-display mt-2 text-3xl text-white sm:text-4xl">
                  {c.title}
                </h3>
                <span className="mt-4 inline-flex rounded-sm border border-white/40 bg-white/0 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur transition group-hover:bg-white group-hover:text-black">
                  Shop now →
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}