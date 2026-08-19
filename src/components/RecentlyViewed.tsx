import { Link } from "@tanstack/react-router";
import { FramedArtwork } from "@/components/FramedArtwork";
import { useRecentlyViewed } from "@/lib/recently-viewed";
import { useCart } from "@/lib/cart";
import { usePricing, priceForFrame } from "@/lib/use-settings";
import { toast } from "sonner";
import { resolveProductArtwork, usePosterResponsiveImages } from "@/lib/public-images";

export function RecentlyViewed({
  excludeId,
  title = "Recently Viewed",
}: {
  excludeId?: string;
  title?: string;
}) {
  const { items } = useRecentlyViewed();
  const cart = useCart();
  const pricing = usePricing();

  const list = excludeId ? items.filter((i) => i.id !== excludeId) : items;
  const images = usePosterResponsiveImages(
    list.map((p) => p.id),
    "(max-width: 640px) 180px, 220px",
  );

  const fromPrice = priceForFrame(pricing, "pvc", "20x30");

  if (list.length === 0) return null;

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-16">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              Just for you
            </p>
            <h2 className="text-display mt-3 text-3xl sm:text-5xl">{title}</h2>
          </div>
        </div>

        <div
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
                    From <span className="text-foreground">{fromPrice}</span> EGP
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    to={p.category_slug ? "/category/$slug" : "/"}
                    params={p.category_slug ? { slug: p.category_slug } : undefined}
                    className="flex-1 rounded-sm border border-border px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
                  >
                    Quick View
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      cart.add({
                        posterId: p.id,
                        title: p.title,
                        image: resolveProductArtwork(p, images),
                        categoryId: p.category_id,
                        categoryName: p.category_name ?? "Poster",
                        frameType: "pvc",
                        size: "20x30",
                        color: "black",
                        price: priceForFrame(pricing, "pvc", "20x30"),
                      });
                      toast.success(`${p.title} added to cart`);
                    }}
                    className="flex-1 rounded-sm bg-primary px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
                  >
                    Add
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
