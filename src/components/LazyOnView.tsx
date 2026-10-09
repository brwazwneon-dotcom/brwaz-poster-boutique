import { useInView } from "@/hooks/use-in-view";
import type { ReactNode } from "react";

/**
 * Defers rendering of below-the-fold sections until they scroll near the
 * viewport. Reserves vertical space via `minHeight` so there is no layout
 * shift. Keeps the homepage's initial paint small on mobile.
 */
export function LazyOnView({
  children,
  minHeight = 480,
  rootMargin = "600px 0px",
}: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin, threshold: 0 });
  return (
    <div ref={ref} style={inView ? undefined : { minHeight }}>
      {inView ? children : null}
    </div>
  );
}
