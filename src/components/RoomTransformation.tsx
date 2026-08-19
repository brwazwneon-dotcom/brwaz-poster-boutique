import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { SafeImage } from "@/components/SafeImage";
import {
  ROOM_CTA_DESTINATIONS,
  ROOM_FRAME_STYLES,
  ROOM_PRESETS,
  useRoomTransformationArtwork,
  useRoomTransformationSettings,
} from "@/lib/room-transformation";

export function RoomTransformation() {
  const { i18n } = useTranslation();
  const settings = useRoomTransformationSettings();
  const artworkQuery = useRoomTransformationArtwork(settings);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [near, setNear] = useState(false);
  const isAr = i18n.language?.startsWith("ar");

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: "420px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const update = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const next = clamp((0 - rect.top) / travel, 0, 1);
      setProgress((prev) => (Math.abs(prev - next) > 0.006 ? next : prev));
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [near]);

  const motion = useMemo(() => computeMotion(progress), [progress]);
  const room = ROOM_PRESETS[settings.roomPreset];
  const frameStyle = ROOM_FRAME_STYLES[settings.frameStyle];
  const artwork = artworkQuery.data;
  const cta = ROOM_CTA_DESTINATIONS[settings.ctaDestination];

  if (!settings.enabled) return null;

  const heading = isAr ? settings.headingAr : settings.headingEn;
  const subheading = isAr ? settings.subheadingAr : settings.subheadingEn;

  return (
    <section
      ref={sectionRef}
      className="room-transformation-section border-t border-border bg-background text-foreground"
      aria-labelledby="room-transformation-title"
      style={
        {
          "--room-wall": room.wall,
          "--frame-color": frameStyle.frame,
          "--frame-mat": frameStyle.mat,
          "--frame-border": frameStyle.border,
          "--room-light": motion.light,
          "--room-warmth": motion.warmth,
          "--room-object-position": room.objectPosition,
          "--room-mobile-object-position": room.mobileObjectPosition,
          "--wall-frame-left": room.frame.left,
          "--wall-frame-top": room.frame.top,
          "--wall-frame-width": room.frame.width,
          "--wall-frame-mobile-left": room.frame.mobileLeft,
          "--wall-frame-mobile-top": room.frame.mobileTop,
          "--wall-frame-mobile-width": room.frame.mobileWidth,
        } as CSSProperties
      }
    >
      <div className="room-transformation-sticky container-page">
        <div className="grid min-h-[92svh] items-center gap-8 py-12 lg:grid-cols-[1.18fr_0.82fr] lg:gap-12 lg:py-16">
          <div
            className="room-transformation-stage"
            aria-label={
              isAr ? "غرفة قبل وبعد إضافة البرواز" : "Room before and after framed artwork"
            }
          >
            <picture className="room-transformation-photo">
              <source media="(max-width: 767px)" type="image/avif" srcSet={room.mobileAvif} />
              <source media="(max-width: 767px)" type="image/webp" srcSet={room.mobileWebp} />
              <source type="image/avif" srcSet={room.desktopAvif} />
              <source type="image/webp" srcSet={room.desktopWebp} />
              <img
                src={room.desktopWebp}
                alt={
                  isAr
                    ? "غرفة معيشة فاخرة بجدار فارغ وإضاءة طبيعية"
                    : "Luxury Scandinavian living room with an empty wall and natural sunlight"
                }
                loading="lazy"
                decoding="async"
              />
            </picture>
            <div className="room-transformation-photo-dim" style={{ opacity: motion.beforeDim }} />
            <div className="room-transformation-sunlight" style={{ opacity: motion.sunlight }} />
            <div className="room-transformation-label" style={{ opacity: 1 - motion.afterLabel }}>
              {isAr ? "قبل" : "Before"}
            </div>
            <div
              className="room-transformation-label room-transformation-label-after"
              style={{ opacity: motion.afterLabel }}
            >
              {isAr ? "بعد" : "After"}
            </div>

            <div className="room-transformation-wall">
              <div className="room-transformation-ambient" style={{ opacity: motion.ambient }} />
              <div
                className="room-transformation-frame-wrap"
                style={{
                  opacity: motion.frameOpacity,
                  transform: `translate3d(-50%, calc(-50% + ${motion.frameY}%), 0) rotateX(${motion.rotateX}deg) rotateZ(${motion.rotateZ}deg) scale(${motion.scale})`,
                }}
              >
                <div
                  className="room-transformation-frame-shadow"
                  style={{ opacity: motion.shadow }}
                />
                <div className="room-transformation-frame">
                  <div className="room-transformation-glass" style={{ opacity: motion.sweep }} />
                  {artwork ? (
                    <SafeImage
                      src={artwork.image.src}
                      avifSrcSet={artwork.image.avifSrcSet}
                      webpSrcSet={artwork.image.webpSrcSet}
                      sizes={artwork.image.sizes}
                      alt={
                        isAr
                          ? `لوحة ${artwork.title} داخل برواز على الحائط`
                          : `${artwork.title} framed artwork on the wall`
                      }
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#1f1f1f,#555,#111)] text-center text-[10px] uppercase tracking-[0.25em] text-white/75">
                      BRWAZWNEON
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 max-w-md lg:justify-self-end" dir={isAr ? "rtl" : "ltr"}>
            <p className="text-[10px] uppercase tracking-[0.45em] text-muted-foreground">
              Room Transformation
            </p>
            <h2
              id="room-transformation-title"
              className="text-display mt-4 text-balance text-3xl leading-[1.05] sm:text-4xl lg:text-5xl"
            >
              {heading}
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
              {subheading}
            </p>
            <div
              className="mt-7 flex flex-col gap-3 transition duration-700 sm:flex-row lg:flex-col xl:flex-row"
              style={{
                opacity: motion.finalText,
                transform: `translate3d(0, ${(1 - motion.finalText) * 10}px, 0)`,
              }}
            >
              <a
                href={cta.href}
                className="inline-flex justify-center rounded-sm bg-primary px-7 py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:brightness-110"
              >
                {isAr ? "اختَر تصميمك" : "Choose Your Design"}
              </a>
              {settings.secondaryCtaEnabled && (
                <Link
                  to="/photo-printing"
                  className="inline-flex justify-center rounded-sm border border-border bg-background/70 px-7 py-3.5 text-xs font-semibold uppercase tracking-widest transition hover:bg-accent"
                >
                  {isAr ? "اطبع صورتك" : "Print Your Photo"}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function computeMotion(progress: number) {
  const enter = ease(clamp((progress - 0.08) / 0.38, 0, 1));
  const settle = ease(clamp((progress - 0.42) / 0.2, 0, 1));
  const transform = ease(clamp((progress - 0.54) / 0.34, 0, 1));
  const snap = Math.sin(settle * Math.PI) * 0.9;
  return {
    frameOpacity: clamp(enter * 1.15, 0, 1),
    frameY: 46 - enter * 46 - snap,
    rotateX: 2.2 - enter * 2.2,
    rotateZ: -2.6 + enter * 2.6,
    scale: 0.94 + settle * 0.06,
    shadow: clamp(enter * 0.56 + transform * 0.22, 0, 0.78),
    ambient: transform,
    finalText: clamp((progress - 0.68) / 0.24, 0, 1),
    afterLabel: clamp((progress - 0.72) / 0.14, 0, 1),
    sweep: clamp((progress - 0.82) / 0.12, 0, 1),
    beforeDim: String(0.42 - transform * 0.3),
    sunlight: clamp((progress - 0.64) / 0.26, 0, 1),
    light: String(0.88 + transform * 0.12),
    warmth: String(transform),
  };
}

function ease(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
