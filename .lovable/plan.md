
The project already has: `best_sellers` table with pin/hide/position/date-range, `BestSellersTab` admin, homepage `BestSellers` slider, and a section config in `site_settings`. This plan fills the remaining gaps — auto-ranking, a dedicated page, admin controls, badges, and analytics — without redesigning the site.

## 1. Database (single migration)

- Add `posters.is_best_seller boolean default false` (manual override flag surfaced in Posters admin too).
- Add DB function `refresh_auto_best_sellers()` (admin-only, security definer):
  - Computes a score per poster: `sales*5 + cart_adds*2 + wishlist_count*2 + views*0.1 + recency_boost(last 30d sales)`.
  - Inserts the top N (from config) into `best_sellers` at positions after all pinned rows.
  - Never removes rows where `pinned = true` OR the poster has `is_best_seller = true`.
  - Removes auto rows no longer in the top N.
- Add DB function `best_sellers_analytics()` returning: top viewed, top purchased, top wishlisted, trending today/week/month (last-N-days sales delta) — admin-only.

## 2. Admin — Best Sellers tab

Expand `BestSellersTab`:
- **Settings panel**: enabled toggle, editable title/subtitle, homepage count (default 6), auto-ranking toggle, show/hide badges/price/cart/wishlist/quick-view, sort mode (manual / auto / mixed).
- **Actions row**: `Refresh Ranking`, `Recalculate Best Sellers`, `Export CSV`.
- **Analytics block**: 5 mini cards (top viewed, purchased, wishlisted, trending week, trending month).
- **Product rows** already support pin/hide/reorder/dates; add purchase/view/wishlist counts + score column, and a `⭐ Manual` chip when `posters.is_best_seller = true`.
- Keep the existing search-and-add flow.

## 3. Homepage

- `BestSellers` component reads `homepage_count` (default 6) and `View All Best Sellers` CTA linking to `/best-sellers`.
- Only 6 products shown; slider style stays identical.
- Section respects new `enabled` flag from config.

## 4. New route `/best-sellers`

- Public page listing all current best sellers.
- Controls: search box, category filter, sort (newest / most popular / price asc/desc).
- Reuses existing `FramePreview` + `WishlistHeart` cards; no design change.
- SSR head/OG tags set.

## 5. Product page

- Show `⭐ Best Seller` chip under the title when `posters.is_best_seller = true` OR the poster id exists in `best_sellers` (non-hidden, in-date).

## 6. Config schema

Extend `BestSellersConfig` in `src/lib/homepage-sections.ts`:
```
{ enabled, title, subtitle, homepage_count (default 6),
  auto: boolean, show_badges, show_price, show_cart, show_wishlist, show_quick_view,
  max (existing slider cap), autoplay, loop }
```

## 7. Files touched

- New migration: `posters.is_best_seller`, `refresh_auto_best_sellers`, `best_sellers_analytics`.
- Update: `src/lib/homepage-sections.ts` (config), `src/components/BestSellers.tsx` (6 cap + CTA + config-driven UI), `src/routes/admin.tsx` (expanded tab), `src/routes/index.tsx` (unchanged wiring), product route (badge).
- New: `src/routes/best-sellers.tsx`.

## 8. Out of scope

- No visual redesign; premium black/gold styling preserved.
- No changes to cart/checkout logic.
- No drag-and-drop library added (existing up/down move buttons stay).

Ready to build on approval.
