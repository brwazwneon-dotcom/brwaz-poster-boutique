# BRWAZWNEON V2 — Final report (branch `claude/zen-bardeen-kvjao3`)

No deployment, no production DB access, no migrations added to `supabase/migrations`. Detail and evidence per slice: `V2_REPORT.md`.
Scope note: the 12-agent plan was executed by one coordinator working inline (no sub-agents spawned) to control cost; the
"agents" below are the roles whose checks were performed.

1. **V2 design overview** — "Poster Wall" theme (default): warm paper + ink, logo yellow/cyan, square corners, hard-edged printed frames, yellow marker headings, cinematic dark hero kept on the light page, ink footer/mobile nav. Admin stays on the dark console theme.
2. **Sitemap** — new `/poster/$id` (product page), `/order-confirmed`; unchanged: home, category, search, cart (+checkout), offers, sets, custom-design, photo-*, wishlist, admin. `/shop`, `/vibes`, separate `/checkout` from the Phase 1 plan were NOT built.
3. **Component architecture** — `components/v2/{Reveal,PosterWall,FrameWall,MobileBottomNav}`, `routes/poster.$id`, `routes/order-confirmed`, `components/admin/OverviewTab`, `components/LanguageBoot`, libs `request-lang`, `checkout-draft`, `admin-overview`.
4. **Design system** — tokens in `SITE_THEMES["poster-wall"]` + `[data-site-theme="poster-wall"]` in `styles/v2.css`; `v2-eyebrow`, `v2-card`, `v2-wall`, `v2-skip-link`, focus ring. A full primitive library (buttons/inputs/modals as new components) was NOT built; existing shadcn components are restyled through tokens.
5. **Motion system** — CSS transform/opacity only, ≤420 ms, `Reveal` (IntersectionObserver, never hides in-view content), card lift, cart pop; all off under `prefers-reduced-motion`. No animation library. Hero deliberately has no entrance (LCP).
6. **Search architecture** — server-side Postgres: `01_search_posters_v2.sql` (Arabic folding, token-AND, typo tolerance) + `03_search_v2_indexed.sql` (precomputed normalized columns + trigram GIN, ~100 ms at 10k rows vs ~130 ms v1); client calls v2 and falls back to v1; 220 ms debounce, cached; no-result recovery chips. SQL tested on scratch PostgreSQL 16, NOT applied.
7. **Product page architecture** — `/poster/$id`: frame/color/size/qty, display price from existing `usePricing`, delivery/payment/quality signals, size guide, related posters, mobile sticky Add-to-cart, linked from cards and search.
8. **Checkout architecture** — logic and pricing untouched. Added: delivery-field draft persistence, mobile sticky total + confirm (same guarded handler), `/order-confirmed` page (was a dead route), bundle `order_posters` fix. Server protection designed in `02_orders_idempotency_and_price_check.sql` (tested, NOT applied).
9. **Admin architecture** — new default "Overview" tab (revenue, open/awaiting-payment orders, product health, recent orders, shortcuts), read-only via `security_invoker` view. Existing bulk edit, order grouping, WhatsApp actions, backups, health tabs untouched.
10. **Performance strategy** — measure first; no new libraries; lazy sections; see table in `V2_REPORT.md` slice 12 (LCP not slower, CLS unchanged, CSS +1.8 KB, JS on home +2–5%).
11. **Security / reliability strategy** — found from migrations: anonymous visitors can insert `total_price = 0` with `payment_status='verified'`; guard SQL written/tested; Overview and new routes reviewed; admin pinned to existing theme.
12. **Agent-by-agent** — 1 UX: Phase 1 doc. 2 Visual: theme. 3 Motion: v2.css/Reveal. 4 Search: SQL v2/indexed + tests. 5 Performance: before/after + CLS fix. 6 Product: `/poster/$id`. 7 Checkout: draft, sticky bar, confirm page, bundle fix. 8 Admin: Overview tab. 9 Room: 6/4-frame wall (verified geometry). 10 QA/Security: SQL attack tests, hydration root cause, RTL frame bug, drawer shadow leak. 11 Mobile: 320/390 checks, no overflow. 12 Desktop: 1440 checks. (1920 px and 412/430 px not tested.)
13. **Files changed** — 58 files, ≈+2.5k/−0.2k lines vs `main` (`git diff --stat origin/main...HEAD`).
14. **Database changes** — proposed only, none applied: `01`, `03` (adds 2 nullable columns, trigger, indexes on `posters`; backfills every row once), `02` (BEFORE INSERT guard on `orders`, ships in `log` mode; optional idempotency columns need a client change). Rollbacks are in each file.
15. **Tests** — 57 unit tests pass (new: order grouping, checkout draft, theme tokens/contrast, request language, plus existing); 1 pre-existing suite fails to load (`@testing-library/dom` missing in the sandbox install). Playwright checks with mocked backend (home, product, cart, category, custom-design, photo-printing, search, offers, sets, order-confirmed; en + ar; 320/390/1440 px): no horizontal overflow, no new console errors. Local PostgreSQL 16 tests for all SQL.
16. **Performance BEFORE/AFTER** — in `V2_REPORT.md` slice 12 (indicative; mock backend, 4× CPU throttle; not Lighthouse).
17. **Credit usage** — per the session records: this coordinator session $16.73; the separate old-site session ($33.85 at last check, still running) → ≈ $50.6 combined.
18. **Remaining credit** — ≈ $49 of $100 if both sessions draw on the same $100; verify in the account panel.
19. **Known limitations** — see below.
20. **Recommended next phase** — below.

## Known limitations
- Never run against real data, a real Supabase, Vercel, or a CDN. Visuals checked with mocked responses (Unsplash/room images blocked in the sandbox).
- Server-rendered language is chosen per request from cookie/Accept-Language; if you cache HTML at a CDN it must vary on `Cookie` and `Accept-Language` (the repo's `_headers` marks `/` as no-store; other routes' deployed headers were not verified).
- Order guard is a floor + consistency check, not full server-side pricing.
- Not built: separate `/checkout`, `/shop`/vibes pages, admin in the light theme, bulk-edit/ops-workflow redesign, full component library, 1920/412/430 px checks, real Lighthouse, keyboard/screen-reader audit on real devices.
- One residual hydration warning can appear for a first visit by a returning visitor whose language lives only in old localStorage.

## Recommended next phase
1. Apply SQL `01` → `03` and `02` (log mode) on a Supabase branch; review warnings on real orders; then enforce.
2. Deploy the branch as a Vercel *preview* (not production), run Lighthouse mobile/desktop on `/`, `/category/*`, `/poster/*`, `/cart`, in ar and en, and compare with `main`.
3. Review admin in the Poster Wall theme or keep it dark; decide whether to keep the 5 legacy themes.
4. Real-device accessibility pass; then decide on `/checkout` split and full pricing authority (`place_order` RPC).
