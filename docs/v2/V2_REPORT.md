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
5. Link product cards to `/poster/$id` (currently the page is reachable by URL; card behavior unchanged to protect the selection/bundle flow).
