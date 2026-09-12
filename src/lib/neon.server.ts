import { neon } from "@neondatabase/serverless";

// HTTP-based Neon client — works in any runtime (Node dev server,
// Cloudflare Workers in production) since it talks to Neon over fetch
// instead of a raw TCP socket, which Workers can't open. Cheap to create
// per call (no persistent connection to manage), so no caching needed.
//
// Server-only: never import this from a file that ships to the browser.
// TanStack Start's server-function boundary is what keeps it there.
export function sql() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL is not configured");
  return neon(url);
}
