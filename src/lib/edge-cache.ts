import { setResponseHeader } from "@tanstack/react-start/server";

/**
 * Lets Vercel's CDN keep the answer of a public, read-only server function for a short while.
 * Without it every visitor's request went all the way to the function and the database (~0.3-0.7 s,
 * far more over mobile data); with it most requests are answered from the edge close to the visitor.
 * Browsers still revalidate (max-age=0), so a change made in the admin shows up within `sMaxAge`
 * seconds, and a stale copy is served instantly for up to `swr` seconds while a fresh one is fetched.
 *
 * Only for data that is the same for every visitor. Never call this from a function that reads
 * cookies / the signed-in admin, or from a write.
 */
export function edgeCache(sMaxAge = 60, swr = 600): void {
  try {
    setResponseHeader(
      "Cache-Control",
      `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    );
  } catch {
    // Not inside a request (unit tests, direct calls): nothing to set.
  }
}
