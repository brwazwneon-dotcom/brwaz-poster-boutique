import type { ReactNode } from "react";

// Sizes like "30 x 40 cm" and dimensions like "30×40" are left-to-right text.
// Inside an Arabic (right-to-left) page the browser reorders them ("x 40 cm 30"),
// so they are isolated as their own LTR run. Use this for every displayed size.
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}

/** Same isolation for plain-text places that can't hold an element (e.g. <option>). */
export const ltrIsolate = (text: string) => `\u2066${text}\u2069`;
