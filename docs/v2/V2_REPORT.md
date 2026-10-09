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

## Slice 2 additions
- **Admin V2 "Overview" tab** (new default admin landing, `components/admin/OverviewTab.tsx`): today / 7d / 30d revenue and order counts, avg order value, open orders, Instapay awaiting payment (flagged), poster totals/hidden/no-image/needs-review, recent-orders table (carts grouped from per-line order rows), orders-by-status, shortcuts to System Health, Backups, Image health, Products, Live visitors, Error logs. Read-only, uses the `real_orders` view (test orders excluded), 60s refresh, error state. Registered in nav, i18n (en/ar) and types; existing tabs untouched.
- Homepage sections below the first two now fade/slide in via `Reveal` (never hides in-view content).
- Not verifiable here: Overview needs an authenticated admin session + real data.

## Slice 3: checkout / cart (logic and pricing untouched)
- **Bug fix: `/order-confirmed` did not exist.** After a successful order (when the post-order message is enabled) checkout navigated to a missing route. Added `routes/order-confirmed.tsx` (next steps, WhatsApp, continue shopping; bilingual, noindex).
- **Bug fix: bundle orders never saved their posters.** `cart.tsx` read `poster.id` but `BundlePoster` has `posterId`, so 6-pack/4-pack orders skipped `order_posters` rows (admin couldn't see the images). One-token fix.
- **No lost state:** delivery fields (name/phone/governorate/address) persist locally for 7 days (`lib/checkout-draft.ts`), cleared on success. Payment data/screenshots never stored. Verified: refresh restores the phone.
- **Mobile sticky total + Confirm bar** (<1024px) that calls the same guarded `handlePlaceOrderClick` (double-submit ref intact); extra bottom padding so it never covers fields.
- Server-side price authority / idempotency still needs the SQL in `proposed-sql/02` (not applied).
- Admin: bulk poster edit (move/hide/feature/delete), grouped orders and WhatsApp actions already existed, so I did not duplicate them.

## Slice 4: polish, a11y, QA
- 16 section eyebrows unified to `v2-eyebrow`; Arabic-safe (no letter-spacing/uppercase that breaks Arabic joining; same for bottom-nav labels).
- Keyboard: skip-to-content link (`#main`) and a global keyboard-only focus ring. Verified: first Tab focuses the skip link, Enter jumps to `#main`.
- Hero motion intentionally NOT added: hero is the LCP element and an opacity-0 entrance would delay it.
- **Pre-existing issue (not from V2):** Arabic home page logs React error #418 (hydration text mismatch). Reproduced identically on untouched `main`. Likely language detection (SSR vs `i18nextLng`); needs its own investigation.
- Security review of the V2 diff: poster route validates UUID and filters `hidden=false`; Overview reads via `security_invoker` view (admin RLS applies) and is only mounted after the admin check; `search_posters_v2` is read-only, `SECURITY DEFINER` with pinned `search_path`; checkout draft stores only the 4 delivery fields locally. No secrets, no new write paths to the database.

## Slice 5: visual QA with mocked data (no real backend)
Browser-level Supabase mocks (Playwright route interception) were used to render real components.
- Frame wall measured at 1440px: 6 cells all 229×344, 24px gaps, 3 top + 3 bottom; at 390px: 6 cells 109×163, 12px gaps. 30×40 tab: 4 equal cells in one row (208×277 desktop, 79×105 mobile). No horizontal overflow.
- Poster page found two visual defects, both fixed: (1) on mobile the floating WhatsApp button overlapped the sticky Add-to-cart bar (now lifts via `--sticky-bar-h`); (2) on desktop the image was oversized (now max 30rem and sticky).
- Caveat: FramePreview mockups include a wall backdrop, so each wall cell reads as a tile; switching to `bare` previews is a design choice for later.

## Slice 6: radical visual redesign — theme "Poster Wall" (new default)
Concept: editorial print-shop. Warm paper (#F3EFE6) + ink (#0E0E0E), logo yellow/cyan accents, square corners, hard-edged "printed" frames with offset shadows, yellow marker under section titles, ink rules between sections with alternating darker paper bands, cinematic dark hero kept on the light page, ink footer with yellow rule, ink mobile bottom nav.
- Implemented as a real theme: `SITE_THEMES["poster-wall"]` + `[data-site-theme="poster-wall"]` block in `styles/v2.css` (static on `<html>` so first paint is correct), default via `DEFAULT_THEME_ID`. Existing themes (incl. dark Classic) remain selectable in Admin → Appearance.
- Legacy handling: a stored `brw-classic` with no admin `theme_settings` record (the old implicit default) maps to Poster Wall; an explicit admin choice is respected. The head script no longer flashes stored Classic vars.
- Admin console is pinned to the dark console theme (`ThemeBoot`) because it was not verified in the light theme.
- Verified (mock data): desktop + mobile home, product page, cart/checkout; no overflow; contrast tokens unit-tested (AA). Not verified: admin in light theme (intentionally pinned), every secondary page (category, search, custom-design, photo-printing), RTL visuals.
- Second agent: a separate session (`session_015KtAbLfGULTrwGWUzKfdsw`) was opened on `main` for edits to the old site, with instructions not to touch this branch and not to deploy.

## Slice 7: theme QA across pages + RTL (bugs found and fixed)
- **Pre-existing RTL bug (also on `main`/old site):** `FramePreview` artwork was shifted/clipped on Arabic pages because `.frame-opening { position: relative }` in `styles.css` out-ranks the `absolute` utility; in RTL the in-flow start edge flips so the `left:%` offset lands wrong. Fixed by pinning `position:absolute` inline in `FramePreview.tsx`; English output unchanged (verified by screenshots).
- Closed mobile menu drawer leaked its `shadow-2xl` onto the left screen edge (invisible on dark, a grey stripe on paper). Shadow now only when open.
- My `header` theme rule also hit the product page `<header>` (stray rule under the price); scoped to `header.sticky`.
- Poster page localized (ar/en): labels, price currency, delivery lines, toasts.
- Verified with mock data at 390px: custom-design, photo-printing, search, offers, sets, footer, product page (en + ar), cart; desktop product page en + ar (layout mirrors correctly). No horizontal overflow.

## Slice 8: category page + card → product page
- Category page verified in the new theme (mock categories/posters, mobile + desktop): framed ink-bordered cards, yellow active sort chip, no overflow.
- Product cards now carry a small "View poster" icon (always visible on touch, on hover/focus on desktop) linking to `/poster/$id`; click does not toggle the card's selection, so the existing multi-select / bundle flow is untouched. Verified: 8 links, click navigates to the right poster.

## Slice 9: Search V2 SQL actually tested (scratch PostgreSQL 16, not production)
Ran the repo's real `search_posters` v1 and the proposed v2 side by side. The test found and fixed two defects in my first draft: lost typo tolerance (`spidermn`, `batmn`) and ~4× slower than v1 at 10k rows. New `03_search_v2_indexed.sql` (precomputed normalized columns + trigram GIN, trigger-maintained) is ~90–105 ms at 10k rows vs ~130 ms for v1, handles typos, "spiderman" ↔ "Spider-Man", Arabic hamza/ya folding, excludes hidden posters. Full table in `docs/v2/proposed-sql/search_v2_test_results.md`. Apply order for the owner: 01 → 03 (on a Supabase branch first; 03 backfills every poster row once). Nothing applied anywhere.

## Slice 10: order protection SQL written and tested (scratch PostgreSQL)
Found from the repo's own migrations: anonymous visitors can currently insert an order with `total_price = 0` and `payment_status = 'verified'`. `02_orders_idempotency_and_price_check.sql` is now a real BEFORE INSERT guard (exempts admin/service_role; blocks forged payment state, inconsistent totals, absurd quantities, and prices below a configurable % of list). Ships in `log` mode first. 13-case test table in `order_guard_test_results.md`; testing found and fixed two bugs in my draft (SECURITY DEFINER hid the caller role; array concat error). Not applied anywhere. It is a floor/consistency check, not full server-side pricing.

## Slice 11: Arabic hydration + language SSR — root cause fixed, measured
- **Root cause:** the server always rendered English (`<html lang="en">`) even for `Accept-Language: ar`, while the client's detector picked Arabic before hydrating. For every Arabic visitor the first client render differed from the server HTML, so React discarded the server DOM and rebuilt the page (React #418).
- **Fix (two layers):** (1) the server now chooses the language per request — cookie `brw_lang`, else `Accept-Language` (first supported tag; none supported → `ar`; no header at all → `en`, so crawlers/bots see the same HTML as before) — via a root loader (`lib/request-lang.ts`), and renders with a per-request i18n instance; (2) the client starts in the server's language by reading `<html lang>`, then `LanguageBoot` reconciles with the visitor's saved preference (localStorage) and writes the cookie, so only a visitor with an old localStorage preference and no cookie sees one transition, on the first visit. A manual language switch persists to cookie + localStorage.
- **Measured** (Playwright, Pixel-like 390px, 4× CPU throttle, mock backend, `main` vs this branch):
  - Arabic visitor (`Accept-Language: ar`): hydration errors 1 → **0**; server `<main>`/`<header>` DOM preserved (baseline: replaced); CLS 0.142 (first attempt, language switched after hydration) → **0.004**.
  - Visits 2 and 3 of a visitor with an old localStorage preference: 0 hydration errors; language toggle updates html lang/dir, cookie and localStorage; reload keeps the choice.
  - English visitors unchanged.
- Note on the metric: the baseline's low Arabic CLS (0.003) was an artifact of React replacing nodes; field CLS would have shown the language flip. Server-side language removes the flip itself.
- 5 unit tests for `resolveRequestLang`.

## Slice 12: performance BEFORE / AFTER (local, mock backend, 4× CPU throttle, 390px, median of 5–7 runs; indicative, not Lighthouse)
| | main (before) | this branch (after) |
|---|---|---|
| LCP (hero image) | 796–816 ms | 708–772 ms (not slower; earlier +40–70 ms readings were noise/order of sections, rechecked with 7 runs and long-task data) |
| FCP | ~724 ms | ~676 ms |
| CLS, English | 0.001–0.006 | 0.001–0.004 |
| CLS, Arabic | 0.003 | 0.004 (after server-side language) |
| CSS (raw, home) | 31.3 KB | 33.1 KB (+1.8 KB: V2 theme) |
| JS requested on home (raw) | ~343–357 KB / 62 files | ~350–362 KB / 66–67 files (+~2–5%: V2 section chunks; entry chunk +0.6% gz) |
Not measured: real Lighthouse, real network/CDN, real data. Re-run on a Vercel preview before any release.

## Slice 13: full-site sweep + translation integrity (pre-existing bugs, also on `main`)
- Sweep: 19 public routes (incl. 404, auth, landing, offline) × 7 viewports (320, 390, 412, 430, 1366, 1440, 1920) × en/ar = 266 combinations with mocked backend: **0 horizontal overflow, 0 JS errors**.
- **71 translation keys** used by the storefront were missing from `en.json` (17 also missing from `ar.json`), so English visitors saw Arabic text (e.g. checkout "Confirm order", "Placing your order…", payment/screenshot hints) and some pages showed raw keys (`bestSellers.noResults`). All added (en + ar).
- **35 Arabic strings used single-brace placeholders** (`{fee}`, `{count}`) which i18next never interpolates, so Arabic customers saw the literal text (shipping banner, subtotal, offer discounts, photo-printing, …). Converted to `{{ }}` (2 in en). Verified all call sites pass the variables; `cart.doubleFaceTape` (code appends the numbers itself) now holds only the label.
- New `src/lib/locales.test.ts` guards: every storefront `t('a.b')` without inline default exists in ar+en; no single-brace placeholders; ar/en placeholder names match. Admin uses its own dictionary (`admin-i18n`) and is excluded.

## Slice 14: accessibility (axe-core WCAG 2.0/2.1 A+AA, 11 pages × en/ar × 390/1440 px, mocked data)
Before: 1 critical + 4 serious rule violations; no colour-contrast violations (the Poster Wall theme passes). After: **0 violations**.
- `select-name` (critical): category/sort selects on Trending and Best Sellers had no accessible name → `aria-label` (new locale keys `common.categoryFilter`, `common.sortBy`).
- `nested-interactive`: product cards were `role="button"` containing the wishlist button and the new "view" link → card selection is now a real `<button>` overlay with the heart/link as siblings. Verified: mouse click, Space and Enter toggle selection (`aria-pressed`).
- `aria-hidden-focus`: closed mobile menu was `aria-hidden` but focusable → `inert` while closed.
- `label-content-name-mismatch`: mobile cart link now uses visible-text naming (sr-only "Cart" + the count).
- `scrollable-region-focusable`: horizontal scrollers without focusable content (Highlights, Customer Reviews, category chips) are keyboard-focusable.
Not covered: screen-reader testing on real devices, admin console, reduced-motion visual review beyond CSS (`prefers-reduced-motion` disables all V2 motion).

## Slice 15: motion graphics ("things falling and moving")
- `components/v2/Motion.tsx` + CSS in `styles/v2.css`: (1) **falling posters/frames** (pure CSS, two nested animations: fall + sway/rotate, deterministic positions so no hydration mismatch) behind the hero (edges only, behind the text/buttons), behind "Build your wall", (2) **two crossing marquee bands** (yellow/ink, opposite directions, new homepage section `marquee` after the hero, admin-reorderable, Arabic variant), (3) **frames drop onto the wall** with a small overshoot and stagger when the wall scrolls into view, (4) **yellow marker is drawn in** under section titles on reveal, (5) **confetti shower** on the order-confirmed page.
- Performance guards: transform/opacity only, ≤ 56 elements on a page, animation paused while off-screen (IntersectionObserver), items hidden on phones (every 3rd), nothing on the LCP image, none on product grids. `prefers-reduced-motion`: falling layers hidden, marquee static, wall/marker animation off (verified).
- Re-measured after adding it: LCP ~670–740 ms (not slower), CLS 0.004, axe 0 violations, 266-combination sweep 0 overflow / 0 errors.
- Screen recording of the motion (mock data): `brwaz-v2-motion.mp4` (not committed; sent in chat).

## Slice 16: runtime cost of the motion layer (measured) + governor
Load metrics are unaffected (see slice 15), but the continuous animations cost something while running. Measured in a deliberately pessimistic setup (headless Chromium, **no GPU**, CPU throttled 6× ≈ low-end phone, rAF frame logger running):
| 390px, CPU ×6 | idle FPS | scroll FPS | scroll frames dropped |
|---|---|---|---|
| motion OFF (reduced) | 53–57 | ~58 | 1% |
| motion ON | ~44–48 | ~47 | ~6–7% |
| ON, low-end mode (≤4 cores) | ~51 | ~49.5 | ~4% |
Micro-optimisations (no rotation, no inner sway, no shadow, half the items, will-change) did not change this: the cost is roughly constant once any continuous animation runs in that environment, so it was not worth shaving details.
Mitigations shipped (`components/v2/MotionGovernor.tsx`): auto-off of the continuous layers (falling frames, marquee) on low-end devices (≤4 cores, ≤4 GB RAM) and Save-Data; **admin kill switch** — Emergency Fast Mode / Safe Mode (Stability tab) also turns them off; running loops pause while scrolling; `prefers-reduced-motion` disables all. One-shot effects (wall drop, marker draw-in, confetti) remain.
Honest caveat: pausing during scroll did NOT measurably improve scroll FPS in this environment; real-device behaviour (GPU compositing) is expected to be better but is unverified — test on a real mid-range Android over a Vercel preview before release.

## Not changed on purpose
Checkout logic (`cart.tsx`), image pipeline, SafeImage, perf flags, backups, auth, existing migrations.
Reason: the checkout has no server-side price authority; fixing it requires DB changes needing your approval (see `02_…sql`). UI-only changes there add risk without fixing it.

## Verification
- `vite build` OK. Entry JS gz 196,129 → 196,857 B (+0.4%); CSS gz 31.85 → 32.65 KB; total JS gz +~3.4 KB (new lazy route/section chunks only).
- Playwright (dummy backend): `/`, `/poster/:id` (not-found state), `/search`, `/cart` at 390px; `/` at 320, 390, 1440: horizontal overflow 0px everywhere; bottom nav visible <768px only; zero non-network console errors; reduced-motion context loads fine.
- Unit tests: 48 pass (6 new: order grouping, checkout draft); `PosterPerformanceStats.test.tsx` fails to load (missing `@testing-library/dom` in this sandbox install — pre-existing, unrelated).
- `tsc`: no errors in new/changed files (repo has ~73 pre-existing type errors elsewhere).
- NOT verified: visuals with real data (needs Supabase), Lighthouse/LCP before-after, real-device keyboard/AT pass, RTL visual pass.

## Still to do (recommended order)
1. Review/apply `01_search_posters_v2.sql` on a Supabase branch; compare results to v1.
2. Admin V2 phase 2: bulk product editing, order workflow/WhatsApp actions, analytics consolidation (Overview tab done).
3. Checkout UI split + order protection (needs SQL approval).
4. Restyle hero/section headers with `v2-eyebrow`/`Reveal` across existing sections; Lighthouse before/after with real data.
5. (done in slice 8) card → product page link.
