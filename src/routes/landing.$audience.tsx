import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FramePreview } from "@/components/FramePreview";
import { WishlistHeart } from "@/components/WishlistHeart";
import { PosterBadge } from "@/components/PosterBadge";
import {
  AUDIENCE_KEYS,
  AUDIENCE_LABEL,
  useLandingBundle,
  persistAudienceAttribution,
  type AudienceKey,
} from "@/lib/landing-pages";
import { whatsappLink } from "@/lib/whatsapp";
import { trackEvent, trackCustom } from "@/lib/meta-pixel";
import { cn } from "@/lib/utils";
import { MessageCircle, ShieldCheck, Truck, Star } from "lucide-react";

const KNOWN = new Set<string>(AUDIENCE_KEYS);

export const Route = createFileRoute("/landing/$audience")({
  beforeLoad: ({ params }) => {
    if (!KNOWN.has(params.audience)) throw notFound();
  },
  head: ({ params }) => {
    const label = AUDIENCE_LABEL[params.audience as AudienceKey]?.en ?? params.audience;
    const title = `${label} Posters — BRWAZWNEON`;
    const description = `Shop premium framed ${label.toLowerCase()} posters. Fast delivery across Egypt.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
      ],
    };
  },
  component: LandingPage,
});

function LandingPage() {
  const { audience } = Route.useParams();
  const { data, isLoading } = useLandingBundle(audience);
  const [visibleCount, setVisibleCount] = useState(12);

  // Attribution + Meta Pixel events on mount
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
    } catch { /* noop */ }
  }, [audience]);

  const page = data?.page;
  const posters = data?.posters ?? [];
  const shown = useMemo(() => posters.slice(0, visibleCount), [posters, visibleCount]);

  if (isLoading) {
    return <div className="container-page py-20 text-center text-muted-foreground">Loading…</div>;
  }

  if (!page) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="text-display text-4xl">Landing page unavailable</h1>
        <p className="mt-3 text-muted-foreground">This campaign page is currently hidden.</p>
        <Link to="/" className="mt-6 inline-block rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent">Home</Link>
      </div>
    );
  }

  const titleAr = page.title_ar || AUDIENCE_LABEL[audience as AudienceKey]?.ar;
  const titleEn = page.title_en || AUDIENCE_LABEL[audience as AudienceKey]?.en;
  const subtitleAr = page.subtitle_ar || "";
  const subtitleEn = page.subtitle_en || "";
  const cta = page.cta_text || "اطلب عبر واتساب";
  const wa = whatsappLink(page.whatsapp_message || `أهلًا، مهتم ببوسترات ${titleAr || audience}.`);

  const onWaClick = () => {
    try {
      trackEvent("Contact", { method: "whatsapp", audience_type: audience, landing_page: `/landing/${audience}` });
      trackEvent("Lead", { method: "whatsapp", audience_type: audience, landing_page: `/landing/${audience}` });
      trackCustom("WhatsAppClick", { audience_type: audience, landing_page: `/landing/${audience}` });
    } catch { /* noop */ }
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        {page.hero_image && (
          <div className="absolute inset-0 opacity-30">
            <img src={page.hero_image} alt="" loading="eager" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/40" />
          </div>
        )}
        <div className="container-page relative py-14 md:py-20 text-center">
          <div className="text-xs uppercase tracking-[0.4em] text-primary">{titleEn}</div>
          <h1 className="mt-3 text-display text-4xl md:text-6xl" dir="rtl">{titleAr}</h1>
          {subtitleAr && <p className="mt-4 text-muted-foreground max-w-2xl mx-auto" dir="rtl">{subtitleAr}</p>}
          {subtitleEn && <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{subtitleEn}</p>}
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onWaClick}
            className="mt-8 inline-flex items-center gap-2 rounded-sm bg-[#25D366] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:scale-[1.02] transition"
          >
            <MessageCircle className="h-4 w-4" /> {cta}
          </a>

          <div className="mt-6 flex flex-wrap justify-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> ضمان الجودة</span>
            <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" /> شحن لكل مصر</span>
            <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" /> تقييمات عملاء ممتازة</span>
          </div>
        </div>
      </section>

      {/* Posters Grid */}
      <section className="container-page py-10">
        {posters.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">لا توجد صور مضافة لهذه الصفحة بعد.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((p) => (
                <Link
                  key={p.id}
                  to="/category/$slug"
                  params={{ slug: audience }}
                  className="group relative overflow-hidden rounded-sm border border-border bg-card"
                  onClick={() => {
                    try {
                      trackEvent("ViewContent", {
                        content_ids: [p.id],
                        content_name: p.title,
                        audience_type: audience,
                        landing_page: `/landing/${audience}`,
                      });
                    } catch { /* noop */ }
                  }}
                >
                  <div className="aspect-[2/3] overflow-hidden">
                    <FramePreview
                      posterUrl={p.image_url ?? ""}
                      title={p.title}
                      aspectClassName="aspect-[2/3]"
                      bare
                      loading="lazy"
                      className={cn("h-full w-full transition group-hover:scale-[1.02]")}
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
                  </div>
                </Link>
              ))}
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
          </>
        )}
      </section>

      {/* Bottom WhatsApp CTA */}
      <section className="container-page pb-16 pt-2">
        <div className="rounded-sm border border-border bg-accent/30 p-6 text-center">
          <div className="text-display text-2xl" dir="rtl">جاهز تطلب؟</div>
          <p className="mt-2 text-sm text-muted-foreground" dir="rtl">تواصل معنا مباشرة على واتساب لتحديد المقاس والبرواز.</p>
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
    </div>
  );
}