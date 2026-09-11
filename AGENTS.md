# BRWAZWNEON — Agent Notes

Production e-commerce site (posters/frames/custom printing) at
https://brwazwneon.com. TanStack Start (React 19, Vite, Nitro SSR) +
Supabase (Postgres, Auth, Storage). Independent project — not managed by
any third-party app builder.

- This is a live, revenue-generating business. Treat database migrations,
  auth changes, and storage changes as production-critical: verify locally,
  prefer additive/idempotent changes, and never assume a migration file has
  been applied to the production database just because it exists in
  `supabase/migrations/`.
- See [TECHNICAL_CONTEXT.md](TECHNICAL_CONTEXT.md) for the full stack,
  schema, and business-logic overview.
