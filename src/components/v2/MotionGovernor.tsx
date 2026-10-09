import { useEffect } from "react";
import { usePerformanceFlags } from "@/lib/performance-flags";

/** Keeps the decorative motion layer from costing anything where it would hurt:
 *  - Emergency Fast Mode / Safe Mode (admin Stability tab) switch the same off for everyone;
 *  - low-end devices (<=4 cores, <=4 GB RAM) or Save-Data: the continuous layers (falling frames, marquee)
 *    are turned off (`v2-lite` on <html>); one-shot effects (wall drop, marker, confetti) still play;
 *  - while the page is scrolling: running loops are paused (`v2-scrolling`), so scroll stays smooth.
 *  Pure class toggles on <html>; the CSS lives in styles/v2.css. */
export function MotionGovernor() {
  // Admin kill switch: Stability tab -> Emergency Fast Mode / Safe Mode also turns the continuous motion off.
  const perf = usePerformanceFlags();
  const forceLite = perf.emergency_fast_mode || perf.safe_mode;
  useEffect(() => {
    const root = document.documentElement;
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const lowEnd =
      (nav.hardwareConcurrency ?? 8) <= 4 ||
      (nav.deviceMemory ?? 8) <= 4 ||
      nav.connection?.saveData === true;
    if (lowEnd || forceLite) root.classList.add("v2-lite");

    let timer = 0;
    const onScroll = () => {
      if (!root.classList.contains("v2-scrolling")) root.classList.add("v2-scrolling");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => root.classList.remove("v2-scrolling"), 180);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
      root.classList.remove("v2-scrolling", "v2-lite");
    };
  }, [forceLite]);
  return null;
}
