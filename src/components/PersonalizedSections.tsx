import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FramePreview } from "@/components/FramePreview";
import { WishlistHeart } from "@/components/WishlistHeart";
import { fetchRecommendations, type RecPoster } from "@/lib/behavior";
import { visitorId } from "@/lib/analytics";
import { useCategories } from "@/lib/use-categories";

/**
 * Renders 1–5 personalized rails at the top of the homepage.
 * Silent when personalization is disabled or there's not enough signal yet.
 */
export function PersonalizedSections() {
  const { data: recs } = useQuery({
    queryKey: ["personalized-recs", typeof window === "undefined" ? "ssr" : visitorId()],
    staleTime: 60_000,
    queryFn: () => fetchRecommendations(12),
    enabled: typeof window !== "undefined",
  });
  const { data: categories = [] } = useCategories();

  if (!recs) return null;

  const catSlug = (id: string | null) => categories.find((c) => c.id === id)?.slug ?? "movies";

  const rails: Array<{ key: string; title: string; subtitle?: string; items: RecPoster[] }> = [];
  if (recs.continue_where_you_left_off.length) {
    rails.push({
      key: "continue",
      title: "Continue where you left off",
      subtitle: "Still interested? Grab it before it's gone.",
      items: recs.continue_where_you_left_off,
    });
  }
  if (recs.recently_viewed.length) {
    rails.push({
      key: "viewed",
      title: "Recently viewed",
      items: recs.recently_viewed,
    });
  }
  if (recs.because_you_liked.length && recs.top_category_name) {
    rails.push({
      key: "because",
      title: `Because you liked ${recs.top_category_name}`,
      items: recs.because_you_liked,
    });
  }
  if (recs.popular_in_tag.length && recs.top_tag) {
    rails.push({
      key: "popular-tag",
      title: `Popular in ${recs.top_tag}`,
      items: recs.popular_in_tag,
    });
  }
  if (recs.recommended_for_you.length) {
    rails.push({
      key: "for-you",
      title: "Recommended for you",
      items: recs.recommended_for_you,
    });
  }

  if (rails.length === 0) return null;

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-12 space-y-14">
        {rails.map((rail) => (
          <div key={rail.key}>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.5em] text-primary">
                  For you
                </p>
                <h2 className="text-display mt-2 text-3xl sm:text-4xl">{rail.title}</h2>
                {rail.subtitle ? (
                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                    {rail.subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            <div
              className="grid grid-flow-col auto-cols-[45%] gap-3 overflow-x-auto pb-3 sm:auto-cols-[24%] lg:auto-cols-[16%] scroll-smooth snap-x snap-mandatory"
              style={{ scrollbarWidth: "thin" }}
            >
              {rail.items.map((p) => (
                <Link
                  key={p.id}
                  to="/category/$slug"
                  params={{ slug: catSlug(p.category_id) }}
                  className="group relative block aspect-[3/4] overflow-hidden rounded-sm border border-border bg-muted snap-start"
                >
                  <WishlistHeart posterId={p.id} />
                  <FramePreview
                    posterUrl={p.image_url ?? ""}
                    title={p.title}
                    aspectClassName="aspect-[3/4]"
                    bare
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
        ))}
      </div>
    </section>
  );
}