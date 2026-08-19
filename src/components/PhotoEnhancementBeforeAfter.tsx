import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PORSCHE_AFTER_AVIF,
  PORSCHE_AFTER_WEBP,
  type PhotoEnhancementSettings,
  usePhotoEnhancementSettings,
} from "@/lib/photo-enhancement";

export function PhotoEnhancementBeforeAfter() {
  const settings = usePhotoEnhancementSettings();
  if (!settings.enabled) return null;
  return <PhotoEnhancementContent settings={settings} />;
}

export function PhotoEnhancementContent({
  settings,
  preview = false,
}: {
  settings: PhotoEnhancementSettings;
  preview?: boolean;
}) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language.startsWith("ar");
  const heading = isArabic ? settings.headingAr : "See the Difference Before You Print";
  const description = isArabic
    ? settings.descriptionAr
    : "Compare your original image with our professionally enhanced print-ready version.";

  return (
    <section className="border-t border-border bg-card">
      <div className="container-page py-14 sm:py-20">
        <div
          className="grid items-center gap-10 lg:grid-cols-[1.35fr_0.9fr] lg:gap-12"
          dir={isArabic ? "rtl" : "ltr"}
        >
          <PhotoEnhancementComparison settings={settings} isArabic={isArabic} preview={preview} />
          <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
            <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-muted-foreground">
              {isArabic ? "قبل وبعد" : "Before & After"}
            </p>
            <h2 className="mt-3 max-w-xl text-balance text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
              {heading}
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              {description}
            </p>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">
              {isArabic
                ? "تحسين احترافي للجودة والألوان مع الحفاظ على تفاصيل الصورة الطبيعية."
                : "Natural enhancement, sharper details, richer colors and premium print quality."}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={settings.primaryCtaHref}
                className="inline-flex min-h-12 items-center justify-center rounded-sm bg-primary px-6 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                {isArabic ? "حسّن صورتك الآن" : "Enhance Your Photo"}
              </a>
              <a
                href={settings.secondaryCtaHref}
                className="inline-flex min-h-12 items-center justify-center rounded-sm border border-foreground px-6 text-xs font-semibold uppercase tracking-widest text-foreground transition hover:bg-muted"
              >
                {isArabic ? "اطبع صورتك" : "Print Your Photo"}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PhotoEnhancementComparison({
  settings,
  isArabic,
  preview = false,
}: {
  settings: PhotoEnhancementSettings;
  isArabic: boolean;
  preview?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const interacted = useRef(preview);
  const [position, setPosition] = useState(settings.initialSlider);

  useEffect(() => {
    setPosition(settings.initialSlider);
  }, [settings.initialSlider]);

  useEffect(() => {
    if (preview || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || interacted.current) return;
        observer.disconnect();
        setPosition(45);
        timers.current = [
          window.setTimeout(() => !interacted.current && setPosition(60), 500),
          window.setTimeout(() => !interacted.current && setPosition(50), 1100),
        ];
      },
      { threshold: 0.35 },
    );
    const element = ref.current;
    if (element) observer.observe(element);
    return () => {
      observer.disconnect();
      timers.current.forEach(window.clearTimeout);
    };
  }, [preview]);

  const stopDemo = () => {
    interacted.current = true;
    timers.current.forEach(window.clearTimeout);
  };

  const setFromClientX = (clientX: number) => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const next = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setPosition(next));
  };

  const shift = (amount: number) =>
    setPosition((current) => Math.max(0, Math.min(100, current + amount)));
  const ratio = settings.afterAspectRatio || 4 / 3;
  const beforeLabel = isArabic ? "قبل" : "Before";
  const afterLabel = isArabic ? "بعد" : "After";
  const beforeLayerStyle = { clipPath: `inset(0 ${100 - position}% 0 0)` };
  const beforeLabelClass = isArabic ? "right-3" : "left-3";
  const afterLabelClass = isArabic ? "left-3" : "right-3";

  return (
    <div
      ref={ref}
      className="relative w-full touch-none select-none overflow-hidden rounded-xl border border-border bg-muted shadow-[var(--shadow-card,0_8px_30px_rgba(0,0,0,0.07))]"
      style={{ aspectRatio: String(ratio) }}
      onPointerDown={(event) => {
        stopDemo();
        event.currentTarget.setPointerCapture(event.pointerId);
        setFromClientX(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) setFromClientX(event.clientX);
      }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
    >
      <PorschePhoto
        src={PORSCHE_AFTER_WEBP}
        avifSrc={PORSCHE_AFTER_AVIF}
        enhanced
        ariaLabel={isArabic ? "صورة بورشه بعد التحسين" : "Enhanced Porsche photo"}
      />
      <span
        className={`pointer-events-none absolute top-3 z-[6] rounded-full border border-border/70 bg-background/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground shadow-sm ${afterLabelClass}`}
      >
        {afterLabel}
      </span>
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={beforeLayerStyle}
      >
        <PorschePhoto
          src={PORSCHE_AFTER_WEBP}
          avifSrc={PORSCHE_AFTER_AVIF}
          ariaLabel={isArabic ? "صورة بورشه الأصلية" : "Original Porsche photo"}
        />
      </div>
      <span
        className={`pointer-events-none absolute top-3 z-[7] rounded-full border border-border/70 bg-background/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground shadow-sm ${beforeLabelClass}`}
      >
        {beforeLabel}
      </span>

      <div
        className="pointer-events-none absolute inset-y-0 z-10 w-px bg-primary-foreground/90 shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
        style={{ left: `${position}%` }}
      >
        <div className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-primary text-primary-foreground shadow-lg">
          <span aria-hidden className="text-sm tracking-[-0.3em]">
            ‹ ›
          </span>
        </div>
      </div>
      <button
        type="button"
        role="slider"
        aria-label={isArabic ? "مقارنة الصورة قبل وبعد التحسين" : "Photo enhancement comparison"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        onFocus={stopDemo}
        onKeyDown={(event) => {
          stopDemo();
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            shift(-5);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            shift(5);
          }
          if (event.key === "Home") {
            event.preventDefault();
            setPosition(0);
          }
          if (event.key === "End") {
            event.preventDefault();
            setPosition(100);
          }
        }}
        className="absolute inset-y-0 z-20 w-11 -translate-x-1/2 cursor-ew-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ left: `${position}%` }}
      >
        <span className="sr-only">{isArabic ? "حرّك للمقارنة" : "Move to compare"}</span>
      </button>
    </div>
  );
}

function PorschePhoto({
  src,
  avifSrc,
  enhanced = false,
  ariaLabel,
}: {
  src: string;
  avifSrc?: string;
  enhanced?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="absolute inset-0 overflow-hidden bg-[#0b0d10]"
    >
      <picture className="contents">
        {avifSrc ? <source srcSet={avifSrc} type="image/avif" /> : null}
        <img
          src={src}
          alt=""
          width={1200}
          height={675}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
          style={{
            filter: enhanced
              ? "contrast(1.09) saturate(1.07) brightness(0.99)"
              : "contrast(0.9) saturate(0.86) brightness(0.98) blur(0.25px)",
          }}
        />
      </picture>
      <div
        className={`pointer-events-none absolute inset-0 ${
          enhanced
            ? "bg-[radial-gradient(circle_at_58%_45%,transparent_28%,rgba(0,0,0,0.22)_100%)]"
            : "bg-[linear-gradient(rgba(245,240,232,0.06),rgba(15,18,22,0.1))]"
        }`}
      />
    </div>
  );
}
