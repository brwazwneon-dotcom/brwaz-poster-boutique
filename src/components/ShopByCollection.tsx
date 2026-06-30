import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SafeImage } from "@/components/SafeImage";

export type CollectionCard = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  link: string;
  enabled?: boolean;
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
        }));
      }
      return { visible, cards };
    },
  });
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
              {c.image ? (
                <SafeImage
                  src={c.image}
                  alt={c.title}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover grayscale transition duration-700 group-hover:scale-105 group-hover:grayscale-0"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-black" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
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