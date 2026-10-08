import { useEffect, useRef, useState, type CSSProperties } from "react";

/* Decorative motion layer. Everything here is aria-hidden, pointer-events:none, CSS-only animation on
 * transform/opacity, deterministic (no Math.random in render => no hydration mismatch), paused while
 * off-screen, and removed under prefers-reduced-motion (see styles/v2.css). */

/** Plays CSS animations only while the element is on screen. */
function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on] as const;
}

// Small deterministic generator so server and client render identical markup.
function seeded(n: number) {
  let s = 1234567 + n * 9301;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

type Kind = "frames" | "confetti";
const COLORS = [
  "var(--v2-yellow, #ffd400)",
  "var(--v2-cyan, #00bee8)",
  "var(--v2-paper, #f3efe6)",
  "var(--v2-ink, #0e0e0e)",
];

function buildItems(kind: Kind, count: number, edges: boolean) {
  const rnd = seeded(kind === "frames" ? 7 : 21);
  return Array.from({ length: count }, (_, i) => {
    const side = edges ? (i % 2 === 0 ? rnd() * 14 + 1 : 85 - rnd() * 14 + 14) : rnd() * 96 + 2;
    const dur = kind === "frames" ? 11 + rnd() * 9 : 3.6 + rnd() * 3.2;
    return {
      key: i,
      left: side,
      size: kind === "frames" ? 18 + rnd() * 30 : 9 + rnd() * 10,
      dur,
      delay: -rnd() * dur,
      sway: 10 + rnd() * 26,
      rot: (rnd() - 0.5) * 70,
      spin: 180 + rnd() * 360,
      color: COLORS[i % COLORS.length],
      hideOnPhone: i % 3 === 2,
    };
  });
}

/** Posters/frames (or confetti) falling through a section. */
export function FallingLayer({
  kind = "frames",
  count = 14,
  edges = false,
  opacity = 1,
}: {
  kind?: Kind;
  count?: number;
  /** keep items near the left/right edges so centred content stays readable (hero) */
  edges?: boolean;
  opacity?: number;
}) {
  const [ref, on] = useOnScreen<HTMLDivElement>();
  const items = buildItems(kind, count, edges);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="v2-fall"
      data-kind={kind}
      data-on={on}
      style={{ opacity } as CSSProperties}
    >
      {items.map((it) => (
        <span
          key={it.key}
          className="v2-fall-item"
          data-phone-hidden={it.hideOnPhone || undefined}
          style={
            {
              left: `${it.left}%`,
              "--w": `${it.size}px`,
              "--dur": `${it.dur}s`,
              "--delay": `${it.delay}s`,
              "--sway": `${it.sway}px`,
              "--rot": `${it.rot}deg`,
              "--spin": `${it.spin}deg`,
              "--c": it.color,
            } as CSSProperties
          }
        >
          <i className="v2-fall-body" />
        </span>
      ))}
    </div>
  );
}

const WORDS_EN = [
  "FRAMED POSTERS",
  "PRINTED IN EGYPT",
  "FREE DELIVERY OVER 1600 EGP",
  "CUSTOM DESIGN",
  "PREVIEW BEFORE PRINTING",
];
const WORDS_AR = [
  "بوسترات مؤطرة",
  "طباعة في مصر",
  "شحن مجاني فوق 1600 جنيه",
  "تصميم مخصص",
  "معاينة قبل الطباعة",
];

/** Two crossing tickers (one yellow, one ink) — kinetic typography between sections. */
export function MarqueeBands({ ar }: { ar: boolean }) {
  const words = ar ? WORDS_AR : WORDS_EN;
  const line = [...words, ...words];
  const track = (
    <>
      {line.map((w, i) => (
        <span key={i} className="v2-marquee-item">
          {w}
          <b aria-hidden="true">✦</b>
        </span>
      ))}
    </>
  );
  return (
    <div className="v2-marquees" aria-hidden="true" dir="ltr">
      <div className="v2-marquee" data-tone="yellow">
        <div className="v2-marquee-track">
          {track}
          {track}
        </div>
      </div>
      <div className="v2-marquee" data-tone="ink" data-reverse="true">
        <div className="v2-marquee-track">
          {track}
          {track}
        </div>
      </div>
    </div>
  );
}
