# Site Upgrade Plan — Performance, Loading Bugs, SEO

Scope: no design/branding/feature/product/collection removal. Fix loading bugs, tighten performance, and complete SEO metadata across routes.

---

## 1) Fix "Loading Posters… / Loading Sets…" bug (highest priority)

**Investigate first** (before code changes):
- Open `src/routes/category.$slug.tsx`, `src/routes/sets.tsx`, `src/routes/best-sellers.tsx`, `src/routes/trending.tsx` and the poster fetching hooks (`use-categories.ts`, `public-images.ts`).
- Reproduce on `/category/movies` with Playwright, capture console + network to see whether the query stays `pending`, errors, or returns empty.

**Likely fixes** (apply based on what the trace shows):
- Ensure poster queries do NOT depend on `useAuthReady()` gating — public storefront reads must run without a session.
- Add explicit `isError` UI + a hard timeout fallback so the card never shows "Loading…" forever.
- Convert first-page poster fetch to `loader` + `ensureQueryData` so SSR renders products with data (fixes both the loading bug and SEO #3).
- Guarantee `useQuery` always has an `enabled` condition that resolves; drop any stale dependency on user id for public lists.

---

## 2) Performance

Targets: LCP < 2s, FCP < 1s, CLS < 0.05, PSI 95+.

Changes:
- **LCP image**: preload only the current hero (route-level `head().links` `rel=preload as=image fetchpriority=high`); remove any global preloads.
- **Images**: keep display-variant cascade (already done); add `width`/`height` on `<SafeImage>` usages that are missing them to eliminate CLS; use `fetchpriority="high"` on above-the-fold hero, `loading="lazy"` on everything else (already default).
- **Code-splitting**: audit `src/routes/__root.tsx` for eagerly imported heavy components (`SalesNotifications`, `FloatingOfferBubble`, `InstallPrompt`, `BehaviorBoot`, `AppPreloader`) — wrap in `lazy()` + `Suspense` where not already.
- **Fonts**: swap Google Fonts `<link>` for `display=swap` (already present) + add `preconnect` (already present). Consider self-hosting Bebas Neue + Inter as `.woff2` via `lovable-assets` to cut Google Fonts RTT.
- **Analytics defer**: already using `requestIdleCallback` — keep, but ensure Meta Pixel script does not load on admin routes (already handled).
- **React**: add `React.memo` on `ShopByCollection`, `TrendingNow`, `BestSellers` card items; stabilize props with `useMemo`/`useCallback` where re-render is hot.
- **Virtual scrolling**: add `@tanstack/react-virtual` to the category grid when items > 60 to keep DOM light.
- **Skeletons**: replace spinner "Loading Posters…" text with skeleton grid (matches design, prevents CLS).
- **Compression / caching**: Brotli + long-lived asset caching are already handled by the Lovable edge; no code change needed. Confirm SW caching rules in `vite.config.ts` (already generateSW with sensible runtimeCaching).
- **Bundle audit**: run `bun run build` and inspect chunk sizes; split `src/routes/admin.tsx` from the public bundle (already done via `admin.lazy.tsx`).

---

## 3) SEO

**Per-route `head()`** (each unique, no duplicates):
- `/` — home (already set)
- `/category/$slug` — dynamic title/desc/canonical/og from category + first poster image as `og:image`
- `/offers`, `/best-sellers`, `/trending`, `/sets`, `/custom-design`, `/photo-printing`, `/photo-4x6`, `/search`, `/wishlist`, `/cart`, `/auth`, `/landing/$audience` — unique title + description + canonical + og
- Poster detail (if any) — Product schema JSON-LD with price, availability, image, AggregateRating when reviews exist

**Structured data**:
- Root: `Organization` + `WebSite` (already present)
- Category route: `BreadcrumbList` + `ItemList` of posters
- Poster: `Product` + `Review`/`AggregateRating` when data available

**Server-side render products**:
- Category loader calls `ensureQueryData` for first N posters so HTML ships with product links + images crawlable.

**Sitemap / robots**:
- `sitemap.xml` already dynamic — extend to include `/offers`, `/best-sellers`, `/trending`, individual posters (top N by `is_visible`).
- Update `public/robots.txt` `Sitemap:` URL to `https://brwazwneon-com.lovable.app/sitemap.xml` (currently points to old preview host).

**Image alt text**:
- Audit `SafeImage` call sites; ensure `alt` is always set from poster/category title, never empty.

---

## Delivery order

1. Reproduce + fix the "Loading Posters/Sets" bug (unblocks users immediately).
2. Category loader → SSR products (fixes SEO #3 and improves LCP simultaneously).
3. Per-route `head()` metadata + JSON-LD sweep.
4. Skeletons + memoization + LCP preload + image dimensions.
5. Sitemap + robots.txt correction.
6. Verify with a production build + Playwright PSI-style check on `/`, `/category/movies`, `/offers`.

## Technical notes

- All poster queries stay on `supabase` publishable client; never gate public reads on auth.
- Do NOT add new dependencies beyond `@tanstack/react-virtual` (only if grid >60 items).
- Keep all existing performance flags (`performance-flags.ts`); do not re-enable Emergency Fast Mode by default.
- No changes to admin bundle, no changes to CAPI / Pixel behavior, no changes to Supabase schema unless a missing index is proven by `slow_queries`.

Approve to proceed, or tell me which section to start with / skip.
