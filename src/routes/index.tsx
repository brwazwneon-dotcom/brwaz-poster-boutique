import { Link, createFileRoute } from "@tanstack/react-router";
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import hero from "@/assets/hero.jpg";
import { HeroBannerSlider } from "@/components/HeroBannerSlider";
import { HomepageSlider } from "@/components/HomeSlider";
import { useHomeSections, type HomeSectionConfig } from "@/lib/homepage-sections";
import { LazyOnView } from "@/components/LazyOnView";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { Printer } from "lucide-react";

const CustomerReviews = lazy(() =>
  import("@/components/CustomerReviews").then((module) => ({ default: module.CustomerReviews })),
);
const ShopByCollection = lazy(() =>
  import("@/components/ShopByCollection").then((module) => ({
    default: module.ShopByCollection,
  })),
);
const BestSellers = lazy(() =>
  import("@/components/BestSellers").then((module) => ({ default: module.BestSellers })),
);
const TrustedQuality = lazy(() =>
  import("@/components/TrustedQuality").then((module) => ({ default: module.TrustedQuality })),
);
const TrendingNow = lazy(() =>
  import("@/components/TrendingNow").then((module) => ({ default: module.TrendingNow })),
);
const RoomTransformation = lazy(() =>
  import("@/components/RoomTransformation").then((module) => ({
    default: module.RoomTransformation,
  })),
);
const WallOfInspiration = lazy(() =>
  import("@/components/WallOfInspiration").then((module) => ({
    default: module.WallOfInspiration,
  })),
);
const PhotoEnhancementBeforeAfter = lazy(() =>
  import("@/components/PhotoEnhancementBeforeAfter").then((module) => ({
    default: module.PhotoEnhancementBeforeAfter,
  })),
);
const StorefrontFAQ = lazy(() =>
  import("@/components/StorefrontFAQ").then((module) => ({ default: module.StorefrontFAQ })),
);
const Highlights = lazy(() =>
  import("@/components/Highlights").then((module) => ({ default: module.Highlights })),
);
const FrameSetsHome = lazy(() =>
  import("@/components/FrameSetsHome").then((module) => ({ default: module.FrameSetsHome })),
);
const PersonalizedSections = lazy(() =>
  import("@/components/PersonalizedSections").then((module) => ({
    default: module.PersonalizedSections,
  })),
);
const BeforeAfter = lazy(() =>
  import("@/components/BeforeAfter").then((module) => ({ default: module.BeforeAfter })),
);
const CategoryGrids = lazy(() =>
  import("@/components/CategoryGrids").then((module) => ({ default: module.CategoryGrids })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BRWAZWNEON — Premium Framed Posters & Custom Design | مصر" },
      {
        name: "description",
        content:
          "BRWAZWNEON: Premium framed posters, custom design & photo printing. Cash on delivery across Egypt. Football, movies, anime & more.",
      },
      { property: "og:title", content: "BRWAZWNEON — Turn Your Room Into A Piece Of Art" },
      { property: "og:description", content: "Premium framed posters delivered across Egypt." },
      { property: "og:url", content: "https://brwazwneon.com/" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://brwazwneon.com/" },
      { rel: "preload", as: "image", href: hero, fetchPriority: "high" },
    ],
  }),
  component: Index,
});

function Index() {
  const perf = usePerformanceFlags();
  const sections = useHomeSections();
  const { i18n } = useTranslation();
  const isArabic = i18n.language.startsWith("ar");

  const resolveTitle = (s: HomeSectionConfig) =>
    (isArabic ? s.title_ar : s.title_en) || s.title || undefined;
  const resolveSubtitle = (s: HomeSectionConfig) =>
    (isArabic ? s.subtitle_ar : s.subtitle_en) || s.subtitle || undefined;

  const RENDERERS: Record<string, (s: HomeSectionConfig) => ReactNode> = {
    homepage_slider: () => <HomepageSlider key="homepage_slider" />,
    hero_banners: () => <HeroBannerSection key="hero_banners" />,
    "best-sellers": (s) => (
      <BestSellers key="best-sellers" title={resolveTitle(s)} subtitle={resolveSubtitle(s)} />
    ),
    "trending-now": (s) => (
      <TrendingNow
        key="trending-now"
        title={resolveTitle(s)}
        subtitle={resolveSubtitle(s)}
        itemsCount={s.items_count ?? 12}
        manualIds={s.source_type === "manual" ? s.manual_ids : undefined}
      />
    ),
    collections: () => <ShopByCollection key="collections" />,
    "custom-design": () => <CustomDesignSection key="custom-design" />,
    "photo-enhancement": () => <PhotoEnhancementBeforeAfter key="photo-enhancement" />,
    reviews: () => <CustomerReviews key="reviews" />,
    "how-it-works": () => <HowItWorksSection key="how-it-works" />,
    "trusted-quality": () => <TrustedQuality key="trusted-quality" />,
    "quality-section": () => <QualitySection key="quality-section" />,
    faq: () => <StorefrontFAQ key="faq" />,
    highlights: () => <Highlights key="highlights" />,
    "frame-sets": (s) => (
      <FrameSetsHome key="frame-sets" title={resolveTitle(s)} subtitle={resolveSubtitle(s)} />
    ),
    "before-after": () => <BeforeAfter key="before-after" location="homepage" />,
    "recently-viewed": () => <PersonalizedSections key="recently-viewed" />,
    "for-you": () => <PersonalizedSections key="for-you" />,
    "because-you-liked": () => <PersonalizedSections key="because-you-liked" />,
    "recommended-for-you": () => <PersonalizedSections key="recommended-for-you" />,
    "wall-of-inspiration": () => <WallOfInspiration key="wall-of-inspiration" />,
    "room-transformation": () => <RoomTransformation key="room-transformation" />,
    categories: (s) => (
      <CategoryGrids
        key="categories"
        title={resolveTitle(s)}
        subtitle={resolveSubtitle(s)}
        itemsCount={s.items_count ?? 8}
      />
    ),
  };

  const renderSection = (section: HomeSectionConfig) => {
    const renderer = RENDERERS[section.key];
    if (renderer) return renderer(section);
    if (section.custom && section.manual_ids?.length) {
      return (
        <TrendingNow
          key={section.key}
          title={resolveTitle(section)}
          subtitle={resolveSubtitle(section)}
          itemsCount={section.items_count ?? 8}
          manualIds={section.manual_ids}
        />
      );
    }
    return null;
  };

  return (
    <div className="bg-background text-foreground">
      {sections
        .filter((s) => s.enabled && s.visible !== false)
        .slice(0, perf.max_home_sections)
        .map((s, idx) => {
          const node = renderSection(s);
          if (!node) return null;
          const guarded = (
            <HomepageSectionBoundary key={`section-${s.id ?? s.key}`} sectionKey={s.key}>
              <Suspense fallback={<div className="min-h-80 bg-background" />}>{node}</Suspense>
            </HomepageSectionBoundary>
          );
          if (idx < 2 || s.key === "hero_banners") {
            return (
              <div key={`home-${s.id ?? s.key}`} id={`home-${s.key}`}>
                {guarded}
              </div>
            );
          }
          return (
            <div key={`lazy-${s.id ?? s.key}-${idx}`} id={`home-${s.key}`}>
              <LazyOnView minHeight={520}>{guarded}</LazyOnView>
            </div>
          );
        })}
    </div>
  );
}

class HomepageSectionBoundary extends Component<
  { sectionKey: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Homepage section failed: ${this.props.sectionKey}`, error, info);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function HeroBannerSection() {
  const { t } = useTranslation();
  return (
    <section
      data-hero-banner-section="true"
      className="relative isolate overflow-hidden border-b border-border"
    >
      <HeroBannerSlider
        fallback={
          <>
            <img
              src={hero}
              alt="Framed poster gallery wall"
              width={1600}
              height={1024}
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40 grayscale"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/50 via-background/80 to-background" />
          </>
        }
      />
      <div className="container-page flex min-h-[85vh] flex-col justify-end py-20">
        <div
          dir="rtl"
          className="max-w-3xl animate-in fade-in-0 slide-in-from-bottom-4 text-right duration-700 ease-out"
        >
          <h1 className="max-w-[11ch] text-balance text-5xl font-black leading-[1.05] tracking-tight             text-white drop-shadow-[0_3px_18px_rgba(0,0,0,0.55)] sm:text-7xl md:text-[6.75rem]">
            فن يعبّر عن شخصيتك
          </h1>
          <p className="mt-6 max-w-2xl text-sm leading-8 text-foreground/80 drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] sm:text-base sm:leading-9 md:text-lg">
            صمّم مساحتك بطريقتك مع آلاف التصاميم الحصرية، أو اطبع صورتك بأعلى جودة على خامات Premium
            تمنح كل جدار هوية مميزة.
          </p>
        </div>
        <div className="mt-10 flex flex-col items-start gap-6 sm:flex-row sm:flex-wrap sm:items-end">
          <Link
            to="/category/$slug"
            params={{ slug: "movies" }}
            className="w-full rounded-sm bg-primary px-8 py-4 text-center text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 sm:w-auto"
          >
            {t("home.shopNow")}
          </Link>

          <div className="flex w-full flex-col items-start sm:w-auto sm:items-center">
            <span className="mb-2 inline-flex items-center gap-1 rounded-sm border border-border bg-background/60 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.3em] text-foreground">
              ⭐ {t("common.featured")}
            </span>
            <Link
              to="/custom-design"
              onClick={(e) => {
                const el = document.getElementById("custom-design");
                if (el) {
                  e.preventDefault();
                  el.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className="group relative w-full overflow-hidden rounded-sm border border-white/70 bg-black px-10 py-5 text-center text-sm font-semibold uppercase tracking-widest text-white shadow-[0_0_0_rgba(255,255,255,0)] transition-all duration-[250ms] hover:-translate-y-0.5 hover:border-white hover:shadow-[0_0_28px_rgba(255,255,255,0.35)] sm:w-auto"
            >
              🎨 {t("customDesign.title")}
              <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 skew-x-12 bg-white/10 opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
            </Link>
            <p className="mt-3 max-w-xs text-[11px] leading-relaxed text-muted-foreground sm:text-center">
              {t("customDesign.subtitle")}
            </p>
          </div>

          <Link
            to="/photo-printing"
            className="hero-print-cta flex w-full select-none flex-col items-center justify-center px-10 py-5 text-center sm:w-auto"
          >
            <span className="hero-print-cta__kicker">{t("photoPrinting.ctaKicker")}</span>
            <span className="hero-print-cta__label text-base font-black uppercase tracking-widest text-neutral-900 rtl:tracking-normal sm:text-lg">
              <Printer
                strokeWidth={2.2}
                aria-hidden="true"
                className="size-6 shrink-0 text-neutral-900 sm:size-7"
              />
              <span>{t("photoPrinting.title")}</span>
            </span>
          </Link>
        </div>

        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs">
          {[t("nav.customDesign"), t("photoPrinting.title"), "Preview Before Printing"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span className="text-foreground">✔</span>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CustomDesignSection() {
  const { t } = useTranslation();
  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-20">
        <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
          {t("customDesign.title")}
        </p>
        <h2 className="text-display mt-3 text-4xl sm:text-6xl">{t("customDesign.heading")}</h2>
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{t("customDesign.subtitle")}</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          <div className="rounded-sm border border-border bg-card p-6">
            <div className="text-2xl">🎨</div>
            <h3 className="mt-3 text-sm font-semibold">{t("customDesign.step1Title")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("customDesign.step1Desc")}</p>
          </div>
          <div className="rounded-sm border border-border bg-card p-6">
            <div className="text-2xl">🖼️</div>
            <h3 className="mt-3 text-sm font-semibold">{t("customDesign.step2Title")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("customDesign.step2Desc")}</p>
          </div>
          <div className="rounded-sm border border-border bg-card p-6">
            <div className="text-2xl">🚚</div>
            <h3 className="mt-3 text-sm font-semibold">{t("customDesign.step3Title")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("customDesign.step3Desc")}</p>
          </div>
        </div>
        <Link
          to="/custom-design"
          className="mt-8 inline-flex rounded-sm bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90"
        >
          {t("customDesign.cta")} →
        </Link>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const { t } = useTranslation();
  const steps = [
    { icon: "🔍", title: t("howItWorks.step1Title"), desc: t("howItWorks.step1Desc") },
    { icon: "🖼️", title: t("howItWorks.step2Title"), desc: t("howItWorks.step2Desc") },
    { icon: "📦", title: t("howItWorks.step3Title"), desc: t("howItWorks.step3Desc") },
    { icon: "🚚", title: t("howItWorks.step4Title"), desc: t("howItWorks.step4Desc") },
  ];
  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-20 text-center">
        <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
          {t("howItWorks.label")}
        </p>
        <h2 className="text-display mt-3 text-4xl sm:text-6xl">{t("howItWorks.title")}</h2>
        <div className="mt-14 grid gap-8 sm:grid-cols-4">
          {steps.map((step, i) => (
            <div key={i}>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-card text-2xl shadow-sm ring-1 ring-border">
                {step.icon}
              </div>
              <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QualitySection() {
  const { t } = useTranslation();
  const items = [
    { icon: "📸", label: t("quality.millionPhotos") },
    { icon: "🖼️", label: t("quality.premiumFrames") },
    { icon: "📄", label: t("quality.fujifilmPaper") },
    { icon: "🎨", label: t("quality.proDesigner") },
    { icon: "🚚", label: t("home.fastDelivery") },
    { icon: "💳", label: t("checkout.cashOnDelivery") },
    { icon: "👁️", label: t("home.previewBeforePrinting") },
    { icon: "💬", label: t("nav.whatsapp") },
    { icon: "🔒", label: t("cart.secureCheckout") },
    { icon: "🇪🇬", label: t("quality.madeInEgypt") },
  ];
  return (
    <section className="border-t border-border bg-card">
      <div className="container-page py-20">
        <p className="text-center text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
          {t("quality.label")}
        </p>
        <h2 className="text-display mt-3 text-center text-4xl sm:text-6xl">{t("quality.title")}</h2>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-sm border border-border bg-background p-4"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs uppercase tracking-widest">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
