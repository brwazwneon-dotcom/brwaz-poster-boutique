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
import i18n, { i18nInitPromise } from "@/lib/i18n";
import { getRouterI18n } from "@/lib/request-i18n";

import appCss from "../styles.css?url";
import { logSystemEvent } from "../lib/error-logger";
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
import {
  buildThemeOverrideCss,
  loadPublishedThemeSettings,
  type ThemeMode,
} from "@/lib/theme-system";

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
    __BRWAZ_BUILD_ID__?: string;
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
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {t("errors.pageNotFound", { defaultValue: "Page not found" })}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("errors.pageNotFoundMessage", {
            defaultValue: "The page you're looking for doesn't exist or has been moved.",
          })}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("errors.goHome", { defaultValue: "Go home" })}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error: rawError, reset }: { error: unknown; reset: () => void }) {
  const error = rawError instanceof Error ? rawError : new Error(String(rawError));
  console.error(error);
  const router = useRouter();
  const { t } = useTranslation();
  useEffect(() => {
    logSystemEvent({
      level: "error",
      source: "react_error_boundary",
      category: "tanstack_root_error_component",
      message: error.message || "Unhandled render error",
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("errors.pageError", { defaultValue: "This page didn't load" })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("errors.pageErrorMessage", {
            defaultValue:
              "Something went wrong on our end. You can try refreshing or head back home.",
          })}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common.tryAgain", { defaultValue: "Try again" })}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("errors.goHome", { defaultValue: "Go home" })}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    // Must resolve before anything renders — see i18n.ts's comment on
    // i18nInitPromise for why an unawaited init caused SSR and the
    // client's first hydration pass to render two different languages.
    const [settings] = await Promise.all([loadPublishedThemeSettings(), i18nInitPromise]);
    return {
      themeMode: settings.mode as ThemeMode,
      // "" when nothing has been customized — the page then renders with
      // zero extra markup, byte-identical to the plain stylesheet.
      themeOverrideCss: buildThemeOverrideCss(settings),
      // null when no admin override is set for that mode — SiteHeader then
      // falls back to the site's normal branding.ts logo, unchanged.
      themeLogoLight: settings.logos.light ?? null,
      themeLogoDark: settings.logos.dark ?? null,
    };
  },
  head: ({ loaderData }) => ({
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
      // "system" defaults to the dark browser-chrome tint, matching :root's
      // default-dark palette — the OS-resolved color a moment later (see
      // ThemeBoot) isn't worth a second SSR round-trip just for this.
      { name: "theme-color", content: loaderData?.themeMode === "light" ? "#ffffff" : "#000000" },
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
      { rel: "preconnect", href: import.meta.env.VITE_SUPABASE_URL || "" },
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
        // Only fires when the published website theme mode is "System" (SSR
        // deliberately leaves data-theme unset in that case, since the server
        // doesn't know the visitor's OS preference). Runs synchronously before
        // paint, so there's no flash — light/dark modes are already rendered
        // straight into <html data-theme> server-side and this script no-ops.
        children: `(function(){try{var r=document.documentElement;if(r.getAttribute('data-theme'))return;var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;r.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`,
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
  const router = useRouter();
  // The language instance for this request (per-request on the server), so
  // everything below renders in the visitor's language from the first byte.
  return (
    <I18nextProvider i18n={getRouterI18n(router, i18n)}>
      <RootHtml>{children}</RootHtml>
    </I18nextProvider>
  );
}

function RootHtml({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
  const { themeMode, themeOverrideCss } = Route.useLoaderData();
  // "system" is intentionally omitted here — the visitor's OS preference
  // decides, resolved by the inline script above (or, pre-JS, by the
  // `html:not([data-theme])` prefers-color-scheme fallback in styles.css).
  // suppressHydrationWarning is required for that: the script sets this
  // attribute directly on the live DOM before hydration runs, so the
  // client's first render legitimately disagrees with the SSR markup for
  // this one attribute — without it, React "fixes" the mismatch by
  // deleting the attribute the script just set, undoing system-mode
  // resolution right after paint.
  const resolvedTheme = themeMode === "system" ? undefined : themeMode;
  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      data-build-id={__BUILD_ID__}
      data-theme={resolvedTheme}
      // Both this attribute and the inline theme-preview bootstrap script
      // (in this route's own head scripts, above — sets data-site-theme
      // and inline custom-property style) mutate <html> directly before
      // React hydrates, intentionally, so the resolved/previewed theme
      // paints with no flash. React has no way to know those out-of-band
      // DOM writes are expected, so it always flags <html> itself as
      // mismatched; suppressHydrationWarning tells it that's fine for
      // this element specifically, without silencing mismatches in its
      // children.
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        {/* Admin-customized token overrides, rendered server-side (or "" ->
            nothing) so there is no flash and no customization means no extra
            markup at all. Placed after HeadContent so it sits after the
            compiled stylesheet <link> in source order and wins the cascade
            — same technique as chart.tsx's per-instance CSS variables. */}
        {themeOverrideCss && (
          <style id="brw-theme-overrides" dangerouslySetInnerHTML={{ __html: themeOverrideCss }} />
        )}
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
  const { themeMode, themeLogoLight, themeLogoDark } = Route.useLoaderData();
  const router = useRouter();
  const location = router.state.location;
  const pathname = location.pathname;
  const locationHref = location.href;
  const isAdmin = pathname.startsWith("/admin");
  useLanguage();

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__BRWAZ_BUILD_ID__ = __BUILD_ID__;
    }
  }, []);

  return (
    <I18nextProvider i18n={getRouterI18n(router, i18n)}>
      <QueryClientProvider client={queryClient}>
        <CartProvider>
          <WishlistProvider>
            <RecentlyViewedProvider>
              <MaintenanceGate>
                <div className="flex min-h-screen flex-col">
                  <AnnouncementBar />
                  <SiteHeader
                    themeMode={themeMode}
                    logoLight={themeLogoLight}
                    logoDark={themeLogoDark}
                  />
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
              <TikTokPixelBoot currentPage={locationHref} disabled={isAdmin} />
              <PreviewBadge />
              <ThemeBoot publishedMode={themeMode} />
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

function TikTokPixelBoot({ currentPage, disabled }: { currentPage: string; disabled: boolean }) {
  const lastTikTokPageRef = useRef<string | null>(null);
  useEffect(() => {
    // Admin traffic must never reach the ad pixel (same rule as MarketingBoot).
    if (disabled) return;
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
  }, [currentPage, disabled]);
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
