import { useEffect, useRef, useState } from "react";
import { Droplets, Layers, PanelTop, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { motionAllowed } from "@/lib/motion";

// What the Premium Wooden Panel is, shown where the customer picks it:
// imported Spanish wood, 10 mm, no frame, two protective layers against water and dust.

/** One short line under the "wood" option card. */
export function WoodPanelBadge() {
  const { t } = useTranslation();
  return (
    <span className="mt-0.5 block text-[10px] font-normal leading-tight text-muted-foreground">
      {t("woodPanel.badge")}
    </span>
  );
}

/** Same line as a small chip for the cart. */
export function WoodPanelCartChip() {
  const { t } = useTranslation();
  return (
    <span className="rounded-sm border border-border bg-card px-1.5 py-0.5 tracking-widest text-muted-foreground">
      {t("woodPanel.cartNote")}
    </span>
  );
}

// Droplets: x / y / radius on the 180 x 120 drawing. Each dries when the cloth passes
// its x position (delay = x / 180 of the wipe).
const DROPS: Array<[number, number, number]> = [
  [48, 34, 4.2],
  [66, 62, 3],
  [58, 86, 3.6],
  [84, 40, 3.2],
  [96, 72, 4.4],
  [110, 30, 3],
  [118, 58, 3.8],
  [132, 84, 3.2],
  [140, 44, 4],
];
const WIPE_SECONDS = 1.7;

function useMotionOk() {
  const flags = usePerformanceFlags();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setOk(
      motionAllowed({
        prefersReducedMotion: !!mq?.matches,
        emergencyFastMode: !!flags.emergency_fast_mode,
        safeMode: !!flags.safe_mode,
        disabledByOwner: !!flags.disable_motion,
        search: window.location.search,
      }),
    );
  }, [flags.emergency_fast_mode, flags.safe_mode, flags.disable_motion]);
  return ok;
}

/** Water on the wooden panel, wiped away by a cloth; plays once when it scrolls into view. */
function WaterWipe() {
  const { t } = useTranslation();
  const motionOk = useMotionOk();
  const ref = useRef<HTMLButtonElement | null>(null);
  const [run, setRun] = useState(0);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen || !motionOk) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, motionOk]);

  // Without motion the panel is simply shown dry and protected.
  const state = !motionOk ? "dry" : seen ? "play" : "wet";

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        if (motionOk) setRun((n) => n + 1);
      }}
      disabled={!motionOk}
      aria-label={motionOk ? t("woodPanel.replay") : t("woodPanel.animAlt")}
      className="wp-anim relative mx-auto block w-full max-w-[150px] shrink-0 rounded-sm @sm:max-w-[170px]"
      data-state={state}
      key={run}
    >
      <svg viewBox="0 0 180 120" role="img" aria-label={t("woodPanel.animAlt")} className="w-full">
        <defs>
          <linearGradient id="wp-wood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#b98450" />
            <stop offset="1" stopColor="#8a5a33" />
          </linearGradient>
          <clipPath id="wp-clip">
            <rect x="30" y="12" width="120" height="96" rx="3" />
          </clipPath>
        </defs>
        <rect x="32" y="16" width="120" height="96" rx="3" fill="rgba(0,0,0,0.18)" />
        <rect x="30" y="12" width="120" height="96" rx="3" fill="url(#wp-wood)" />
        <g clipPath="url(#wp-clip)">
          <rect x="30" y="12" width="120" height="96" fill="#f4e8d3" opacity="0.1" />
          <rect x="40" y="22" width="100" height="76" fill="#fbf4e6" />
          <circle cx="112" cy="46" r="11" fill="#e0533d" />
          <path d="M40 98 L68 58 L86 80 L104 64 L140 98 Z" fill="#2d3a4a" />
          <path d="M30 108 H150" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />
          {DROPS.map(([x, y, r]) => (
            <g
              key={`${x}-${y}`}
              className="wp-drop"
              style={{ animationDelay: `${(x / 180) * WIPE_SECONDS}s` }}
            >
              <circle cx={x} cy={y} r={r} fill="#5fb4e8" opacity="0.62" />
              <circle cx={x - r * 0.3} cy={y - r * 0.35} r={r * 0.28} fill="#fff" opacity="0.85" />
            </g>
          ))}
          <rect className="wp-cloth" x="-30" y="8" width="30" height="104" rx="8" fill="#ffffff" />
        </g>
        <g className="wp-shield">
          <circle cx="146" cy="100" r="14" fill="#16a34a" />
          <path
            d="M139 100 L144 105 L154 95"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
      {motionOk && (
        <span className="absolute bottom-0 start-0 rounded-full bg-background/80 p-1 text-muted-foreground">
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
    </button>
  );
}

/** Shown under the frame options while the wooden panel is selected. */
export function WoodPanelNote() {
  const { t } = useTranslation();
  const points = [
    { Icon: Layers, text: t("woodPanel.point1") },
    { Icon: PanelTop, text: t("woodPanel.point2") },
    { Icon: Droplets, text: t("woodPanel.point3") },
  ];
  return (
    <div className="@container mt-3 rounded-sm border border-border bg-card/60 p-3">
      <div className="flex flex-col items-center gap-3 @sm:flex-row @sm:gap-4">
        <WaterWipe />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-widest">{t("woodPanel.title")}</div>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-muted-foreground">
            {points.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
