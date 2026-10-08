import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useInView } from "@/hooks/use-in-view";

/** Responsive space reserved for a section, in px (<768px, 768–1279px, ≥1280px). */
export type LazyReserve = { sm: number; md: number; lg: number };

/** Longest a reservation is held for a section that never reaches its reserved height. */
const RELEASE_AFTER_MS = 8000;
/** The content must stay at/above the reserved height this long before the hold is dropped. */
const SETTLE_MS = 800;

/**
 * Defers rendering of below-the-fold sections until they scroll near the
 * viewport. The section's space is reserved up front (`reserve`, per breakpoint,
 * close to the real section height) and is held after mounting until the real
 * content has filled it, so the page height does not collapse while the lazy
 * chunk and the section's data load. Keeps the homepage's initial paint small.
 */
export function LazyOnView({
  children,
  minHeight = 480,
  reserve,
  rootMargin = "600px 0px",
}: {
  children: ReactNode;
  minHeight?: number;
  reserve?: LazyReserve;
  rootMargin?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin, threshold: 0 });
  const innerRef = useRef<HTMLDivElement>(null);
  const [released, setReleased] = useState(false);
  const r = reserve ?? { sm: minHeight, md: minHeight, lg: minHeight };

  useEffect(() => {
    if (!inView || released) return;
    const wrap = ref.current;
    const inner = innerRef.current;
    const hardTimer = window.setTimeout(() => setReleased(true), RELEASE_AFTER_MS);
    let settleTimer = 0;
    let ro: ResizeObserver | undefined;
    if (wrap && inner && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        // The lazy chunk's fallback and the "no data yet" render are shorter than the
        // reservation; only a stable, full-height render hands layout back to the content.
        window.clearTimeout(settleTimer);
        const held = parseFloat(getComputedStyle(wrap).minHeight) || 0;
        if (inner.getBoundingClientRect().height >= held) {
          settleTimer = window.setTimeout(() => setReleased(true), SETTLE_MS);
        }
      });
      ro.observe(inner);
    }
    return () => {
      window.clearTimeout(hardTimer);
      window.clearTimeout(settleTimer);
      ro?.disconnect();
    };
  }, [inView, released, ref]);

  const reserved = !inView || !released;
  return (
    <div
      ref={ref}
      className={reserved ? "lazy-reserve" : undefined}
      style={
        reserved
          ? ({
              "--lazy-sm": `${r.sm}px`,
              "--lazy-md": `${r.md}px`,
              "--lazy-lg": `${r.lg}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {inView ? <div ref={innerRef}>{children}</div> : null}
    </div>
  );
}
