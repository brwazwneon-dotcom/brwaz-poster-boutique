import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FramePreview } from "@/components/FramePreview";
import { useCart } from "@/lib/cart";
import { usePricing, priceForFrame } from "@/lib/use-settings";
import { useCategories, descendantIds } from "@/lib/use-categories";
import { PosterBadge } from "@/components/PosterBadge";
import { formatCount } from "@/lib/poster-badges";

type RelatedPoster = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  tags: string[] | null;
  edit_settings?: unknown;
  badge?: string | null;
  sales_count?: number | null;
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "poster", "posters",
  "a", "an", "of", "to", "in", "on", "by",
]);

function keywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export function RelatedPosters({
  poster,
  categorySlug,
  categoryName,
}: {
  poster: { id: string; title: string; category_id: string | null; tags?: string[] | null };
  categorySlug?: string;
  categoryName?: string;
}) {
  const { data: categories = [] } = useCategories();
  const cart = useCart();
  const pricing = usePricing();

  const catIds = poster.category_id
    ? descendantIds(categories, poster.category_id)
    : [];
  const tags = (poster.tags ?? []).filter(Boolean);
  const words = keywords(poster.title);

  const { data: related = [] } = useQuery({
    queryKey: ["related-posters", poster.id, catIds.join(","), tags.join(","), words.join(",")],
    enabled: !!poster.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const results = new Map<string, RelatedPoster>();
      const pushAll = (rows: RelatedPoster[] | null | undefined) => {
        for (const r of rows ?? []) {
          if (r.id === poster.id) continue;
          if (!results.has(r.id)) results.set(r.id, r);
          if (results.size >= 8) break;
        }
      };

      // 1. Tag overlap (strongest signal)
      if (tags.length > 0 && results.size < 8) {
        const { data } = await supabase
          .from("posters")
          .select("id,title,image_url,category_id,tags,edit_settings,badge,sales_count")
          .eq("hidden", false)
          .neq("id", poster.id)
          .overlaps("tags", tags)
          .limit(8);
        pushAll(data as RelatedPoster[] | null);
      }

      // 2. Title keyword match
      if (words.length > 0 && results.size < 8) {
        const orExpr = words
          .slice(0, 4)
          .map((w) => `title.ilike.%${w}%`)
          .join(",");
        const { data } = await supabase
          .from("posters")
          .select("id,title,image_url,category_id,tags,edit_settings,badge,sales_count")
          .eq("hidden", false)
          .neq("id", poster.id)
          .or(orExpr)
          .limit(8);
        pushAll(data as RelatedPoster[] | null);
      }

      // 3. Same category / subcategories
      if (catIds.length > 0 && results.size < 8) {
        const { data } = await supabase
          .from("posters")
          .select("id,title,image_url,category_id,tags,edit_settings,badge,sales_count")
          .eq("hidden", false)
          .neq("id", poster.id)
          .in("category_id", catIds)
          .order("views_count", { ascending: false })
          .limit(8);
        pushAll(data as RelatedPoster[] | null);
      }

      return Array.from(results.values()).slice(0, 8);
    },
  });

  if (related.length === 0) return null;

  const unit = priceForFrame(pricing, "pvc", "20x30");

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-16">
        <div className="mb-8">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            You may also like
          </p>
          <h2 className="text-display mt-3 text-3xl sm:text-5xl">Related Posters</h2>
        </div>

        <div
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:gap-5 sm:overflow-visible sm:px-0 sm:mx-0 sm:grid sm:grid-cols-4 lg:grid-cols-4 [scrollbar-width:thin]"
          style={{ scrollbarColor: "hsl(var(--border)) transparent" }}
        >
          {related.map((p) => (
            <article
              key={p.id}
              className="group relative w-[180px] shrink-0 snap-start sm:w-auto"
            >
              <Link
                to={categorySlug ? "/category/$slug" : "/"}
                params={categorySlug ? { slug: categorySlug } : undefined}
                className="block aspect-[3/4] overflow-hidden rounded-sm border border-border bg-muted"
              >
                <PosterBadge badge={p.badge} />
                <FramePreview
                  posterUrl={p.image_url}
                  title={p.title}
                  frameType="pvc"
                  color="black"
                  editSettings={p.edit_settings}
                  aspectClassName="aspect-[3/4]"
                  bare
                  loading="lazy"
                  className="h-full w-full transition duration-500 group-hover:scale-105"
                />
              </Link>
              <div className="mt-3 space-y-1">
                <div className="text-xs text-muted-foreground">
                  From <span className="text-foreground">{unit}</span> EGP
                </div>
                {p.sales_count != null && p.sales_count > 0 && (
                  <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    ✔ {formatCount(p.sales_count)} purchased
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Link
                  to={categorySlug ? "/category/$slug" : "/"}
                  params={categorySlug ? { slug: categorySlug } : undefined}
                  className="flex-1 rounded-sm border border-border px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
                >
                  View
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    cart.add({
                      posterId: p.id,
                      title: p.title,
                      image: p.image_url,
                      categoryId: p.category_id,
                      categoryName: categoryName ?? "Poster",
                      frameType: "pvc",
                      size: "20x30",
                      color: "black",
                      price: unit,
                    });
                    toast.success(`${p.title} added to cart`);
                  }}
                  className="flex-1 rounded-sm bg-primary px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
                >
                  Add
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}