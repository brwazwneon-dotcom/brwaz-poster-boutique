import { useEffect, useRef, useState } from "react";

type Options = {
  threshold?: number | number[];
  rootMargin?: string;
  /** Disconnect after first intersection (default true). */
  once?: boolean;
};

/**
 * Lightweight, GPU-friendly in-view hook.
 * - Single IntersectionObserver per element
 * - State flip batched inside requestAnimationFrame to avoid layout thrash
 * - Marks itself `true` synchronously when IO is unavailable (SSR / older UAs)
 */
export function useInView<T extends Element = HTMLElement>(
  { threshold = 0.15, rootMargin = "0px 0px -60px 0px", once = true }: Options = {},
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    let rafId = 0;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => setInView(true));
          if (once) io.disconnect();
        } else if (!once) {
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => setInView(false));
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      io.disconnect();
    };
  }, [threshold, rootMargin, once]);

  return [ref, inView] as const;
}