import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

/** Scroll reveal. SSR/no-JS/reduced-motion render fully visible; the element is only
 *  hidden after hydration if it is still below the fold, so it can never delay LCP. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [state, setState] = useState<{ armed: boolean; shown: boolean }>({
    armed: false,
    shown: true,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.95) return; // already in view: never hide
    setState({ armed: true, shown: false });
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState({ armed: true, shown: true });
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, "data-armed": state.armed, "data-shown": state.shown } as const;
}

export function Reveal({
  as,
  delay = 0,
  className = "",
  children,
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const Tag = (as ?? "div") as ElementType;
  const { ref, ...data } = useReveal<HTMLElement>();
  return (
    <Tag
      ref={ref}
      className={`v2-reveal ${className}`}
      style={{ "--v2-delay": `${delay}ms` } as CSSProperties}
      {...data}
    >
      {children}
    </Tag>
  );
}
