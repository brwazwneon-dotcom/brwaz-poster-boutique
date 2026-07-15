import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Flame, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FramePreview } from "@/components/FramePreview";
import { WishlistHeart } from "@/components/WishlistHeart";
import { PosterBadge } from "@/components/PosterBadge";
import { useCategories } from "@/lib/use-categories";
import { usePricing, priceForFrame } from "@/lib/use-settings";
import { useBestSellersConfig } from "@/lib/homepage-sections";

export const Route = createFileRoute("/best-sellers")({
  head: () => ({
    meta: [
      { title: "Best Sellers — BRWAZWNEON" },
      { name: "description", content: "Our most-loved framed posters. Editorial picks trending across Egypt right now." },
      { property: "og:title", content: "Best Sellers — BRWAZWNEON" },
      { property: "og:description", content: "Our most-loved framed posters. Editorial picks trending across Egypt right now." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://brwazwneon-com.lovable.app/best-sellers" },
    ],
    links: [{ rel: "canonical", href: "https://brwazwneon-com.lovable.app/best-sellers" }],
  }),
  component: BestSellersPage,
});

type Row = {
  id: string;
  poster_id: string;
  position: number;
  pinned: boolean;
  featured: boolean;
  badge_disabled: boolean;
  start_date: string | null;
  end_date: string | null;
  posters: {
    id: string;
    title: string;
    image_url: string;
    badge: string | null;
    category_id: string | null;
    hidden: boolean;
    sales_count: number | null;
    views_count: number | null;
    created_at: string;
    categories: { name: string; slug: string } | null;
  } | null;
};

type SortKey = "featured" | "newest" | "popular" | "price_asc" | "price_desc";

function BestSellersPage() {
  const cfg = useBestSellersConfig();
  const pricing = usePricing();
  const { data: categories = [] } = useCategories();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("featured");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["best-sellers-page"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("best_sellers")
        .select(
          "id,poster_id,position,pinned,featured,badge_disabled,start_date,end_date,posters!inner(id,title,image_url,badge,category_id,hidden,sales_count,views_count,created_at,categories(name,slug))",
        )
        .eq("hidden", false)
        .order("pinned", { ascending: false })
        .order("position", { ascending: true });
      if (error) throw error;
      const now = Date.now();
      return (data as unknown as Row[]).filter((r) => {
        if (!r.posters || r.posters.hidden) return false;
        if (r.start_date && new Date(r.start_date).getTime() > now) return false;
        if (r.end_date && new Date(r.end_date).getTime() < now) return false;
        return true;
      });
    },
  });

  const price = priceForFrame(pricing, "pvc", "30x40");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      const p = r.posters!;
      if (cat && p.category_id !== cat) return false;
      if (needle && !p.title.toLowerCase().includes(needle)) return false;
      return true;
    });
    if (sort === "newest") {
      list = [...list].sort(
        (a, b) => new Date(b.posters!.created_at).getTime() - new Date(a.posters!.created_at).getTime(),
      );
    } else if (sort === "popular") {
      list = [...list].sort((a, b) => (b.posters!.sales_count ?? 0) - (a.posters!.sales_count ?? 0));
    }
    return list;
  }, [rows, q, cat, sort]);

  return (
    <div className="min-h-screen bg-background">
      <section className="container-page pt-16 pb-8">
        <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
          <Flame className="mr-1 inline h-3 w-3" /> All Best Sellers
        </p>
        <h1 className="text-display mt-3 text-4xl sm:text-6xl">{cfg.title || "Best Sellers"}</h1>
        {cfg.subtitle ? (
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{cfg.subtitle}</p>
        ) : null}
      </section>

      <section className="container-page pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search best sellers…"
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
            <option value="featured">Featured order</option>
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
            No best sellers match your filters yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((r) => {
              const p = r.posters!;
              const badgeText = !r.badge_disabled
                ? (p.badge && p.badge.length > 0 ? p.badge : "best-seller")
                : null;
              return (
                <article key={r.id} className="group relative">
                  <div className="relative overflow-hidden rounded-sm border border-border bg-muted">
                    {cfg.show_badges && badgeText ? <PosterBadge badge={badgeText} /> : null}
                    {cfg.show_wishlist ? <WishlistHeart posterId={p.id} /> : null}
                    <Link
                      to="/category/$slug"
                      params={{ slug: p.categories?.slug ?? "movies" }}
                      aria-label={p.title}
                    >
                      <FramePreview
                        posterUrl={p.image_url}
                        title={p.title}
                        aspectClassName="aspect-[3/4]"
                        color="black"
                        loading="lazy"
                        className="h-full w-full transition duration-500 group-hover:scale-[1.02]"
                      />
                    </Link>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span className="truncate">{p.title}</span>
                    {cfg.show_price ? <span className="text-foreground">{price} EGP</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}