import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FramedArtwork } from "@/components/FramedArtwork";
import { useRecentlyViewed } from "@/lib/recently-viewed";
import { useCart } from "@/lib/cart";
import { usePricing, priceForFrame } from "@/lib/use-settings";
import { toast } from "sonner";
import {
  resolveProductArtwork,
  usePosterResponsiveImages,
  isValidProductImage,
} from "@/lib/public-images";

export function RecentlyViewed({
  excludeId,
  title,
}: {
  excludeId?: string;
  title?: string;
}) {
  const { t } = useTranslation();
  const displayTitle = title ?? t("home.recentlyViewed");
  const { items } = useRecentlyViewed();
  const cart = useCart();
  const pricing = usePricing();

  // Recently Viewed caches {id, title, image_url} in localStorage at view
  // time and never refetches it — a poster viewed weeks ago can have since
  // been reset to the placeholder or marked broken server-side. Server
  // queries already exclude those; this is the client-side backstop for
  // this one cached-at-the-edge list.
  const list = (excludeId ? items.filter((i) => i.id !== excludeId) : items).filter(
    isValidProductImage,
  );
  const images = usePosterResponsiveImages(
    list.map((p) => p.id),
    "(max-width: 640px) 180px, 220px",
  );

  const fromPrice = priceForFrame(pricing, "pvc", "20x30");

  const scroller = useRef<HTMLDivElement | null>(null);
  // Same step/scroll logic as BestSellers.tsx and TrendingNow.tsx's own
  // carousels — reused rather than reinvented so all three horizontal
  // rails behave identically (including in RTL, already correct there).
  const scroll = (dir: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  if (list.length === 0) return null;

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-16">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              {t("home.justForYou")}
            </p>
            <h2 className="text-display mt-3 text-3xl sm:text-5xl">{displayTitle}</h2>
          </div>
          {list.length > 2 && (
            <div className="hidden gap-2 sm:flex">
              <button
                type="button"
                aria-label={t("common.scrollLeft")}
                onClick={() => scroll(-1)}
                className="rounded-sm border border-border p-2.5 hover:bg-accent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t("common.scrollRight")}
                onClick={() => scroll(1)}
                className="rounded-sm border border-border p-2.5 hover:bg-accent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div
          ref={scroller}
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:gap-5 [scrollbar-width:thin]"
          style={{ scrollbarColor: "hsl(var(--border)) transparent" }}
        >
          {list.map((p) => {
            const image = images[p.id];
            return (
              <article
                key={p.id}
                className="group relative w-[180px] shrink-0 snap-start sm:w-[220px]"
              >
                <Link
                  to={p.category_slug ? "/category/$slug" : "/"}
                  params={p.category_slug ? { slug: p.category_slug } : undefined}
                  className="block aspect-[3/4] overflow-hidden rounded-sm border border-border bg-muted"
                >
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
                </Link>
                <div className="mt-3 space-y-1">
                  {p.category_name && (
                    <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                      {p.category_name}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {t("common.from")} <span className="text-foreground">{fromPrice}</span>{" "}
                    {t("egp")}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    to={p.category_slug ? "/category/$slug" : "/"}
                    params={p.category_slug ? { slug: p.category_slug } : undefined}
                    className="flex-1 rounded-sm border border-border px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
                  >
                    {t("product.quickView")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      cart.add({
                        posterId: p.id,
                        title: p.title,
                        image: resolveProductArtwork(p, images),
                        categoryId: p.category_id,
                        categoryName: p.category_name ?? t("common.poster"),
                        frameType: "pvc",
                        size: "20x30",
                        color: "black",
                        price: priceForFrame(pricing, "pvc", "20x30"),
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
