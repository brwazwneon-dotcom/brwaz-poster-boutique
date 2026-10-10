import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { useCart } from "@/lib/cart";
import { usePricing } from "@/lib/use-settings";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { setCartFeedbackActive } from "@/lib/cart-feedback";
import {
  CART_ADDED_EVENT,
  motionAllowed,
  shippingProgress,
  type CartAddedDetail,
} from "@/lib/motion";

// Everything here animates transform / opacity only, runs after the page is interactive,
// and does nothing when motionAllowed() says no. See styles.css ("Motion layer").

const SHEET_MS = 3200;
const FLY_MS = 720;

/** The first sizeable image at or near the control the visitor just pressed. */
function sourceImage(from: Element | null): HTMLImageElement | null {
  let node: Element | null = from;
  for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
    const imgs = node.querySelectorAll("img");
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      if (r.width >= 60 && r.height >= 60 && r.bottom > 0 && r.top < window.innerHeight) return img;
    }
  }
  return null;
}

function visibleCartTarget(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>("[data-cart-target]")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export default function MotionEffects() {
  const { t, i18n } = useTranslation();
  const { total, count } = useCart();
  const pricing = usePricing();
  const flags = usePerformanceFlags();
  const [allowed, setAllowed] = useState(false);
  const [sheet, setSheet] = useState<{ title: string; key: number } | null>(null);
  const [shown, setShown] = useState(false);
  const pressed = useRef<{ el: Element; at: number } | null>(null);
  const hideTimer = useRef(0);

  // Decide once the page is up (never on the server, never before hydration).
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const compute = () =>
      motionAllowed({
        prefersReducedMotion: !!mq?.matches,
        emergencyFastMode: !!flags.emergency_fast_mode,
        safeMode: !!flags.safe_mode,
        search: window.location.search,
      });
    setAllowed(compute());
    const onChange = () => setAllowed(compute());
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, [flags.emergency_fast_mode, flags.safe_mode]);

  // ---- cards pop in as they scroll into view ----
  useEffect(() => {
    if (!allowed || typeof IntersectionObserver === "undefined") return;
    const root = document.documentElement;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-revealed", "");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );
    let raf = 0;
    let first = true;
    const scan = () => {
      raf = 0;
      for (const el of document.querySelectorAll(
        "[data-reveal]:not([data-revealed]):not([data-rv])",
      )) {
        const r = el.getBoundingClientRect();
        const inView =
          r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
        if (first && inView) {
          // Already on screen when the layer starts (first paint content): leave it alone, no flash.
          el.setAttribute("data-revealed", "");
        } else {
          el.setAttribute("data-rv", "");
          io.observe(el);
        }
      }
      if (first) {
        first = false;
        root.classList.add("motion-ok");
      }
    };
    scan();
    const mo = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      root.classList.remove("motion-ok");
      for (const el of document.querySelectorAll("[data-rv]")) el.removeAttribute("data-rv");
    };
  }, [allowed]);

  // ---- remember what was pressed, so the poster can fly from it ----
  useEffect(() => {
    if (!allowed) return;
    const down = (e: Event) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el) pressed.current = { el, at: Date.now() };
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") down(e);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [allowed]);

  const fly = useCallback((detail: CartAddedDetail) => {
    const target = visibleCartTarget();
    if (!target || typeof Element.prototype.animate !== "function") return;
    const recent =
      pressed.current && Date.now() - pressed.current.at < 4000 ? pressed.current.el : null;
    const img = sourceImage(recent);
    const src = img ? img.currentSrc || img.src : detail.image;
    if (!src) return;
    const from = img ? img.getBoundingClientRect() : recent?.getBoundingClientRect();
    if (!from) return;
    const to = target.getBoundingClientRect();
    const W = 64;
    const H = 96;
    const x0 = from.left + from.width / 2 - W / 2;
    const y0 = from.top + from.height / 2 - H / 2;
    const x1 = to.left + to.width / 2 - W / 2;
    const y1 = to.top + to.height / 2 - H / 2;
    const s0 = Math.min(2.2, Math.max(0.6, from.width / W));
    const el = document.createElement("img");
    el.src = src;
    el.alt = "";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;object-fit:cover;border-radius:3px;z-index:80;pointer-events:none;will-change:transform,opacity;box-shadow:0 10px 24px rgba(0,0,0,.45);border:3px solid #111`;
    document.body.appendChild(el);
    const lift = Math.max(40, Math.abs(y1 - y0) * 0.25);
    const anim = el.animate(
      [
        { transform: `translate(${x0}px,${y0}px) scale(${s0})`, opacity: 1 },
        {
          transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - lift}px) scale(.8) rotate(-8deg)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: `translate(${x1}px,${y1}px) scale(.22) rotate(6deg)`, opacity: 0.25 },
      ],
      { duration: FLY_MS, easing: "cubic-bezier(.5,0,.3,1)" },
    );
    const done = () => {
      el.remove();
      target.animate?.(
        [{ transform: "scale(1)" }, { transform: "scale(1.28)" }, { transform: "scale(1)" }],
        { duration: 420, easing: "cubic-bezier(.2,1.6,.4,1)" },
      );
    };
    anim.onfinish = done;
    anim.oncancel = () => el.remove();
  }, []);

  // ---- an item was added: fly the poster to the cart, slide the sheet up, then down ----
  useEffect(() => {
    if (!allowed) return;
    setCartFeedbackActive(true);
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent<CartAddedDetail>).detail;
      if (!detail) return;
      fly(detail);
      setSheet({ title: detail.title, key: Date.now() });
      setShown(true);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setShown(false), SHEET_MS);
    };
    window.addEventListener(CART_ADDED_EVENT, onAdded);
    return () => {
      window.removeEventListener(CART_ADDED_EVENT, onAdded);
      window.clearTimeout(hideTimer.current);
      setCartFeedbackActive(false);
    };
  }, [allowed, fly]);

  if (!allowed || !sheet) return null;

  const threshold = pricing.freeShippingThreshold;
  const p = shippingProgress(total, threshold);
  const isAr = (i18n.language ?? "ar").startsWith("ar");
  return (
    <div
      className={`brw-sheet${shown ? " is-open" : ""}`}
      role="status"
      aria-live="polite"
      dir={isAr ? "rtl" : "ltr"}
      onPointerEnter={() => window.clearTimeout(hideTimer.current)}
      onPointerLeave={() => {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setShown(false), 1200);
      }}
    >
      <span className="brw-sheet-check" aria-hidden="true">
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">
          {t("cart.sheetAdded")} <span className="font-normal opacity-70">· {sheet.title}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] opacity-80">
          <span className="brw-sheet-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${p.fraction})` }} />
          </span>
          <span className="leading-tight">
            {p.unlocked ? t("cart.sheetFree") : t("cart.sheetRemaining", { amount: p.remaining })}
          </span>
        </div>
      </div>
      <Link to="/cart" className="brw-sheet-link" onClick={() => setShown(false)}>
        {t("cart.sheetView")} ({count})
      </Link>
    </div>
  );
}
