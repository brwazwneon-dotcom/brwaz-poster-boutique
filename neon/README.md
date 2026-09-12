# BRWAZWNEON 2.0 — Neon migration, Phase 1

## What's here
- `schema.sql` — the Phase 1 database schema (categories, posters,
  image_variants, site_settings, orders, admin_users). Covers what the
  storefront + a basic admin need to launch. Everything else the old
  system had is Phase 4, added after launch.

## Architecture decision: how the frontend talks to the database

The current frontend calls Supabase directly from the browser
(`supabase.from("posters").select(...)`), which only works because
Supabase exposes a public REST API (PostgREST) with row-level security
enforcing who can read/write what. Neon does not have that layer — it is
just Postgres. So on Neon, every data access moves to a TanStack Start
server function that holds the one trusted database connection:

```
Browser (React component)
   -> calls a server function (e.g. getPostersByCategory)
        -> server function queries Neon directly
        -> returns only the shape the UI needs
```

This is more secure by construction (no database credentials or query
structure ever reach the browser) and matches what was already
recommended during the security audit — but it does mean every
`supabase.from(...)` call site in the kept frontend gets replaced with a
call to a purpose-built server function during Phase 2. That rewrite is
mechanical (the data shape doesn't change, just where the query runs)
but it touches many files, which is why Phase 2 is budgeted at several
days rather than being part of this same step.

## Your action: create the Neon project

1. Go to **[neon.tech](https://neon.tech)** and sign up (free tier is
   fine to start).
2. Click **New Project**. Name it `brwazwneon` (or anything you like).
   Pick a region close to Egypt if offered (e.g. an EU region).
3. On the project dashboard, find **Connection Details** /
   **Connection String** and copy it. It looks like:
   `postgresql://<user>:<password>@<host>/<dbname>?sslmode=require`
4. **Do not paste that string into chat.** Instead, add it to
   `.env.local` in the project root as:
   ```
   NEON_DATABASE_URL="paste-it-here"
   ```
5. Tell me it's there — I'll read it directly from the file.

## Next steps (once the connection string is in place)
1. Apply `schema.sql` to the new Neon database.
2. Verify the tables/triggers exist correctly (read-only checks, same
   pattern as the Supabase security migrations).
3. Start Phase 2: rebuild the storefront's data-fetching through server
   functions, one route at a time, starting with the homepage and
   category pages.
