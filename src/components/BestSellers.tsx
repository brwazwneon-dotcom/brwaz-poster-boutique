import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getBestSellersPublic } from "@/lib/db-public.functions";
import { FramePreview } from "./FramePreview";
import { WishlistHeart } from "./WishlistHeart";
import { PosterBadge } from "./PosterBadge";
import { useCart } from "@/lib/cart";
import { usePricing, priceForFrame } from "@/lib/use-settings";
import { useBestSellersConfig } from "@/lib/homepage-sections";
import { ChevronLeft, ChevronRight, ShoppingCart, Eye, Flame } from "lucide-react";
import { toast } from "sonner";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { usePosterResponsiveImages } from "@/lib/public-images";
import { useActiveAutoplay } from "@/hooks/use-active-autoplay";

type BSRow = {
  id: string;
  poster_id: string;
  position: number;
  posters: {
    id: string;
    title: string;
    image_url?: string;
    badge: string | null;
    category_id: string | null;
    hidden: boolean;
    categories: { name: string; slug: string } | null;
  } | null;
};

export function BestSellers({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { t } = useTranslation();
  const cfg = useBestSellersConfig();
  const pricing = usePricing();
  const { add } = useCart();
  const [scroller, autoplayActive] = useActiveAutoplay<HTMLDivElement>();
  const perf = usePerformanceFlags();
  const count = perf.emergency_fast_mode ? 8 : Math.min(cfg.homepage_count, 12);

  const { data = [] } = useQuery({
    queryKey: ["best-sellers", count],
    staleTime: 60_000,
    queryFn: async () => {
      const rows = (await getBestSellersPublic()) as BSRow[];
      return rows.filter((r) => r.posters && !r.posters.hidden).slice(0, count);
    },
  });
  const images = usePosterResponsiveImages(
    data.map((r) => r.posters?.id).filter(Boolean) as string[],
    "(max-width: 640px) 70vw, (max-width: 1024px) 45vw, 19vw",
  );

  // autoplay
  useEffect(() => {
    if (!cfg.autoplay || !autoplayActive) return;
    const el = scroller.current;
    if (!el) return;
    const id = setInterval(() => {
      if (!el) return;
      const step = el.clientWidth * 0.8;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft + step >= maxScroll - 4) {
        if (cfg.loop) el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: step, behavior: "smooth" });
      }
    }, 5000);
    return () => clearInterval(id);
  }, [autoplayActive, cfg.autoplay, cfg.loop, data.length, scroller]);

  if (!cfg.enabled) return null;
  if (data.length === 0) return null;

  const scroll = (dir: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    const step = el.clientWidth * 0.8;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (dir === 1 && el.scrollLeft + step >= maxScroll - 4 && cfg.loop) {
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else if (dir === -1 && el.scrollLeft <= 4 && cfg.loop) {
      el.scrollTo({ left: maxScroll, behavior: "smooth" });
    } else {
      el.scrollBy({ left: dir * step, behavior: "smooth" });
    }
  };

  const handleAdd = (r: BSRow) => {
    const p = r.posters!;
    const size = "30x40" as const;
    const frameType = "pvc" as const;
    const color = "black" as const;
    add({
      posterId: p.id,
      title: p.title,
      image: images[p.id]?.src ?? "",
      categoryId: p.category_id,
      categoryName: p.categories?.name ?? "",
      frameType,
      size,
      color,
      price: priceForFrame(pricing, frameType, size),
    });
    toast.success(t("cart.addedToCart"));
  };

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-16">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              <Flame className="mr-1 inline h-3 w-3" /> {t("trending.label")}
            </p>
            <h2 className="text-display mt-3 text-4xl sm:text-6xl">
              {title || cfg.title || t("home.bestSellers")}
            </h2>
            {(subtitle ?? cfg.subtitle) ? (
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {subtitle ?? cfg.subtitle}
              </p>
            ) : null}
          </div>
          <div className="hidden gap-2 sm:flex">
            <button
              aria-label={t("common.scrollLeft")}
              onClick={() => scroll(-1)}
              className="rounded-sm border border-border p-2.5 hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              aria-label={t("common.scrollRight")}
              onClick={() => scroll(1)}
              className="rounded-sm border border-border p-2.5 hover:bg-accent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={scroller}
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {data.map((r) => {
            const p = r.posters!;
            const price = priceForFrame(pricing, "pvc", "30x40");
            const badgeText = p.badge && p.badge.length > 0 ? p.badge : "best-seller";
            return (
              <article
                key={r.id}
                className="group relative w-[70%] shrink-0 snap-start sm:w-[45%] md:w-[32%] lg:w-[19%]"
              >
                <div className="relative overflow-hidden rounded-sm border border-border bg-muted">
                  {cfg.show_badges && badgeText ? <PosterBadge badge={badgeText} /> : null}
                  {cfg.show_wishlist ? <WishlistHeart posterId={p.id} /> : null}
                  <FramePreview
                    posterUrl={images[p.id]?.src || p.image_url || ""}
                    avifSrcSet={images[p.id]?.avifSrcSet}
                    webpSrcSet={images[p.id]?.webpSrcSet}
                    sizes={images[p.id]?.sizes}
                    title={p.title}
                    aspectClassName="aspect-[3/4]"
                    color="black"
                    loading="lazy"
                    className="h-full w-full transition duration-500 group-hover:scale-[1.02]"
                  />
                  {/* Hover quick actions */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-full flex-col gap-2 bg-background/95 p-3 transition group-hover:pointer-events-auto group-hover:translate-y-0">
                    {cfg.show_cart ? (
                      <button
                        onClick={() => handleAdd(r)}
                        className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" /> {t("product.addToCart")}
                      </button>
                    ) : null}
                    {cfg.show_quick_view && p.categories ? (
                      <Link
                        to="/category/$slug"
                        params={{ slug: p.categories.slug }}
                        className="inline-flex items-center justify-center gap-2 rounded-sm border border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
                      >
                        <Eye className="h-3.5 w-3.5" /> {t("product.quickView")}
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>{p.categories?.name ?? t("common.poster")}</span>
                    {cfg.show_price ? <span className="text-foreground">{price} EGP</span> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-8 flex justify-center">
          <Link
            to="/best-sellers"
            className="inline-flex items-center gap-2 rounded-sm border border-primary px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-primary hover:bg-primary hover:text-primary-foreground transition"
          >
            {t("bestSellers.viewAll")} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
