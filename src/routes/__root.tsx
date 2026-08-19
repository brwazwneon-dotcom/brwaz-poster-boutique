declare const __BUILD_ID__: string;

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import i18n from "@/lib/i18n";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nextProvider, useTranslation } from "react-i18next";
import { useLanguage } from "@/hooks/useLanguage";
import { CartProvider } from "@/lib/cart";
import { WishlistProvider } from "@/lib/wishlist";
import { RecentlyViewedProvider } from "@/lib/recently-viewed";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FloatingOfferBubble } from "@/components/FloatingOfferBubble";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { Toaster } from "@/components/ui/sonner";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { PreviewBadge } from "@/components/PreviewBadge";
import { SalesNotifications } from "@/components/SocialProof";
import { TestModeBadge } from "@/components/TestModeBadge";
import { AppPreloader } from "@/components/AppPreloader";
import { FloatingActions } from "@/components/FloatingActions";
import { ThemeBoot } from "@/components/ThemeBoot";
import { ThemePreviewBanner } from "@/components/ThemePreviewBanner";
import { usePerformanceFlags } from "@/lib/performance-flags";

const SITE_URL = "https://brwazwneon.com";
const TIKTOK_PIXEL_ID = "D9E35TRC77UDPAPRP140";

declare global {
  interface Window {
    ttq?: {
      page?: () => void;
      load?: (pixelId: string) => void;
      [key: string]: unknown;
    };
    __brwz_tiktok_pixel_loaded?: boolean;
  }
}

const TIKTOK_PIXEL_BOOTSTRAP = `
!function(w,d,t){
if(w.__brwz_tiktok_pixel_loaded)return;
w.__brwz_tiktok_pixel_loaded=true;
w.TiktokAnalyticsObject=t;
var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){var e=ttq._i[t]||[];for(var n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};if(d.getElementById("tiktok-pixel-sdk"))return;var a=d.createElement("script");a.type="text/javascript";a.async=true;a.id="tiktok-pixel-sdk";a.src=r+"?sdkid="+e+"&lib="+t;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(a,s)};
}(window,document,"ttq");`;

const AssistantButton = lazy(() =>
  import("@/components/AssistantButton").then((m) => ({ default: m.AssistantButton })),
);
const MarketingBootLazy = lazy(() =>
  import("@/components/MarketingBoot").then((m) => ({ default: m.MarketingBoot })),
);
const PwaBootLazy = lazy(() =>
  import("@/components/PwaBoot").then((m) => ({ default: m.PwaBoot })),
);
const BehaviorBootLazy = lazy(() =>
  import("@/components/BehaviorBoot").then((m) => ({ default: m.BehaviorBoot })),
);
const ErrorLoggerBootLazy = lazy(() =>
  import("@/components/ErrorLoggerBoot").then((m) => ({ default: m.ErrorLoggerBoot })),
);

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BRWAZWNEON — Premium Framed Posters & Custom Design | Egypt" },
      {
        name: "description",
        content:
          "Movie, football, anime, car & TV series posters — framed and delivered across Egypt. Cash on delivery.",
      },
      { property: "og:title", content: "BRWAZWNEON — Premium Framed Posters" },
      {
        property: "og:description",
        content:
          "Movie, football, anime, car & TV series posters — framed and delivered across Egypt. Cash on delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "BRWAZWNEON — Premium Framed Posters" },
      {
        name: "twitter:description",
        content:
          "Movie, football, anime, car & TV series posters — framed and delivered across Egypt. Cash on delivery.",
      },
      {
        property: "og:image",
        content: `${SITE_URL}/icon-512.png`,
      },
      {
        name: "twitter:image",
        content: `${SITE_URL}/icon-512.png`,
      },
      { name: "theme-color", content: "#000000" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "BRWAZWNEON" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: `${SITE_URL}/manifest.webmanifest` },
      { rel: "apple-touch-icon", href: `${SITE_URL}/apple-touch-icon.png` },
      { rel: "icon", type: "image/png", sizes: "32x32", href: `${SITE_URL}/favicon-32.png` },
      { rel: "icon", type: "image/png", sizes: "192x192", href: `${SITE_URL}/icon-192.png` },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://volrlqjrsxemhjwrnpun.supabase.co" },
      { rel: "dns-prefetch", href: "https://analytics.tiktok.com" },
      { rel: "dns-prefetch", href: "https://connect.facebook.net" },
      { rel: "dns-prefetch", href: "https://www.googletagmanager.com" },
      { rel: "dns-prefetch", href: "https://ipapi.co" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700;800&family=Bebas+Neue&family=Inter:wght@400;600&display=swap",
      },
    ],
    scripts: [
      {
        children: `(function(){try{var s=sessionStorage.getItem('brw_theme_settings')||localStorage.getItem('brw_theme_settings');var id=sessionStorage.getItem('brw_theme_preview')||localStorage.getItem('brw_active_theme');if(!s)return;var vars=JSON.parse(s);var root=document.documentElement;if(id){root.dataset.siteTheme=id;root.dataset.theme=id;}Object.keys(vars).forEach(function(k){root.style.setProperty(k,vars[k]);});}catch(e){}})();`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SITE_URL}/#org`,
              name: "BRWAZWNEON",
              url: SITE_URL,
              logo: `${SITE_URL}/icon-512.png`,
              areaServed: "EG",
              address: {
                "@type": "PostalAddress",
                addressLocality: "Alexandria",
                addressCountry: "EG",
              },
            },
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              url: SITE_URL,
              name: "BRWAZWNEON",
              publisher: { "@id": `${SITE_URL}/#org` },
              potentialAction: {
                "@type": "SearchAction",
                target: `${SITE_URL}/search?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} data-build-id={__BUILD_ID__}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const location = router.state.location;
  const pathname = location.pathname;
  const locationHref = location.href;
  const isAdmin = pathname.startsWith("/admin");
  useLanguage();

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as Record<string, unknown>).__BRWAZ_BUILD_ID__ = __BUILD_ID__;
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <CartProvider>
          <WishlistProvider>
            <RecentlyViewedProvider>
              <MaintenanceGate>
                <div className="flex min-h-screen flex-col">
                  <AnnouncementBar />
                  <SiteHeader />
                  <main className="flex-1">
                    <Outlet />
                  </main>
                  <SiteFooter />
                </div>
                {!isAdmin && <FloatingActionsGated />}
                {!isAdmin && <FloatingOfferGated />}
                <AssistantButtonGated isAdmin={isAdmin} />
              </MaintenanceGate>
              <Toaster richColors position="top-center" />
              <IdleBoots />
              <TikTokPixelBoot currentPage={locationHref} />
              <PreviewBadge />
              <ThemeBoot />
              <ThemePreviewBanner />
              <SocialProofGated isAdmin={isAdmin} />
              <TestModeBadge />
              <PreloaderGated />
            </RecentlyViewedProvider>
          </WishlistProvider>
        </CartProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

function TikTokPixelBoot({ currentPage }: { currentPage: string }) {
  const lastTikTokPageRef = useRef<string | null>(null);
  useEffect(() => {
    const load = () => {
      if (!window.__brwz_tiktok_pixel_loaded) {
        try {
          new Function(TIKTOK_PIXEL_BOOTSTRAP)();
        } catch {
          return;
        }
      }
      window.ttq?.load?.(TIKTOK_PIXEL_ID);
      if (lastTikTokPageRef.current !== currentPage) {
        lastTikTokPageRef.current = currentPage;
        window.ttq?.page?.();
      }
    };
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(load, { timeout: 4000 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(load, 2500);
    return () => window.clearTimeout(id);
  }, [currentPage]);
  return null;
}

function useIdleReady(timeout = 2500) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const run = () => setReady(true);
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(run, { timeout });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(run, Math.min(timeout, 1500));
    return () => window.clearTimeout(id);
  }, [timeout]);
  return ready;
}

function IdleBoots() {
  const ready = useIdleReady(3500);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <MarketingBootLazy />
      <PwaBootLazy />
      <ErrorLoggerBootLazy />
      <BehaviorBootLazy />
    </Suspense>
  );
}

function PreloaderGated() {
  const perf = usePerformanceFlags();
  if (perf.disable_preloader) return null;
  return <AppPreloader />;
}

function SocialProofGated({ isAdmin }: { isAdmin: boolean }) {
  const perf = usePerformanceFlags();
  if (isAdmin || perf.disable_social_proof) return null;
  return <SalesNotifications />;
}

function FloatingActionsGated() {
  return <FloatingActions />;
}

function FloatingOfferGated() {
  const perf = usePerformanceFlags();
  if (perf.disable_floating_offer || !perf.offers_enabled) return null;
  return <FloatingOfferBubble />;
}

function AssistantButtonGated({ isAdmin }: { isAdmin: boolean }) {
  const perf = usePerformanceFlags();
  if (isAdmin || perf.emergency_fast_mode || !perf.assistant_enabled) return null;
  return (
    <Suspense fallback={null}>
      <AssistantButton />
    </Suspense>
  );
}
