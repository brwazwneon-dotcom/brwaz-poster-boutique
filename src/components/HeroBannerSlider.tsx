import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useHeroBanners, useHeroBannerConfig, type HeroBanner } from "@/lib/hero-banners";
import { useActiveAutoplay } from "@/hooks/use-active-autoplay";

async function logHeroImageFailure(banner: HeroBanner, url: string) {
  let status: number | "network_error" | "unknown" = "unknown";
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    status = res.status;
  } catch {
    status = "network_error";
  }

  try {
    const w = window as unknown as {
      __heroBannerImageIssues?: Array<{
        id: string;
        url: string;
        status: typeof status;
        at: number;
      }>;
    };
    w.__heroBannerImageIssues = (w.__heroBannerImageIssues ?? []).slice(-30);
    w.__heroBannerImageIssues.push({ id: banner.id, url, status, at: Date.now() });
  } catch {
    /* noop */
  }

  if (import.meta.env.DEV) {
    console.warn("[HeroBanner] image failed", { id: banner.id, url, status });
  }
}

/**
 * Full-bleed advertising slider that sits BEHIND the hero content.
 * Renders nothing when no banners are configured (parent falls back to default hero bg).
 */
export function HeroBannerSlider({ fallback }: { fallback: React.ReactNode }) {
  const { data: banners = [] } = useHeroBanners();
  const { data: cfg } = useHeroBannerConfig();
  const autoplay = cfg?.autoplay_ms ?? 5000;
  const overlay = cfg?.overlay_opacity ?? 0.55;

  const [idx, setIdx] = useState(0);
  const [failedIds, setFailedIds] = useState<Record<string, true>>({});
  const touchX = useRef<number | null>(null);
  const loggedFailures = useRef<Set<string>>(new Set());
  const [sliderRef, autoplayActive] = useActiveAutoplay<HTMLDivElement>();

  const validBanners = useMemo(
    () => banners.filter((b) => !failedIds[b.id] && Boolean(b.src || b.image_url)),
    [banners, failedIds],
  );

  useEffect(() => {
    setIdx(0);
    setFailedIds({});
    loggedFailures.current.clear();
  }, [banners]);

  useEffect(() => {
    if (idx >= validBanners.length) setIdx(0);
  }, [idx, validBanners.length]);

  useEffect(() => {
    if (!autoplayActive || validBanners.length < 2) return;
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % validBanners.length),
      Math.max(1500, autoplay),
    );
    return () => window.clearInterval(id);
  }, [autoplay, autoplayActive, validBanners.length]);

  useEffect(() => {
    if (!autoplayActive || validBanners.length < 2) return;
    const next = validBanners[(idx + 1) % validBanners.length];
    const src =
      next?.mobileSrc && window.matchMedia("(max-width: 640px)").matches
        ? next.mobileSrc
        : next?.src;
    if (!src) return;
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }, [autoplayActive, idx, validBanners]);

  if (validBanners.length === 0) return <>{fallback}</>;

  const go = (n: number) => setIdx((n + validBanners.length) % validBanners.length);
  const current: HeroBanner | undefined = validBanners[idx];

  const markFailed = (banner: HeroBanner, url: string) => {
    setFailedIds((prev) => ({ ...prev, [banner.id]: true }));
    const key = `${banner.id}:${url}`;
    if (loggedFailures.current.has(key)) return;
    loggedFailures.current.add(key);
    void logHeroImageFailure(banner, url);
  };

  return (
    <div
      ref={sliderRef}
      data-slider-version="homepage-slider-v2"
      data-enabled-slide-count={validBanners.length}
      className="absolute inset-0 -z-10"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      {validBanners.map((b, i) => {
        const src = b.src || b.image_url;
        const objectPosition =
          typeof b.focal_x === "number" && typeof b.focal_y === "number"
            ? `${b.focal_x}% ${b.focal_y}%`
            : "center";
        return (
          <div
            key={b.id}
            data-slide-id={b.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${
              i === idx ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={i !== idx}
          >
            <picture className="contents">
              {b.mobileSrc ? <source media="(max-width: 640px)" srcSet={b.mobileSrc} /> : null}
              {b.avifSrcSet ? (
                <source type="image/avif" srcSet={b.avifSrcSet} sizes={b.sizes ?? "100vw"} />
              ) : null}
              {b.webpSrcSet ? (
                <source type="image/webp" srcSet={b.webpSrcSet} sizes={b.sizes ?? "100vw"} />
              ) : null}
              <img
                src={src}
                sizes={b.sizes ?? "100vw"}
                alt={b.alt_text ?? b.title ?? ""}
                className="h-full w-full object-cover"
                style={{ objectPosition }}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "auto"}
                decoding="async"
                onError={(e) => markFailed(b, e.currentTarget.currentSrc || src)}
              />
            </picture>
          </div>
        );
      })}

      {/* Dark overlay for readability */}
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: Math.max(0, Math.min(1, overlay)) }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background" />

      {/* Optional per-banner CTA badge, top-right, out of the way of header/wishlist/cart */}
      {current && (current.title || current.subtitle || current.button_text) && (
        <div className="pointer-events-none absolute right-4 top-24 z-10 hidden max-w-xs rounded-sm border border-white/15 bg-black/55 p-4 backdrop-blur-sm sm:block">
          {current.title && (
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white">
              {current.title}
            </p>
          )}
          {current.subtitle && <p className="mt-1 text-[11px] text-white/80">{current.subtitle}</p>}
          {current.button_text && current.button_link && (
            <a
              href={current.button_link}
              className="pointer-events-auto mt-3 inline-flex rounded-sm border border-white/70 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white hover:bg-white/20"
            >
              {current.button_text}
            </a>
          )}
        </div>
      )}

      {validBanners.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(idx - 1)}
            aria-label="Previous banner"
            className="absolute left-3 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white opacity-70 backdrop-blur transition hover:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(idx + 1)}
            aria-label="Next banner"
            className="absolute right-3 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white opacity-70 backdrop-blur transition hover:opacity-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-1.5">
            {validBanners.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Go to banner ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-6 bg-white" : "w-1.5 bg-white/40"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
