import { createFileRoute, redirect } from "@tanstack/react-router";

// Superseded by /photo-printing, which reuses this exact upload/AI-enhance/
// package/checkout engine inside a full landing + shop experience. Kept as
// a redirect (not deleted) so old links/bookmarks to /photo-4x6 keep
// working instead of 404ing.
export const Route = createFileRoute("/photo-4x6")({
  validateSearch: (s: Record<string, unknown>): { from?: string } => ({
    from: typeof s.from === "string" ? s.from : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/photo-printing", search: search.from ? { from: search.from } : {} });
  },
});
