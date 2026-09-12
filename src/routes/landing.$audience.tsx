import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FramedArtwork } from "@/components/FramedArtwork";
import { WishlistHeart } from "@/components/WishlistHeart";
import { PosterBadge } from "@/components/PosterBadge";
import { useLandingBundle, persistAudienceAttribution } from "@/lib/landing-pages";
import { getLandingBundlePublic } from "@/lib/db-public.functions";
import { whatsappLink } from "@/lib/whatsapp";
import { trackEvent, trackCustom } from "@/lib/meta-pixel";
import { usePricing } from "@/lib/use-settings";
import { cn } from "@/lib/utils";
import { MessageCircle, ShieldCheck, Truck, Star, Sparkles } from "lucide-react";
import { resolveProductArtwork, usePosterResponsiveImages } from "@/lib/public-images";

const BASE_URL = "https://brwazwneon.com";

function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const Route = createFileRoute("/landing/$audience")({
  // No fixed allow-list — any category slug (or a dedicated audience key
  // like "general") works as long as a landing_pages row for it exists
  // and is marked visible. An unvisible/nonexistent one still renders a
  // friendly in-page message rather than a hard 404, since ad traffic
  // can hit these before the campaign is flipped live.
  loader: async ({ params }) => {
    const bundle = await getLandingBundlePublic({ data: { audience: params.audience } }).catch(
      () => null,
    );
    return { bundle };
  },
  head: ({ loaderData, params }) => {
    const page = loaderData?.bundle?.page;
    const label = page?.title_en || prettifySlug(params.audience);
    const title = page?.seo_title || `${label} Posters — BRWAZWNEON`;
    const description =
      page?.meta_description ||
      `Shop premium framed ${label.toLowerCase()} posters. Fast delivery across Egypt.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${BASE_URL}/landing/${params.audience}` },
      ],
    };
  },
  component: LandingPage,
});

function LandingPage() {
  const { audience } = Route.useParams();
  const { data, isLoading } = useLandingBundle(audience);
  const pricing = usePricing();
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    persistAudienceAttribution(audience, params);
    try {
      const utm_campaign = params.get("utm_campaign") || `${audience}_ads`;
      trackCustom("LandingPageView", {
        audience_type: audience,
        landing_page: `/landing/${audience}`,
        utm_campaign,
      });
      trackEvent("ViewContent", {
        content_category: audience,
        content_name: `Landing: ${audience}`,
        audience_type: audience,
        landing_page: `/landing/${audience}`,
        utm_campaign,
      });
    } catch {
      /* noop */
    }
  }, [audience]);

  const page = data?.page;
  const posters = data?.posters ?? [];
  const shown = useMemo(() => posters.slice(0, visibleCount), [posters, visibleCount]);
  const images = usePosterResponsiveImages(
    shown.map((p) => p.id),
    "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  );

  if (isLoading) {
    return <div className="container-page py-20 text-center text-muted-foreground">Loading…</div>;
  }

  if (!page) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="text-display text-4xl">Landing page unavailable</h1>
        <p className="mt-3 text-muted-foreground">This campaign page is currently hidden.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          Home
        </Link>
      </div>
    );
  }

  const fallbackLabel = prettifySlug(audience);
  const titleAr = page.title_ar || fallbackLabel;
  const titleEn = page.title_en || fallbackLabel;
  const subtitleAr = page.subtitle_ar || "";
  const subtitleEn = page.subtitle_en || "";
  const cta = page.cta_text || "اطلب عبر واتساب";
  const wa = whatsappLink(page.whatsapp_message || `أهلًا، مهتم ببوسترات ${titleAr}.`);
  const fromPrice = pricing.frame.pvc["20x30"] ?? 0;

  const onWaClick = () => {
    try {
      trackEvent("Contact", { method: "whatsapp", audience_type: audience, landing_page: `/landing/${audience}` });
      trackEvent("Lead", { method: "whatsapp", audience_type: audience, landing_page: `/landing/${audience}` });
      trackCustom("WhatsAppClick", { audience_type: audience, landing_page: `/landing/${audience}` });
    } catch {
      /* noop */
    }
  };

  return (
    <div className="pb-20 sm:pb-0">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        {page.hero_image && (
          <div className="absolute inset-0">
            <img src={page.hero_image} alt="" loading="eager" className="h-full w-full object-cover opacity-25" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/50" />
          </div>
        )}
        <div className="container-page relative py-16 text-center md:py-24">
          {fromPrice > 0 && (
            <div className="mx-auto mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary">
              <Sparkles className="h-3 w-3" />
              يبدأ من {fromPrice} جنيه
            </div>
          )}
          <div className="text-xs uppercase tracking-[0.4em] text-primary">{titleEn}</div>
          <h1 className="mt-3 text-display text-5xl leading-[1.05] md:text-7xl" dir="rtl">
            {titleAr}
          </h1>
          {subtitleAr && (
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground" dir="rtl">
              {subtitleAr}
            </p>
          )}
          {subtitleEn && (
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{subtitleEn}</p>
          )}
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onWaClick}
            className="mt-8 inline-flex items-center gap-2 rounded-sm bg-[#25D366] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-[#25D366]/20 transition hover:scale-[1.02]"
          >
            <MessageCircle className="h-5 w-5" /> {cta}
          </a>

          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> ضمان الجودة
            </span>
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" /> شحن لكل مصر
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5" /> تقييمات عملاء ممتازة
            </span>
          </div>
        </div>
      </section>

      {/* Posters Grid */}
      <section className="container-page py-12">
        {posters.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">لا توجد صور مضافة لهذه الصفحة بعد.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((p) => {
                const image = images[p.id];
                return (
                  <Link
                    key={p.id}
                    to="/category/$slug"
                    params={{ slug: audience }}
                    className="group relative overflow-hidden rounded-sm border border-border bg-card transition hover:border-primary/40"
                    onClick={() => {
                      try {
                        trackEvent("ViewContent", {
                          content_ids: [p.id],
                          content_name: p.title,
                          audience_type: audience,
                          landing_page: `/landing/${audience}`,
                        });
                      } catch {
                        /* noop */
                      }
                    }}
                  >
                    <div className="aspect-[2/3] overflow-hidden">
                      <FramedArtwork
                        posterUrl={resolveProductArtwork(p, images)}
                        avifSrcSet={image?.avifSrcSet}
                        webpSrcSet={image?.webpSrcSet}
                        sizes={image?.sizes}
                        title={p.title}
                        aspectClassName="aspect-[2/3]"
                        loading="lazy"
                        className={cn("h-full w-full transition group-hover:scale-[1.02]")}
                        posterFallbackUrl={p.image_url || ""}
                      />
                    </div>
                    {p.pinned && (
                      <div className="absolute top-2 left-2 z-10">
                        <PosterBadge badge="Pinned" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 z-10">
                      <WishlistHeart posterId={p.id} />
                    </div>
                    <div className="p-3">
                      <div className="truncate text-sm">{p.title}</div>
                      {fromPrice > 0 && (
                        <div className="mt-0.5 text-xs text-muted-foreground" dir="rtl">
                          يبدأ من {fromPrice} جنيه
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            {visibleCount < posters.length && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => setVisibleCount((c) => c + 12)}
                  className="rounded-sm border border-border px-5 py-2 text-xs uppercase tracking-widest hover:bg-accent"
                >
                  Load more
                </button>
              </div>
            )}

            <div className="mt-6 text-center">
              <Link
                to="/category/$slug"
                params={{ slug: audience }}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                تصفح كل المجموعة ←
              </Link>
            </div>
          </>
        )}
      </section>

      {/* Bottom WhatsApp CTA */}
      <section className="container-page hidden pb-16 pt-2 sm:block">
        <div className="rounded-sm border border-border bg-accent/30 p-6 text-center">
          <div className="text-display text-2xl" dir="rtl">
            جاهز تطلب؟
          </div>
          <p className="mt-2 text-sm text-muted-foreground" dir="rtl">
            تواصل معنا مباشرة على واتساب لتحديد المقاس والبرواز.
          </p>
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onWaClick}
            className="mt-5 inline-flex items-center gap-2 rounded-sm bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" /> {cta}
          </a>
        </div>
      </section>

      {/* Sticky mobile CTA — ad landing pages convert far better when the
          action is always one tap away instead of requiring a scroll back
          up to the hero. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur sm:hidden">
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onWaClick}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-[#25D366] px-4 py-3.5 text-sm font-semibold text-white"
        >
          <MessageCircle className="h-5 w-5" /> {cta}
        </a>
      </div>
    </div>
  );
}
