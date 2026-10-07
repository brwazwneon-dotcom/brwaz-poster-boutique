# BRWAZWNEON V2 — implementation report (slice 1)

No deploy, no production DB access (local build/QA used dummy Supabase env pointing at a closed port).
No migrations added to `supabase/migrations`; SQL is proposal-only in `docs/v2/proposed-sql/`.

## Delivered
| Area | Change |
|---|---|
| Design/motion layer | `src/styles/v2.css` (tokens, `v2-reveal`, `v2-card`, `v2-wall`, bottom nav, `v2-pop`); transform/opacity only, <=420ms, fully off under `prefers-reduced-motion` |
| Motion primitive | `components/v2/Reveal.tsx` — IntersectionObserver; content visible on SSR/no-JS/reduced-motion; never hides above-the-fold (cannot affect LCP) |
| Product card | hover "frame reveal" (desktop pointer only) via `v2-card` |
| Mobile nav | `MobileBottomNav` (Home/Shop/Search/Saved/Cart + count); hidden on admin/auth/cart/category/poster so it never collides with the sticky purchase bars; floating widgets offset via existing `--sticky-bar-h` |
| Product page | NEW `/poster/$id`: frame/color/size/qty, live display price (from existing `usePricing`), shipping/payment/quality signals, size guide, related posters, mobile sticky Add-to-cart, cart pop feedback |
| Room/offers visuals | `PosterWall` + `FrameWall` home section: 20x30 = 6 frames (3+3), 30x40 = 4 in one row; identical cells and one gap token; renders nothing if fewer posters than slots (no ragged wall); reuses `FramePreview`, one 6-row query, no new assets |
| Homepage | Registry order changed to V2 journey (hero → collections → trending → best sellers → sets → room → frame wall → categories → custom → wall of inspiration → reviews → trust → FAQ). Applies to fresh installs and appends `frame-wall` for existing configs; the live DB-saved order is untouched |
| Search | Debounce 120→220ms, cached by react-query (already), no-result recovery chips, client tries `search_posters_v2` and falls back to v1 |
| Proposed SQL | `01_search_posters_v2.sql` (Arabic normalization, token-AND, prefix/exact boosts, typo tolerance; additive) and `02_orders_idempotency_and_price_check.sql` |

## Not changed on purpose
Checkout logic (`cart.tsx`), image pipeline, SafeImage, perf flags, backups, auth, existing migrations.
Reason: the checkout has no server-side price authority; fixing it requires DB changes needing your approval (see `02_…sql`). UI-only changes there add risk without fixing it.

## Verification
- `vite build` OK. Entry JS gz 196,129 → 196,857 B (+0.4%); CSS gz 31.85 → 32.65 KB; total JS gz +~3.4 KB (new lazy route/section chunks only).
- Playwright (dummy backend): `/`, `/poster/:id` (not-found state), `/search`, `/cart` at 390px; `/` at 320, 390, 1440: horizontal overflow 0px everywhere; bottom nav visible <768px only; zero non-network console errors; reduced-motion context loads fine.
- Unit tests: 42 pass; `PosterPerformanceStats.test.tsx` fails to load (missing `@testing-library/dom` in this sandbox install — pre-existing, unrelated).
- `tsc`: no errors in new/changed files (repo has ~73 pre-existing type errors elsewhere).
- NOT verified: visuals with real data (needs Supabase), Lighthouse/LCP before-after, real-device keyboard/AT pass, RTL visual pass.

## Still to do (recommended order)
1. Review/apply `01_search_posters_v2.sql` on a Supabase branch; compare results to v1.
2. Admin V2 (ops overview, product health, system health consolidation) — not started.
3. Checkout UI split + order protection (needs SQL approval).
4. Restyle hero/section headers with `v2-eyebrow`/`Reveal` across existing sections; Lighthouse before/after with real data.
5. Link product cards to `/poster/$id` (currently the page is reachable by URL; card behavior unchanged to protect the selection/bundle flow).
