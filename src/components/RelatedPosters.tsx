import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getRelatedPostersPublic } from "@/lib/db-public.functions";
import { FramedArtwork } from "@/components/FramedArtwork";
import { useCart } from "@/lib/cart";
import { usePricing, priceForFrame } from "@/lib/use-settings";
import { useCategories, descendantIds } from "@/lib/use-categories";
import { PosterBadge } from "@/components/PosterBadge";
import { formatCount } from "@/lib/poster-badges";
import { resolveProductArtwork, usePosterResponsiveImages } from "@/lib/public-images";

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
  "the",
  "and",
  "for",
  "with",
  "from",
  "poster",
  "posters",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "by",
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
  const { t } = useTranslation();
  const { data: categories = [] } = useCategories();
  const cart = useCart();
  const pricing = usePricing();

  const catIds = poster.category_id ? descendantIds(categories, poster.category_id) : [];
  const tags = (poster.tags ?? []).filter(Boolean);
  const words = keywords(poster.title);

  const { data: related = [] } = useQuery({
    queryKey: ["related-posters", poster.id, catIds.join(","), tags.join(","), words.join(",")],
    enabled: !!poster.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      return getRelatedPostersPublic({
        data: { posterId: poster.id, categoryIds: catIds, tags, words },
      }) as Promise<RelatedPoster[]>;
    },
  });

  const unit = priceForFrame(pricing, "pvc", "20x30");
  const images = usePosterResponsiveImages(
    related.map((p) => p.id),
    "(max-width: 640px) 180px, (max-width: 1024px) 25vw, 20vw",
  );

  if (related.length === 0) return null;

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-16">
        <div className="mb-8">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            {t("product.youMayAlsoLike")}
          </p>
          <h2 className="text-display mt-3 text-3xl sm:text-5xl">{t("product.relatedProducts")}</h2>
        </div>

        <div
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:gap-5 sm:overflow-visible sm:px-0 sm:mx-0 sm:grid sm:grid-cols-4 lg:grid-cols-4 [scrollbar-width:thin]"
          style={{ scrollbarColor: "hsl(var(--border)) transparent" }}
        >
          {related.map((p) => {
            const image = images[p.id];
            return (
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
                  <FramedArtwork
                    posterUrl={resolveProductArtwork(p, images)}
                    avifSrcSet={image?.avifSrcSet}
                    webpSrcSet={image?.webpSrcSet}
                    sizes={image?.sizes}
                    title={p.title}
                    editSettings={p.edit_settings}
                    aspectClassName="aspect-[3/4]"
                    loading="lazy"
                    className="h-full w-full transition duration-500 group-hover:scale-105"
                  />
                </Link>
                <div className="mt-3 space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {t("common.from")} <span className="text-foreground">{unit}</span> {t("egp")}
                  </div>
                  {p.sales_count != null && p.sales_count > 0 && (
                    <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      ✔ {formatCount(p.sales_count)} {t("product.purchased")}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    to={categorySlug ? "/category/$slug" : "/"}
                    params={categorySlug ? { slug: categorySlug } : undefined}
                    className="flex-1 rounded-sm border border-border px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
                  >
                    {t("common.view")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      cart.add({
                        posterId: p.id,
                        title: p.title,
                        image: resolveProductArtwork(p, images),
                        categoryId: p.category_id,
                        categoryName: categoryName ?? t("common.poster"),
                        frameType: "pvc",
                        size: "20x30",
                        color: "black",
                        price: unit,
                      });
                      toast.success(t("cart.itemAddedToCart", { title: p.title }));
                    }}
                    className="flex-1 rounded-sm bg-primary px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
                  >
                    {t("common.add")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
