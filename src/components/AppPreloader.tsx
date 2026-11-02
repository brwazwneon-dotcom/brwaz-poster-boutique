import { useEffect, useRef, useState } from "react";
import { LOGO_URL } from "@/lib/site";
import { unhydratedControlsInViewport } from "@/lib/hydration-ready";

/**
 * Full-screen black preloader with the brand logo.
 * - Renders during SSR so it appears before hydration (no white flash) and covers the server-rendered page.
 * - It is removed as soon as the page can respond: every interactive control inside the viewport has been hydrated by React
 *   (see hydration-ready.ts). There is no minimum display time and no long fade; the page is never uncovered before it can be used.
 * - Bounded fallback: if readiness cannot be established (for example a visible link that React does not manage), the overlay is removed
 *   READY_FALLBACK_MS after it mounted. At that point React has already committed the root, so this can only expose controls that are
 *   still waiting inside a pending Suspense boundary. The previous worst case was 600 ms + 500 ms fade after the same moment.
 * - Failsafe if JavaScript never runs or hydration crashes: a CSS-only animation (rendered with the server HTML) hides the overlay
 *   after FAILSAFE_MS, so a broken script can no longer leave a black screen forever.
 * - Reduced motion: no fade and no pulsing logo.
 * - Every full page load starts covered (the overlay is part of the server HTML) and is uncovered by the same readiness rule. There is
 *   deliberately no "already shown in this session" shortcut: it would uncover the page without checking readiness.
 */
/** readiness poll interval */
export const READY_POLL_MS = 50;
/** longest wait for readiness after the overlay mounted */
export const READY_FALLBACK_MS = 900;
/** short fade once ready (skipped for reduced motion); pointer events pass through while it runs */
export const FADE_MS = 100;
/** CSS-only last resort when JavaScript never starts */
export const FAILSAFE_MS = 12_000;

export type PreloaderDismissReason = "ready" | "fallback";

export function AppPreloader() {
  // Default visible so SSR HTML includes the overlay.
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const startedAt = performance.now();
    let done = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;

    const dismiss = (reason: PreloaderDismissReason) => {
      if (done) return;
      done = true;
      try {
        // diagnostic only (lab measurements, support): how the overlay ended
        document.documentElement.dataset.brwPreloader = reason;
      } catch {
        /* noop */
      }
      let reduced = false;
      try {
        reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      } catch {
        /* noop */
      }
      if (reduced) {
        setVisible(false);
        return;
      }
      setFading(true);
      fadeTimer = setTimeout(() => setVisible(false), FADE_MS);
    };

    const check = () => {
      pollTimer = null;
      if (done) return;
      if (unhydratedControlsInViewport(document, rootRef.current).length === 0) {
        dismiss("ready");
        return;
      }
      if (performance.now() - startedAt >= READY_FALLBACK_MS) {
        dismiss("fallback");
        return;
      }
      pollTimer = setTimeout(check, READY_POLL_MS);
    };
    check();

    return () => {
      done = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="brwz-preloader"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: fading ? "none" : "auto",
        animation: `brwz-preloader-failsafe 1ms linear ${FAILSAFE_MS}ms forwards`,
      }}
    >
      <img
        className="brwz-preloader-logo"
        src={LOGO_URL}
        alt=""
        width={160}
        height={160}
        style={{
          width: "min(38vw, 180px)",
          height: "auto",
          filter: "drop-shadow(0 0 22px rgba(255,255,255,0.18))",
          animation: "brwz-preloader-pulse 1600ms ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes brwz-preloader-pulse {
          0%   { opacity: 0.85; transform: scale(0.96); }
          50%  { opacity: 1;    transform: scale(1.04); }
          100% { opacity: 0.85; transform: scale(0.96); }
        }
        @keyframes brwz-preloader-failsafe {
          to { opacity: 0; visibility: hidden; pointer-events: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .brwz-preloader { transition: none !important; }
          .brwz-preloader-logo { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
