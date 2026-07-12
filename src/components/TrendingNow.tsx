import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { FramePreview } from "./FramePreview";
import { WishlistHeart } from "./WishlistHeart";
import { Flame, ArrowRight } from "lucide-react";

export function TrendingNow({
  title,
  subtitle,
  itemsCount = 12,
  manualIds,
}: {
  title?: string;
  subtitle?: string;
  itemsCount?: number;
  manualIds?: string[];
}) {
  const useManual = Array.isArray(manualIds) && manualIds.length > 0;
  const { data = [] } = useQuery({
    queryKey: ["trending-now-home", useManual ? manualIds!.join(",") : "auto", itemsCount],
    staleTime: 60_000,
    queryFn: async () => {
      if (useManual) {
        const { data, error } = await supabase
          .from("posters")
          .select("id,title,image_url,category_id,categories(name,slug)")
          .in("id", manualIds!)
          .eq("hidden", false)
          .not("image_url", "is", null);
        if (error) throw error;
        const m = new Map((data ?? []).map((p) => [p.id, p]));
        return manualIds!.map((id) => m.get(id)).filter(Boolean).slice(0, itemsCount);
      }
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,category_id,categories(name,slug)")
        .eq("trending", true)
        .eq("hidden", false)
        .not("image_url", "is", null)
        .order("trending_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(itemsCount);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (data.length === 0) return null;

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-16">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-primary">
              <Flame className="mr-1 inline h-3 w-3" /> Trending
            </p>
            <h2 className="text-display mt-3 text-4xl sm:text-6xl">
              {title || "Trending Now"}
            </h2>
            {subtitle ? (
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <Link
            to="/trending"
            className="group inline-flex shrink-0 items-center gap-2 rounded-sm border border-border bg-background px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground transition hover:bg-primary hover:text-primary-foreground"
          >
            View all
            <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {data.map((p: any) => (
            <Link
              key={p.id}
              to="/category/$slug"
              params={{ slug: p.categories?.slug ?? "movies" }}
              className="group relative block w-[45%] shrink-0 snap-start overflow-hidden rounded-sm border border-border bg-muted sm:w-[24%] lg:w-[16%]"
            >
              <WishlistHeart posterId={p.id} />
              <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-sm bg-primary/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary-foreground">
                <Flame className="h-2.5 w-2.5" /> Trending
              </span>
              <FramePreview
                posterUrl={p.image_url}
                title={p.title}
                aspectClassName="aspect-[3/4]"
                color="black"
                loading="lazy"
                className="h-full w-full transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 translate-y-full bg-background/90 px-3 py-2 text-[10px] uppercase tracking-widest transition group-hover:translate-y-0">
                {p.title}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}