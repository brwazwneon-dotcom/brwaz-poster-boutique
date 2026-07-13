import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Flame, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FramePreview } from "@/components/FramePreview";
import { WishlistHeart } from "@/components/WishlistHeart";
import { useCategories } from "@/lib/use-categories";
import { usePricing, priceForFrame } from "@/lib/use-settings";

export const Route = createFileRoute("/trending")({
  head: () => ({
    meta: [
      { title: "Trending Now — BRWAZWNEON" },
      { name: "description", content: "Browse every trending framed poster on BRWAZWNEON. Discover what everyone in Egypt is hanging on their walls right now." },
      { property: "og:title", content: "Trending Now — BRWAZWNEON" },
      { property: "og:description", content: "Browse every trending framed poster on BRWAZWNEON right now." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TrendingPage,
});

type Poster = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  hidden: boolean;
  sales_count: number | null;
  views_count: number | null;
  created_at: string;
  trending_order: number | null;
  categories: { name: string; slug: string } | null;
};

type SortKey = "curated" | "newest" | "popular";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function TrendingPage() {
  const pricing = usePricing();
  const { data: categories = [] } = useCategories();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("curated");
  const [shuffleSeed] = useState(() => Math.random());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["trending-page"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,category_id,hidden,sales_count,views_count,created_at,trending_order,categories(name,slug)")
        .eq("trending", true)
        .eq("hidden", false)
        .not("image_url", "is", null)
        .order("trending_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Poster[];
    },
  });

  const price = priceForFrame(pricing, "pvc", "30x40");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.filter((p) => {
      if (cat && p.category_id !== cat) return false;
      if (needle && !p.title.toLowerCase().includes(needle)) return false;
      return true;
    });
    if (sort === "newest") {
      list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sort === "popular") {
      list = [...list].sort((a, b) => (b.sales_count ?? 0) - (a.sales_count ?? 0));
    } else {
      // Curated = random shuffle for a fresh feel on each visit.
      void shuffleSeed;
      list = shuffle(list);
    }
    return list;
  }, [rows, q, cat, sort, shuffleSeed]);

  return (
    <div className="min-h-screen bg-background">
      <section className="container-page pt-16 pb-8">
        <p className="text-[10px] uppercase tracking-[0.5em] text-primary">
          <Flame className="mr-1 inline h-3 w-3" /> Trending
        </p>
        <h1 className="text-display mt-3 text-4xl sm:text-6xl">Trending Now</h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          The framed posters everyone is talking about. Fresh picks, updated constantly.
        </p>
      </section>

      <section className="container-page pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search trending…"
              className="w-full rounded-sm border border-border bg-background py-2 pl-10 pr-3 text-sm"
            />
          </div>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="curated">Curated order</option>
            <option value="newest">Newest</option>
            <option value="popular">Most popular</option>
          </select>
          <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
            {filtered.length} of {rows.length}
          </span>
        </div>
      </section>

      <section className="container-page pb-24">
        {isLoading ? (
          <div className="py-24 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center text-sm text-muted-foreground">
            No trending posters match your filters yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((p, index) => (
              <article key={p.id} className="group relative">
                <div className="relative">
                  <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-sm bg-primary/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary-foreground">
                    <Flame className="h-2.5 w-2.5" /> Trending
                  </span>
                  <WishlistHeart posterId={p.id} />
                  <Link
                    to="/category/$slug"
                    params={{ slug: p.categories?.slug ?? "movies" }}
                    aria-label={p.title}
                    className="block"
                  >
                    <FramePreview
                      posterUrl={p.image_url}
                      title={p.title}
                      frameType="pvc"
                      color="black"
                      loading={index < 8 ? "eager" : "lazy"}
                      className="transition duration-500 group-hover:scale-[1.02]"
                    />
                  </Link>
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span className="truncate">{p.title}</span>
                  <span className="text-foreground">{price} EGP</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}