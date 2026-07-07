import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Frame,
  Camera,
  Palette,
  Truck,
  Eye,
  MapPin,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Card = { icon: LucideIcon; title: string; body: string };

const CARDS: Card[] = [
  {
    icon: Sparkles,
    title: "Over 7 Million Photos Printed",
    body: "Printed with experience trusted by thousands of customers.",
  },
  {
    icon: Frame,
    title: "Premium PVC Frames",
    body: "Durable premium-quality frames with elegant finishing.",
  },
  {
    icon: Camera,
    title: "Original Fujifilm Photo Paper",
    body: "Sharp colors, museum-quality printing and long-lasting durability.",
  },
  {
    icon: Palette,
    title: "Professional Designer Included",
    body: "Every order is reviewed before printing.",
  },
  {
    icon: Truck,
    title: "Cash on Delivery",
    body: "Available across all Egypt.",
  },
  {
    icon: Eye,
    title: "Preview Before Printing",
    body: "Approve your artwork before production.",
  },
  {
    icon: MapPin,
    title: "Made in Egypt",
    body: "Designed, printed and framed locally with care.",
  },
];

/** Gold accent used only as a hairline / small mark. */
const GOLD = "#c9a24a";

export function TrustedQuality({ title, subtitle }: { title?: string; subtitle?: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative isolate overflow-hidden border-t border-border bg-black text-white">
      {/* Ambient depth — subtle radial + top/bottom fades */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1200px 600px at 50% -10%, rgba(201,162,74,0.08), transparent 60%), radial-gradient(900px 500px at 50% 110%, rgba(255,255,255,0.04), transparent 60%), linear-gradient(180deg, #000 0%, #060606 60%, #000 100%)",
        }}
      />
      {/* Faint noise via SVG */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      <div className="container-page py-24 sm:py-32">
        {/* Header */}
        <div
          className={[
            "mx-auto max-w-2xl text-center transition-all duration-1000 ease-out",
            inView ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
          ].join(" ")}
        >
          <div className="mx-auto mb-6 flex items-center justify-center gap-3">
            <span className="h-px w-10" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
            <span
              className="text-[10px] font-medium uppercase tracking-[0.55em]"
              style={{ color: GOLD }}
            >
              The BRWAZWNEON Standard
            </span>
            <span className="h-px w-10" style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }} />
          </div>

          <h2 className="text-display text-4xl leading-[1.05] sm:text-6xl">
            {title ?? "Crafted With Uncompromising Care."}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">
            {subtitle ??
              "For over 25 years we've been framing memories — every piece reviewed, refined and finished by hand with a quiet obsession for the smallest detail."}
          </p>
        </div>

        {/* Stat strip — 25-year badge flanked by proof stats */}
        <div
          className={[
            "mx-auto mt-12 flex max-w-5xl flex-wrap items-stretch justify-center gap-3 transition-all duration-1000 ease-out sm:mt-14 sm:gap-4",
            inView ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
          ].join(" ")}
          style={{ transitionDelay: inView ? "180ms" : "0ms" }}
        >
          <StatCard value="7M+" label={"Photos\nPrinted"} />
          <StatCard value="50K+" label={"Happy\nClients"} />
          <YearsBadge />
          <StatCard value="100%" label={"Hand\nFinished"} />
          <StatCard value="27" label={"Governorates\nDelivered"} />
        </div>

        {/* Feature blocks — staggered 2-col on desktop, single column on mobile */}
        <ul className="mx-auto mt-20 grid max-w-5xl grid-cols-1 gap-6 sm:mt-24 sm:gap-8 md:grid-cols-2 md:gap-x-10 md:gap-y-14">
          {CARDS.map((card, i) => (
            <FeatureBlock key={card.title} card={card} index={i} />
          ))}
        </ul>

        {/* Signature footnote */}
        <div className="mx-auto mt-24 flex max-w-md items-center justify-center gap-4 text-[10px] uppercase tracking-[0.5em] text-white/40">
          <span className="h-px flex-1 bg-white/10" />
          <span style={{ color: GOLD }}>✦</span>
          <span>Made With Care · Egypt</span>
          <span style={{ color: GOLD }}>✦</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
      </div>
    </section>
  );
}

function FeatureBlock({ card, index }: { card: Card; index: number }) {
  const { icon: Icon, title, body } = card;
  const ref = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Every second card on desktop is nudged downward for a staggered rhythm.
  const offset = index % 2 === 1 ? "md:mt-16" : "";

  return (
    <li
      ref={ref}
      className={[
        "group relative overflow-hidden rounded-md border border-white/10 bg-white/[0.02] p-8 backdrop-blur-md transition-all duration-700 ease-out sm:p-10",
        "shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_20px_60px_-30px_rgba(0,0,0,0.9)]",
        "hover:-translate-y-1.5 hover:border-white/25 hover:bg-white/[0.04]",
        "hover:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_35px_80px_-25px_rgba(0,0,0,0.9),0_0_0_1px_rgba(201,162,74,0.15)]",
        offset,
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
      ].join(" ")}
      style={{ transitionDelay: visible ? `${Math.min(index, 6) * 90}ms` : "0ms" }}
    >
      {/* Gold sheen on hover */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(500px 200px at 20% 0%, rgba(201,162,74,0.10), transparent 60%)",
        }}
      />

      <div className="relative flex items-start gap-6">
        {/* Icon */}
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/15 bg-black/60 text-white/80 transition-colors duration-500 group-hover:text-white"
          style={{ boxShadow: "inset 0 0 20px rgba(201,162,74,0.05)" }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.25} />
        </div>

        {/* Copy */}
        <div className="min-w-0 flex-1">
          <h3 className="text-display text-xl leading-tight text-white sm:text-2xl">
            {title}
          </h3>
          <div
            className="mt-4 h-px w-10 transition-all duration-500 group-hover:w-20"
            style={{ background: `linear-gradient(to right, ${GOLD}, transparent)` }}
          />
          <p className="mt-4 text-sm leading-relaxed text-white/55 sm:text-[15px]">
            {body}
          </p>
        </div>
      </div>
    </li>
  );
}

function YearsBadge() {
  return (
    <div
      className="relative flex items-center gap-4 rounded-md border border-white/15 bg-white/[0.04] px-6 py-4 backdrop-blur-md sm:px-7 sm:py-5"
      style={{
        boxShadow:
          "inset 0 0 30px rgba(201,162,74,0.08), 0 20px 40px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(201,162,74,0.18)",
      }}
    >
      {/* Gold corner accents */}
      <span aria-hidden className="absolute left-1.5 top-1.5 h-2 w-2 border-l border-t" style={{ borderColor: GOLD }} />
      <span aria-hidden className="absolute right-1.5 top-1.5 h-2 w-2 border-r border-t" style={{ borderColor: GOLD }} />
      <span aria-hidden className="absolute bottom-1.5 left-1.5 h-2 w-2 border-b border-l" style={{ borderColor: GOLD }} />
      <span aria-hidden className="absolute bottom-1.5 right-1.5 h-2 w-2 border-b border-r" style={{ borderColor: GOLD }} />

      <span
        className="text-display text-5xl leading-none sm:text-6xl"
        style={{
          color: GOLD,
          textShadow: "0 0 30px rgba(201,162,74,0.35)",
        }}
      >
        25
      </span>
      <span className="h-10 w-px bg-white/20" />
      <span className="text-left text-[10px] font-medium uppercase leading-[1.5] tracking-[0.35em] text-white/80">
        Years<br />of Craft
      </span>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-[110px] flex-col items-center justify-center rounded-md border border-white/10 bg-white/[0.02] px-5 py-4 backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/[0.04] sm:min-w-[130px] sm:px-6 sm:py-5">
      <span
        className="text-display text-3xl leading-none sm:text-4xl"
        style={{ color: GOLD }}
      >
        {value}
      </span>
      <span className="mt-3 whitespace-pre-line text-center text-[9px] font-medium uppercase leading-[1.5] tracking-[0.3em] text-white/55">
        {label}
      </span>
    </div>
  );
}