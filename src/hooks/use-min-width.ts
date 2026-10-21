import { useEffect, useState } from "react";

/**
 * True while the window is at least `px` wide. Used to switch a wide table to a card list on phones and small
 * screens. Without matchMedia (tests, very old browsers) it answers true, i.e. "wide".
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" || !window.matchMedia ? true : window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
