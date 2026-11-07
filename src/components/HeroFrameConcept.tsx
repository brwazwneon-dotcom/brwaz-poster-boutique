import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Tag } from "lucide-react";
import { usePricing } from "@/lib/use-settings";
import {
  HERO_CTA,
  HERO_LEAD_SIZES,
  HERO_POSTER,
  HERO_POSTER_LARGE,
  HERO_POSTER_SIZES,
  HERO_POSTER_SRCSET,
  tiltFor,
} from "@/lib/hero-concept";
import { heroShowcaseQueryOptions } from "@/lib/hero-showcase";
import { showcaseSrcSet, type ShowcaseItem } from "@/lib/hero-showcase-core";
import "./hero-frame-concept.css";

type Card = {
  key: string;
  src: string;
  srcSet?: string;
  sizes: string;
  alt: string;
  width: number;
  height: number;
};

// What the browser has to choose from for each frame: the lead is about 45% of the gallery, the others about a
// quarter of it (see hero-frame-concept.css).
const SMALL_SIZES = "(max-width: 639px) 29vw, (max-width: 1023px) 130px, 150px";

/** where the offer badge leads: the page that lists the bundles (the same price is applied in the cart) */
const OFFER_LINK = "/offers";

/** how often the entrance checks that the preloader is gone, and the longest it waits for that before it plays anyway */
const PLAY_POLL_MS = 50;
const PLAY_MAX_WAIT_MS = 2500;

function cardFor(item: ShowcaseItem, index: number): Card {
  return {
    key: item.id,
    src: item.image,
    srcSet: showcaseSrcSet(item),
    sizes: index === 0 ? HERO_LEAD_SIZES : SMALL_SIZES,
    alt: item.title,
    width: 1000,
    height: 1500,
  };
}

/**
 * Hero Concept #4, "The Frame Takes Center Stage": real Best Sellers in black frames on the wall of a dark, warm
 * room, lit by two brass lamps on a rail. Text and buttons are ordinary HTML (translated through the locale files),
 * not part of a picture.
 *
 * The motion tells one story, every time the page is shown: a main frame in the middle, four frames of the same size
 * come out of it and take their places, hang from their nails and swing until they hang still (and now and then one
 * gives a small nudge). The four are the day's Best Sellers, picked on the server (see hero-showcase-core.ts), so
 * everybody sees the same four all day. A very light parallax follows a mouse.
 *
 * The entrance starts when the visitor can see it (the preloader overlay is gone and the tab is visible), also for a
 * returning visitor and when the page comes back from the browser's back/forward cache (see data-play below).
 *
 * Performance: transform and opacity only, no library. The gallery's box is reserved by its aspect ratio before any
 * picture arrives. The main frame is the lead picture: painted from the first frame (no fade-in), loaded at high priority
 * and preloaded in the route head. The four frames reuse the same pictures and never hold anything up.
 */
export function HeroFrameConcept() {
  const { t, i18n } = useTranslation();
  const dir = i18n.language?.startsWith("ar") ? "rtl" : "ltr";
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  // How each picture is doing: "loading" (a soft placeholder is shown in its frame), "loaded", or "failed" (its frame is
  // taken out of the picture: an empty or broken frame would suggest content that is not there). Boxes never change size.
  const [status, setStatus] = useState<Record<string, "loaded" | "failed">>({});
  const report = useCallback((key: string, next: "loaded" | "failed") => {
    setStatus((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
  }, []);

  const { data, isPending } = useQuery(heroShowcaseQueryOptions);
  const items = data?.items ?? [];
  const cards: Card[] =
    items.length > 0
      ? items.map(cardFor)
      : isPending
        ? []
        : [
            // Nothing in the Best Sellers list: the single catalog poster this concept was approved with.
            {
              key: HERO_POSTER.id,
              src: HERO_POSTER_LARGE,
              srcSet: HERO_POSTER_SRCSET,
              sizes: HERO_POSTER_SIZES,
              alt: t("heroConcept.frameAlt"),
              width: HERO_POSTER.width,
              height: HERO_POSTER.height,
            },
          ];
  // The box is reserved for four frames while the list is still on its way, so nothing moves when it arrives.
  const layoutCount = cards.length === 0 ? 4 : cards.length;
  // The main frame (the one the four come out of) only makes sense when there are several frames to come out of it.
  const showMainFrame = cards.length >= 2;

  // The bundle price comes from the admin's settings (Settings > "Bundle: 4× 30×40"), never from a number typed here,
  // and the badge appears only once the real price has arrived, so a built-in default is never shown as if it were the
  // price. Its place is reserved from the start (see .hfc-offer-slot below), so nothing moves when it appears.
  const queryClient = useQueryClient();
  const pricing = usePricing();
  const pricingLoaded = queryClient.getQueryState(["pricing"])?.status === "success";
  const bundlePrice = pricingLoaded ? pricing.offers.bundle4_30x40 : 0;
  const showOffer = Number.isFinite(bundlePrice) && bundlePrice > 0;

  // The entrance is played when the visitor can actually see it: after the preloader overlay is gone (it covers the
  // server-rendered page on every full load) and while the tab is visible. data-play is what un-pauses the CSS
  // animations. `round` runs the whole entrance again when the browser brings the page back from its back/forward cache.
  const [round, setRound] = useState(0);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const since = performance.now();
    const check = () => {
      timer = undefined;
      if (cancelled) return;
      const visible = document.visibilityState !== "hidden";
      const covered = !!document.querySelector(".brwz-preloader");
      if (visible && (!covered || performance.now() - since > PLAY_MAX_WAIT_MS)) {
        root.dataset.play = "1";
        return;
      }
      timer = setTimeout(check, PLAY_POLL_MS);
    };
    delete root.dataset.play;
    check();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setRound((r) => r + 1);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [round]);

  // A very light tilt and parallax that follow a mouse, nothing else: not on touch screens, and not at all when the
  // visitor asked for reduced motion. Written straight to CSS variables (no React re-render per mouse move).
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
          className="grid grid-cols-1 content-start gap-y-6 pb-[calc(var(--hfc-floor)+1.25rem)] pt-10 sm:gap-y-9 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:content-center lg:gap-x-10 lg:gap-y-0 lg:pb-[calc(var(--hfc-floor)+5.2rem)] lg:pt-14"
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
            <p className="mt-3 min-h-14 max-w-md text-sm leading-7 text-white/75 sm:mt-5 sm:min-h-16 sm:text-base sm:leading-8">
              {t("heroConcept.description")}
            </p>
            <div className="hfc-offer-slot mt-4 min-h-10 sm:mt-5">
              {showOffer ? (
                <Link
                  to={OFFER_LINK}
                  data-hero-offer="4x30x40"
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/70 bg-black/40 px-4 text-xs font-semibold text-white shadow-[0_6px_20px_-8px_rgba(0,0,0,0.8)] backdrop-blur-sm transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                >
                  <Tag aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  <Trans
                    i18nKey="heroConcept.offerBadge"
                    values={{ price: new Intl.NumberFormat("en-US").format(bundlePrice) }}
                    components={{ price: <span className="font-black text-primary" /> }}
                  />
                </Link>
              ) : null}
            </div>
          </div>

          <div ref={stageRef} className="hfc-stage lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="hfc-enter">
              <div className="hfc-tilt">
                <div key={round} className="hfc-gallery" data-count={layoutCount}>
                  {/* two brass lamps on a rail above the frames; they belong to the wall, so they never swing */}
                  {showMainFrame ? (
                    <div className="hfc-lamps" aria-hidden="true">
                      <span className="hfc-lamp hfc-lamp--a" />
                      <span className="hfc-lamp hfc-lamp--b" />
                    </div>
                  ) : null}
                  {cards.map((card, i) => (
                    <div
                      key={card.key}
                      className={`hfc-card hfc-card--${i}`}
                      data-slot={i}
                      data-state={status[card.key] ?? "loading"}
                    >
                      <div className="hfc-hang">
                        <div className="hfc-shadow" aria-hidden="true" />
                        <figure className="hfc-frame">
                          <div className="hfc-art">
                            <img
                              src={card.src}
                              srcSet={card.srcSet}
                              sizes={card.srcSet ? card.sizes : undefined}
                              width={card.width}
                              height={card.height}
                              alt={card.alt}
                              loading="eager"
                              decoding="async"
                              fetchPriority={i === 0 && !showMainFrame ? "high" : "low"}
                              onLoad={() => report(card.key, "loaded")}
                              onError={() => report(card.key, "failed")}
                              // a picture that finished before React hydrated fires no load event any more
                              ref={(el) => {
                                if (el?.complete)
                                  report(card.key, el.naturalWidth > 0 ? "loaded" : "failed");
                              }}
                            />
                          </div>
                          <span className="hfc-glass" aria-hidden="true" />
                        </figure>
                      </div>
                    </div>
                  ))}
                  {/* the main frame: the first Best Seller, big in the middle. The four frames above come out of it. It is
                      the same picture again (so the browser fetches it once), decorative, and the LCP element. */}
                  {showMainFrame ? (
                    <div
                      className="hfc-card hfc-card--m"
                      data-state={status[cards[0].key] === "failed" ? "failed" : "loaded"}
                      aria-hidden="true"
                    >
                      <div className="hfc-hang">
                        <div className="hfc-shadow" />
                        <figure className="hfc-frame">
                          <div className="hfc-art">
                            <img
                              src={cards[0].src}
                              srcSet={cards[0].srcSet}
                              sizes={cards[0].srcSet ? cards[0].sizes : undefined}
                              width={cards[0].width}
                              height={cards[0].height}
                              alt=""
                              loading="eager"
                              decoding="async"
                              fetchPriority="high"
                            />
                          </div>
                          <span className="hfc-glass" />
                        </figure>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div
            dir={dir}
            className="hfc-cta flex flex-col gap-3 pe-[3.75rem] sm:flex-row sm:flex-wrap sm:pe-0 lg:col-start-1 lg:row-start-2 lg:self-start"
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
