# BRWAZWNEON V2 — Phase 1: UX Architecture (no code)

Status: proposal for approval. Based on repo audit of branch `claude/zen-bardeen-kvjao3`.

## 0. Audit findings that change the plan
1. **No server-side pricing authority exists today.** `src/routes/cart.tsx` computes subtotal, discount,
   shipping and total in the browser and inserts rows straight into `orders` with the anon key
   (INSERT policy `WITH CHECK` on anon/authenticated; only an order_number trigger runs). A tampered
   client can set any price. The brief says "preserve server-side pricing authority"; there is nothing to
   preserve. Fixing it needs a DB change (RPC `place_order` or BEFORE INSERT validation trigger).
   **Proposed in Phase 5, not applied without approval** (see §7).
2. **Duplicate-order guard is client-only** (`submittingRef`). Refresh/double-tab can duplicate. Fix: client-generated
   idempotency key, unique per order group (needs a column — schema change, §7).
3. **Orders are one row per cart line** (shared customer fields repeated). Do not restructure; admin and
   WhatsApp flows depend on it.
4. **No dedicated product route.** Posters open from grids/category pages (`PosterGallery`, `StickyProductBar`
   in `category.$slug.tsx`). A real `/poster/$slug` page is a new route (SEO + shareable links + conversion).
5. Homepage is already a DB-driven section list (`homepage-sections.ts`, ~26 section keys, admin-orderable,
   lazy via `LazyOnView`). V2 reorders/restyles through this system; it does not replace it.
6. Search is already server-side (`search_posters` RPC, pg_trgm). No Cloudinary/Neon: images are Supabase
   Storage + `image_variants`.

## 1. Current journey and friction (hypotheses to verify with analytics before final order)
| Stage | Today | Friction |
|---|---|---|
| Land | Slider + many sections (up to ~26) | Too many competing blocks; no clear primary path |
| Discover | Header search, category pages, collections | Browse vs. "vibe" intent not separated |
| Decide | Grid card -> gallery/sticky bar | No shareable product URL; size/frame/price/shipping scattered |
| Cart/Checkout | Single 1743-line page | One long form; errors only at submit; payment screenshot upload mid-flow |
| Confirm | Post-order message | Limited reassurance/next steps |

## 2. V2 sitemap
```
/                      Home (V2 composition, §4)
/shop                  All posters: filters (category, size, orientation), sort
/category/$slug        Collection page (existing, restyled; subcategory chips)
/poster/$slug          NEW product page (§5)
/search?q=             Search V2 results + recovery
/vibes/$vibe           Shop-by-vibe (curated via existing landing_pages)
/sets                  Frame sets / bundles (existing)
/offers  /best-sellers /trending   (existing, restyled)
/room-transformation   NEW deep-link of the home room section (optional)
/custom-design /photo-printing /photo-4x6   (existing, restyled only)
/cart                  Cart drawer + /cart full page
/checkout              NEW: split from cart.tsx (same logic, new UI)
/order/confirmed       NEW confirmation (reads order by guest_session_id)
/wishlist /auth /admin/*   (existing)
```
Splitting `/checkout` out of `cart.tsx` is a refactor with identical submit logic first, UI second.

## 3. Navigation
- **Desktop:** logo | Shop (mega menu: categories+vibes with 1 image each, lazy) | Offers | Room | Custom |
  search (inline expanding) | wishlist | cart (opens drawer).
- **Mobile:** top bar (menu, logo, search, cart) + bottom bar (Home, Shop, Search, Wishlist, Cart w/ count).
  Search is a full-screen sheet; categories as horizontal chip rail; filters in a bottom sheet (vaul already present).
- Keep announcement bar and WhatsApp float; collapse floating tools on mobile (existing perf flag).

## 4. Homepage order (conversion-reasoned, fewer sections than 26)
Default V2 sequence (admin can still reorder; max_home_sections flag respected):
1. **Hero** — one primary promise + 1 CTA ("Shop posters"), secondary "Design your own". LCP image preserved.
2. **Shop by category/vibe rail** — fast entry for browsers (above fold on mobile via chip rail).
3. **Trending now** (proof + discovery)
4. **Best sellers**
5. **Offers / frame sets (6-pack 20x30, 4-pack 30x40)** — highest-AOV lever, placed mid-page.
6. **Room transformation** — visualizes sets; drives bundle intent.
7. **Category showcases** (Cinema, Football, Anime, Music, Cars) — one compact editorial block each, max 4 rendered, rest via `LazyOnView`.
8. **Custom design** (+ photo enhancement before/after merged into one block)
9. **Wall of Inspiration** (social proof / UGC)
10. **Reviews + trust (quality, delivery, payment)** merged
11. **FAQ** (collapsed) -> **Final CTA**
Personalized rails (recently viewed / for-you) slot after #4 for returning visitors only.
Validate order against `analytics_visits`/`analytics_poster_events` scroll and click data before locking.

## 5. Product page `/poster/$slug`
Mobile-first, one decision path: **image -> size -> frame -> price -> Add to cart**.
- Gallery: poster in `FramePreview` (existing), swipe thumbnails: framed, bare, in-room mock.
- Selectors: size (with inline size guide), frame type/color (existing options), qty. Live price (display only).
- Shipping/delivery clarity under price (free threshold, ETA by governorate, COD/Instapay icons).
- Sticky bottom purchase bar on mobile (price + Add to cart), hides when inline CTA visible.
- Below fold: details, related (same category), recently viewed, bundle upsell ("complete the wall").
- Reuses: `SizeGuide`, `RelatedPosters`, `RecentlyViewed`, `StickyProductBar`, `ProductInfoSections`.

## 6. Search UX (Phase 4 detail)
- Mobile full-screen sheet; desktop dropdown. Min 2 chars, 250ms debounce, abort stale requests, cache by query.
- Empty state: trending searches + category chips. No results: corrected suggestion ("did you mean"), nearest categories, WhatsApp request.
- Backend: improve `search_posters` (Arabic normalization of alef/ya/ta-marbuta/diacritics, prefix match for "spider",
  token-AND for "spider man", exact-title boost, category/subcategory boost). Needs a migration — reported as SQL first.

## 7. Checkout UX and required (proposed, NOT applied) schema changes
UX: Cart drawer -> `/checkout` with 3 collapsible blocks on one page (Contact+address, Payment, Review),
inline validation, persisted draft in localStorage, sticky order summary (bottom sheet on mobile),
clear line items: subtotal, discount, packaging, shipping, total. Confirmation page with order number + WhatsApp.

Proposed DB hardening (needs your approval before any SQL is written or run; none applied):
- A. `orders.idempotency_key uuid` + partial unique index (rollback: drop column/index; additive, low risk).
- B. `place_order(jsonb)` SECURITY DEFINER RPC that recomputes prices from `posters`/`site_settings`, and revoking
  anon INSERT on `orders` (risk: HIGH — breaks old clients until deployed together; rollback: re-grant INSERT).
  Safer alternative: BEFORE INSERT validation trigger that rejects totals not matching server-computed values.
All of this would be developed against a local/branch DB, never production.

## 8. Component map (new vs. reuse)
New: `v2/ui` primitives (Button, Input, Badge, Sheet wrappers, Tabs, SectionHeader, Reveal), `ProductCardV2`,
`MegaMenu`, `MobileBottomNav`, `SearchSheet`, `PosterPage`, `PurchasePanel`, `CartDrawer`, `CheckoutForm`,
`OrderSummary`, `ConfirmationPage`, admin `OpsShell` + dashboards.
Reuse unchanged: `SafeImage`, `SmartImage`, `FramePreview`, `image-*` libs, `LazyOnView`, perf flags, i18n,
auth/admin guards, backups, analytics/pixel libs.

## 9. Success metrics (measured locally via Lighthouse/bundle diff; live metrics only after your own deploy)
Home LCP not worse than baseline; JS bundle delta <= +5% on `/`; add-to-cart in <= 3 taps from product page;
checkout fields <= 8 visible; zero horizontal overflow 320-430px.

## 10. Proposed next phases (scope control)
P2 design tokens + primitives (CSS vars on existing theme system; one new V2 theme, keep others).
P3 motion (CSS + one tiny IntersectionObserver `Reveal`; no new library).
P4 Search V2 (SQL reported first). P5 product + cart/checkout. P6 home. P7 room. P8 admin shell/dashboards.
Baseline (install, build, bundle sizes, Lighthouse) is taken BEFORE P2.
