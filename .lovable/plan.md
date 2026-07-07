# Customer Behavior Tracking & Personalization

The site already has a solid analytics base — `analytics_visits`, `analytics_poster_events`, `search_queries`, `wishlists`, `recently_viewed`, plus per-poster counters (views, cart_adds, sales). I'll build on top of that instead of duplicating tables, and add the missing pieces (interest profile, personalized sections, admin behavior tab, controls).

## 1. Data model (one migration)

- `visitor_profiles` — one row per anonymous visitor id (localStorage). Columns: `visitor_id`, `phone` (nullable, merged on order), `first_seen`, `last_seen`, `visits_count`, `device`, `city`, `governorate`, `interests` (jsonb: `{ categories: {id: score}, tags: {tag: score}, sizes: {size: count}, frames: {frame: count} }`), `updated_at`.
- `visitor_cart_events` — lightweight log for add/remove/checkout_start with `visitor_id`, `poster_id`, `event`, `qty`, `created_at`. (Cart abandonment = latest add_to_cart with no matching checkout/order within N minutes.)
- Extend `analytics_poster_events` usage — already has `event_type`, `visitor_id`, `poster_id`, `metadata`. New event types: `time_spent`, `size_selected`, `frame_selected`, `offer_viewed`, `category_viewed`. No schema change needed.
- RPC `merge_visitor_to_phone(_visitor uuid, _phone text)` — copies/merges profile rows when checkout finishes.
- RPC `get_customer_profile(_phone text)` — returns aggregated behavior for admin drawer.
- RPC `admin_behavior_dashboard()` — totals, top interests, top searches, abandoned carts, most viewed/wishlisted/cart‑added.
- GRANTs + RLS: anon can INSERT into event/profile tables (already the case for existing analytics), admin‑only SELECT via `has_role`.

## 2. Tracking layer (`src/lib/behavior.ts`)

Single client module with a debounced/queued batch sender (max 1 request per 3s or on `visibilitychange`), respecting an "Enable tracking" flag from `site_settings.behavior_tracking`.

API:
```ts
track.pageView(path)
track.productView(posterId, meta)
track.categoryView(categoryId)
track.search(query, resultsCount)
track.wishlist(posterId, added)
track.cart(posterId, added, qty)
track.checkoutStart()
track.offerView(offerKey)
track.sizeSelected(posterId, size)
track.frameSelected(posterId, frame)
track.timeOnProduct(posterId, seconds)
```

Wire into existing places (no duplicate events): PDP mount + IntersectionObserver dwell timer, `useCart` add/remove, wishlist toggle, search box, cart page checkout button, offers page, size/frame selectors.

Profile scoring runs server-side on ingest (small RPC) so client stays lightweight.

## 3. Guest → customer merge

- `visitor_id` in `localStorage` (already used by analytics).
- On successful order in `cart.tsx`, call `merge_visitor_to_phone(visitor_id, phone)` — non-blocking.
- Next visit with same phone hydrates prior interests.

## 4. Personalized homepage sections

New component `PersonalizedSections.tsx` mounted on `/` above generic sections. Renders only when the profile has enough signal (≥3 events); otherwise silent.

Sections (each is a horizontal row of posters):
- Recently viewed (from `recently_viewed` + `visitor_id`)
- Because you liked <TopCategoryName>
- Recommended for you (blend: top interest categories + similar tags to viewed posters, excluding already-owned)
- Popular in <TopTag>
- Continue where you left off (last cart-abandoned posters)

Recommendation source = one server fn `getRecommendations({ visitorId, phone? })` that runs a single RPC returning ~5 keyed lists.

## 5. PDP additions

- "You may also like" row (same category + shared tags, ordered by sales_count).
- "Still interested in this frame?" reminder banner if this poster is in the abandoned-cart list.

## 6. Admin → Customers / Behavior tab

New tab in `admin.tsx`:
- Top cards: total visitors, returning, abandoned carts (7d), avg session dwell.
- Top interests (categories + tags), top searches, most viewed/wishlisted/cart‑added products.
- Customers table (searchable by phone/name) with a drawer showing that customer's orders, wishlist, cart history, viewed products, search history, favorite categories, interest score, last activity.
- Actions: Export CSV, Clear anonymous data (>90d), Reset recommendation engine (truncate scores).

## 7. Admin controls (site_settings keys)

New keys with UI toggles in Admin → Settings:
- `behavior.tracking_enabled` (default true)
- `behavior.personalization_enabled` (default true)
- `behavior.retention_days` (default 180)

Client reads these via existing `useSiteSettings`; when tracking is off, `track.*` becomes a no-op; when personalization is off, `PersonalizedSections` returns null.

## 8. Privacy & performance

- Only `visitor_id` (random UUID), phone (hashed for logs), coarse city — no IP or PII in client payloads.
- Batched sendBeacon on hide; single POST per 3s otherwise; all tracking wrapped in try/catch and never awaited by user actions.
- No layout shift: personalized sections render skeletons at fixed heights.

## Delivery order

1. Migration (tables, RPCs, grants, RLS).
2. `src/lib/behavior.ts` + wiring into existing surfaces.
3. `PersonalizedSections` + PDP additions.
4. Admin Behavior tab + settings toggles.
5. CSV export + cleanup actions.

## Scope check before I start

This is ~5–7 files of new code plus edits across cart/PDP/home/admin, and one migration. Confirm two things:

- **Ship in one go, or phased?** Recommend phased (migration + tracking first, then personalization UI, then admin tab) so each step is verifiable in preview.
- **Personalized sections placement** — above the current homepage collections, or replacing the generic "Featured" row when the profile has enough signal?

Reply "go" for phased delivery with sections above (defaults), or tell me what to change.