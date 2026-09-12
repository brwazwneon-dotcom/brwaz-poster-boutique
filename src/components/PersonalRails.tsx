import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FramedArtwork } from "./FramedArtwork";
import { WishlistHeart } from "./WishlistHeart";
import { fetchRecommendations, type RecPoster } from "@/lib/behavior";
import { visitorId } from "@/lib/analytics";
import { useCategories } from "@/lib/use-categories";
import { resolveProductArtwork, usePosterResponsiveImages } from "@/lib/public-images";

function useRecs() {
  return useQuery({
    queryKey: ["personalized-recs", typeof window === "undefined" ? "ssr" : visitorId()],
    staleTime: 60_000,
    queryFn: () => fetchRecommendations(24),
    enabled: typeof window !== "undefined",
  });
}

function Rail({
  title,
  subtitle,
  items,
  eyebrow,
  itemsCount = 12,
}: {
  title: string;
  subtitle?: string;
  items: RecPoster[];
  eyebrow?: string;
  itemsCount?: number;
}) {
  const { t } = useTranslation();
  const { data: categories = [] } = useCategories();
  const slug = (id: string | null) => categories.find((c) => c.id === id)?.slug ?? "movies";
  const list = items.slice(0, itemsCount);
  const images = usePosterResponsiveImages(
    list.map((p) => p.id),
    "(max-width: 640px) 45vw, (max-width: 1024px) 24vw, 16vw",
  );
  if (list.length === 0) return null;
  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-primary">
              {eyebrow ?? t("home.forYou")}
            </p>
            <h2 className="text-display mt-2 text-3xl sm:text-4xl">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div
          className="grid grid-flow-col auto-cols-[45%] gap-3 overflow-x-auto pb-3 sm:auto-cols-[24%] lg:auto-cols-[16%] scroll-smooth snap-x snap-mandatory"
          style={{ scrollbarWidth: "thin" }}
        >
          {list.map((p) => {
            const image = images[p.id];
            return (
              <Link
                key={p.id}
                to="/category/$slug"
                params={{ slug: slug(p.category_id) }}
                className="group relative block aspect-[3/4] overflow-hidden rounded-sm border border-border bg-muted snap-start"
              >
                <WishlistHeart posterId={p.id} />
                <FramedArtwork
                  posterUrl={resolveProductArtwork(p, images)}
                  avifSrcSet={image?.avifSrcSet}
                  webpSrcSet={image?.webpSrcSet}
                  sizes={image?.sizes}
                  title={p.title}
                  aspectClassName="aspect-[3/4]"
                  loading="lazy"
                  className="h-full w-full transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 translate-y-full bg-background/90 px-3 py-2 text-[10px] uppercase tracking-widest transition group-hover:translate-y-0">
                  {p.title}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ForYouSection({
  title,
  subtitle,
  itemsCount,
}: {
  title?: string;
  subtitle?: string;
  itemsCount?: number;
}) {
  const { t } = useTranslation();
  const { data } = useRecs();
  if (!data) return null;
  const items = data.recommended_for_you.length ? data.recommended_for_you : data.recently_viewed;
  return (
    <Rail
      title={title || t("home.forYou")}
      subtitle={subtitle}
      items={items}
      itemsCount={itemsCount}
    />
  );
}

export function BecauseYouLikedSection({
  title,
  subtitle,
  itemsCount,
}: {
  title?: string;
  subtitle?: string;
  itemsCount?: number;
}) {
  const { t } = useTranslation();
  const { data } = useRecs();
  if (!data) return null;
  if (!data.because_you_liked.length) return null;
  const heading =
    title ||
    (data.top_category_name
      ? t("home.becauseYouLikedCategory", { category: data.top_category_name })
      : t("home.becauseYouLiked"));
  return (
    <Rail
      title={heading}
      subtitle={subtitle}
      items={data.because_you_liked}
      itemsCount={itemsCount}
    />
  );
}

export function RecommendedForYouSection({
  title,
  subtitle,
  itemsCount,
}: {
  title?: string;
  subtitle?: string;
  itemsCount?: number;
}) {
  const { t } = useTranslation();
  const { data } = useRecs();
  if (!data) return null;
  const items = data.popular_in_tag.length ? data.popular_in_tag : data.recommended_for_you;
  return (
    <Rail
      title={title || t("home.recommendedForYou")}
      subtitle={subtitle}
      items={items}
      itemsCount={itemsCount}
    />
  );
}
