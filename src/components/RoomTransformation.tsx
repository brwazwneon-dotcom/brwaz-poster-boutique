import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  ROOM_CTA_DESTINATIONS,
  ROOM_FRAME_STYLES,
  ROOM_PRESETS,
  useRoomTransformationSettings,
  useRoomWallPosters,
} from "@/lib/room-transformation";
import { WALL_LAYOUTS } from "@/lib/room-wall-layouts";
import { priceForFrame, usePricing } from "@/lib/use-settings";
import "./room-wall.css";

const BUNDLE_KEY = "bundle-6-20x30";
const BUNDLE_KEY_4 = "bundle-4-30x40";

// Serve Cloudinary uploads at the size they are shown, in a modern format.
function thumb(url: string, width: number): string {
  const marker = "/image/upload/";
  const at = url.indexOf(marker);
  if (at === -1 || !url.includes("res.cloudinary.com")) return url;
  const rest = url.slice(at + marker.length);
  if (!/^v\d+\//.test(rest) && /^[a-z]{1,3}_[^/]+\//.test(rest)) return url;
  return `${url.slice(0, at + marker.length)}f_auto,q_auto,w_${width}/${rest}`;
}

export function RoomTransformation() {
  const { i18n } = useTranslation();
  const settings = useRoomTransformationSettings();
  const postersQuery = useRoomWallPosters(settings);
  const pricing = usePricing();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [near, setNear] = useState(false);
  const [count, setCount] = useState<4 | 6>(6);
  const isAr = i18n.language?.startsWith("ar");

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: "300px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [settings.enabled]);

  // The frames hang one by one as the room scrolls into view: nothing at
  // 85% of the way down the screen, everything once it is near the top. No
  // pinned/sticky scrolling, so there is no extra scroll distance.
  useEffect(() => {
    if (!near) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const update = () => {
      const el = stageRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const start = window.innerHeight * 0.85;
      const end = window.innerHeight * 0.15;
      const next = clamp((start - top) / (start - end), 0, 1);
      setProgress((prev) => (Math.abs(prev - next) > 0.008 ? next : prev));
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

  if (!settings.enabled) return null;

  const room = ROOM_PRESETS[settings.roomPreset];
  const frameStyle = ROOM_FRAME_STYLES[settings.frameStyle];
  const cta = ROOM_CTA_DESTINATIONS[settings.ctaDestination];
  const heading = isAr ? settings.headingAr : settings.headingEn;
  const subheading = isAr ? settings.subheadingAr : settings.subheadingEn;
  const posters = postersQuery.data ?? [];
  const layout = WALL_LAYOUTS[count];
  // Hang delay between frames; the last one must still finish by progress 1.
  const step = count === 6 ? 0.13 : 0.2;
  const glow = ease(clamp((progress - 0.55) / 0.4, 0, 1));
  const filled = progress > 0.7;

  // Bundle offer (6 frames 20x30) — the same numbers the /offers page shows.
  const unit = priceForFrame(pricing, "pvc", "20x30");
  const bundlePrice = pricing.offers.bundle6_20x30;
  const regular6 = unit * 6;
  const saving = Math.max(0, regular6 - bundlePrice);

  // Bundle offer (4 frames 30x40) — the same numbers the /offers page shows.
  const unit4 = priceForFrame(pricing, "pvc", "30x40");
  const bundlePrice4 = pricing.offers.bundle4_30x40;
  const regular4 = unit4 * 4;
  const saving4 = Math.max(0, regular4 - bundlePrice4);

  return (
    <section
      className="border-t border-border bg-background text-foreground"
      aria-labelledby="room-transformation-title"
    >
      <div className="container-page py-12 lg:py-16">
        <div className="grid items-start gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:gap-12">
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
                {isAr ? "اختار شكل الحيطة" : "Choose your wall"}
              </span>
              <div
                role="group"
                aria-label={isAr ? "عدد البراويز" : "Number of frames"}
                className="inline-flex overflow-hidden rounded-sm border border-border"
              >
                {([4, 6] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={count === n}
                    onClick={() => setCount(n)}
                    className={`px-5 py-2 text-xs font-semibold uppercase tracking-widest transition ${count === n ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
                  >
                    {isAr ? `${n} براويز` : `${n} frames`}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={stageRef}
              className="rw-stage"
              role="img"
              aria-label={
                isAr
                  ? "حيطة فاضية بتتملي براويز واحد ورا التاني"
                  : "An empty wall filling up with framed posters one by one"
              }
              style={
                {
                  "--wall": room.wall,
                  "--frame": frameStyle.frame,
                  "--mat": frameStyle.mat,
                  "--glow": glow,
                } as CSSProperties
              }
            >
              <div className="rw-wall" />
              <div className="rw-light" />
              <div className="rw-glow" />
              <div className="rw-baseboard" />
              <div className="rw-floor" />
              <div className="rw-console">
                <div className="rw-console-shadow" />
                <div className="rw-console-top" />
                <div className="rw-console-body" />
                <div className="rw-lamp">
                  <div className="rw-lamp-base" />
                </div>
                <div className="rw-books" />
                <div className="rw-vase" />
              </div>

              {layout.map((f, i) => {
                const e = ease(clamp((progress - i * step) / 0.3, 0, 1));
                const poster = posters.length > 0 ? posters[i % posters.length] : null;
                return (
                  <div
                    key={`${count}-${i}`}
                    className="rw-frame"
                    style={
                      {
                        "--e": e,
                        "--ar": f.aspect,
                        "--ml": f.m.l,
                        "--mt": f.m.t,
                        "--mw": f.m.w,
                        "--dl": f.d.l,
                        "--dt": f.d.t,
                        "--dw": f.d.w,
                      } as CSSProperties
                    }
                  >
                    <div className="rw-mat">
                      {poster && (
                        <img
                          className="rw-art"
                          src={thumb(poster.imageUrl, 420)}
                          alt={poster.title}
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="rw-vignette" />
              <div className="rw-label">
                {filled ? (isAr ? "بعد" : "After") : isAr ? "قبل" : "Before"}
              </div>
            </div>

            <div className="mt-4 rounded-sm border border-border bg-card p-5">
              {count === 6 ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.35em] text-primary">
                      {isAr ? "عرض الباقة" : "Bundle offer"}
                    </div>
                    <div className="text-display mt-1 text-2xl">
                      {isAr ? "6 براويز · 20×30 سم" : "6 frames · 20×30 cm"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {isAr
                        ? `يعني ${Math.round(bundlePrice / 6)} جنيه للبرواز الواحد`
                        : `That is about ${Math.round(bundlePrice / 6)} EGP per frame`}
                    </div>
                  </div>
                  <div className="text-end">
                    {saving > 0 && (
                      <div className="text-sm text-muted-foreground line-through">
                        {regular6} {isAr ? "جنيه" : "EGP"}
                      </div>
                    )}
                    <div className="text-display text-4xl leading-none">
                      {bundlePrice}{" "}
                      <span className="text-base text-muted-foreground">
                        {isAr ? "جنيه" : "EGP"}
                      </span>
                    </div>
                    {saving > 0 && (
                      <div className="mt-1 text-xs font-semibold text-primary">
                        {isAr ? `وفّر ${saving} جنيه` : `Save ${saving} EGP`}
                      </div>
                    )}
                  </div>
                  <Link
                    to="/offers"
                    search={{ bundle: BUNDLE_KEY }}
                    className="inline-flex w-full justify-center rounded-sm bg-primary px-7 py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:brightness-110 sm:w-auto"
                  >
                    {isAr ? "اطلب الباقة" : "Get the bundle"}
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.35em] text-primary">
                      {isAr ? "عرض الباقة" : "Bundle offer"}
                    </div>
                    <div className="text-display mt-1 text-2xl">
                      {isAr ? "4 براويز · 30×40 سم" : "4 frames · 30×40 cm"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {isAr
                        ? `يعني ${Math.round(bundlePrice4 / 4)} جنيه للبرواز الواحد`
                        : `That is about ${Math.round(bundlePrice4 / 4)} EGP per frame`}
                    </div>
                  </div>
                  <div className="text-end">
                    {saving4 > 0 && (
                      <div className="text-sm text-muted-foreground line-through">
                        {regular4} {isAr ? "جنيه" : "EGP"}
                      </div>
                    )}
                    <div className="text-display text-4xl leading-none">
                      {bundlePrice4}{" "}
                      <span className="text-base text-muted-foreground">
                        {isAr ? "جنيه" : "EGP"}
                      </span>
                    </div>
                    {saving4 > 0 && (
                      <div className="mt-1 text-xs font-semibold text-primary">
                        {isAr ? `وفّر ${saving4} جنيه` : `Save ${saving4} EGP`}
                      </div>
                    )}
                  </div>
                  <Link
                    to="/offers"
                    search={{ bundle: BUNDLE_KEY_4 }}
                    className="inline-flex w-full justify-center rounded-sm bg-primary px-7 py-3.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:brightness-110 sm:w-auto"
                  >
                    {isAr ? "اطلب الباقة" : "Get the bundle"}
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="max-w-md lg:justify-self-end lg:pt-10" dir={isAr ? "rtl" : "ltr"}>
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
            <div className="mt-7 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
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

function ease(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
