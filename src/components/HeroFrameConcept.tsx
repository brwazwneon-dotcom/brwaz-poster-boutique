import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  HERO_CTA,
  HERO_POSTER,
  HERO_POSTER_LARGE,
  HERO_POSTER_SIZES,
  HERO_POSTER_SRCSET,
  tiltFor,
} from "@/lib/hero-concept";
import "./hero-frame-concept.css";

/**
 * Hero Concept #4, "The Frame Takes Center Stage": a real catalog poster in a large frame on the wall of a
 * dark, warm room. Text and buttons are ordinary HTML (translated through the locale files), not part of a picture.
 *
 * Performance: the poster is the one image, loaded eagerly with a high fetch priority and explicit dimensions (and
 * preloaded in the route head). The room and the frame are CSS. The entrance moves with transform only, so the poster
 * is painted immediately.
 */
export function HeroFrameConcept() {
  const { t, i18n } = useTranslation();
  const dir = i18n.language?.startsWith("ar") ? "rtl" : "ltr";
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  // A gentle tilt that follows a mouse, nothing else: not on touch screens, and not at all when the visitor asked
  // for reduced motion. Written straight to CSS variables (no React re-render per mouse move).
  useEffect(() => {
    const stage = stageRef.current;
    const root = rootRef.current;
    if (!stage || !root || typeof window.matchMedia !== "function") return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reduced.matches) return;

    let frame = 0;
    const apply = (fx: number, fy: number) => {
      const { rotateX, rotateY } = tiltFor(fx, fy);
      root.style.setProperty("--hfc-ry", `${rotateY}deg`);
      root.style.setProperty("--hfc-rx", `${rotateX}deg`);
      root.style.setProperty("--hfc-gx", String(fx));
      root.style.setProperty("--hfc-sx", `${(fx * 6).toFixed(1)}px`);
      root.style.setProperty("--hfc-lx", `${(70 + fx * 4).toFixed(1)}%`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = stage.getBoundingClientRect();
        apply(
          ((e.clientX - r.left) / r.width - 0.5) * 2,
          ((e.clientY - r.top) / r.height - 0.5) * 2,
        );
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      apply(0, 0);
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section
      ref={rootRef}
      data-hero-concept="frame"
      aria-labelledby="hero-concept-title"
      className="hfc border-b border-border"
    >
      <div className="hfc-room" aria-hidden="true">
        <div className="hfc-wall" />
        <div className="hfc-window" />
        <div className="hfc-floor" />
      </div>

      {/*
        The columns keep their places in both languages (dir="ltr" on an inner element: the site's [dir=rtl] .container-page rule would override it on the container itself).
        The server always renders Arabic and the page switches to the visitor's language after hydration; a layout
        that mirrored with the language would make the whole frame jump across the screen at that moment (a huge
        layout shift). Only the text inside the copy follows the language direction.
      */}
      <div className="container-page">
        <div
          dir="ltr"
          className="grid grid-cols-1 content-start gap-y-9 pb-[calc(var(--hfc-floor)+1.25rem)] pt-14 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:content-center lg:gap-x-10 lg:gap-y-0 lg:pb-[calc(var(--hfc-floor)+5.2rem)] lg:pt-14"
        >
          <div
            dir={dir}
            className="hfc-copy max-w-xl lg:col-start-1 lg:row-start-1 lg:self-end lg:pb-5"
          >
            <p className="mb-3 inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.38em] text-primary sm:text-xs">
              <span aria-hidden="true" className="h-px w-8 bg-primary/70" />
              {t("heroConcept.label")}
            </p>
            <h1
              id="hero-concept-title"
              className="text-balance text-[1.9rem] font-black leading-[1.12] tracking-[0.04em] rtl:tracking-normal text-white drop-shadow-[0_3px_18px_rgba(0,0,0,0.55)] sm:text-5xl lg:text-[3.4rem]"
            >
              {t("heroConcept.title")}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-7 text-white/75 sm:mt-5 sm:text-base sm:leading-8">
              {t("heroConcept.description")}
            </p>
          </div>

          <div ref={stageRef} className="hfc-stage lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="hfc-enter">
              <div className="hfc-tilt">
                <div className="hfc-hang">
                  <div className="hfc-shadow" aria-hidden="true" />
                  <div className="hfc-light" aria-hidden="true" />
                  <figure className="hfc-frame">
                    <div className="hfc-art">
                      <img
                        src={HERO_POSTER_LARGE}
                        srcSet={HERO_POSTER_SRCSET}
                        sizes={HERO_POSTER_SIZES}
                        width={HERO_POSTER.width}
                        height={HERO_POSTER.height}
                        alt={t("heroConcept.frameAlt")}
                        loading="eager"
                        decoding="async"
                        fetchPriority="high"
                      />
                    </div>
                    <span className="hfc-glass" aria-hidden="true" />
                  </figure>
                </div>
              </div>
            </div>
          </div>

          <div
            dir={dir}
            className="hfc-cta flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:col-start-1 lg:row-start-2 lg:self-start"
          >
            <Link
              to={HERO_CTA.primary}
              className="rounded-sm bg-primary px-8 py-4 text-center text-xs font-semibold uppercase tracking-widest text-primary-foreground shadow-[0_8px_28px_-8px_rgba(0,0,0,0.8)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rtl:tracking-normal sm:text-sm"
            >
              {t("heroConcept.primaryCta")}
            </Link>
            <Link
              to={HERO_CTA.secondary}
              className="rounded-sm border border-white/60 bg-black/35 px-8 py-4 text-center text-xs font-semibold uppercase tracking-widest text-white backdrop-blur-sm transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rtl:tracking-normal sm:text-sm"
            >
              {t("heroConcept.secondaryCta")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
