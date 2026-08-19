import { useEffect, useState } from "react";
import { LOGO_URL } from "@/lib/site";

/**
 * Full-screen black preloader with the brand logo.
 * - Renders during SSR so it appears before hydration (no white flash).
 * - Shows for min 600ms / max 2500ms.
 * - Only shown once per session (sessionStorage.preloaderShown).
 * - Fades out smoothly, then unmounts.
 */
const SESSION_KEY = "preloaderShown";
const MIN_MS = 600;
const MAX_MS = 2500;
const FADE_MS = 500;

export function AppPreloader() {
  // Default visible so SSR HTML includes the overlay.
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Skip entirely if already shown this session.
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* noop */
    }
    if (alreadyShown) {
      setVisible(false);
      return;
    }

    const start = performance.now();
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      const elapsed = performance.now() - start;
      const wait = Math.max(0, MIN_MS - elapsed);
      window.setTimeout(() => {
        setFading(true);
        window.setTimeout(() => setVisible(false), FADE_MS);
        try {
          sessionStorage.setItem(SESSION_KEY, "1");
        } catch {
          /* noop */
        }
      }, wait);
      if (maxTimer) window.clearTimeout(maxTimer);
    };

    // Hard cap.
    const maxTimer = window.setTimeout(finish, MAX_MS);

    // Trigger finish once the page paints its first meaningful frame.
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Two RAFs = layout + paint of the actual app content.
        finish();
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (maxTimer) window.clearTimeout(maxTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
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
      }}
    >
      <img
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
      `}</style>
    </div>
  );
}
