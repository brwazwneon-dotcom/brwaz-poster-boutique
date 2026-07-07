# Conversion Optimization Rollout

This is a large scope (20 features). To keep the black luxury design intact and avoid one giant unreviewable change, I'll ship it in **4 focused phases**. Each phase is independently testable. Confirm the order or tell me to reprioritize.

## Foundation (built in Phase 1, reused everywhere)

- **`marketing_settings` table** (single row, JSON blob) — every feature has: `enabled`, `text` (overridable copy), `timer` (frequency/cooldown), `colors`. Managed under **Admin → Marketing**.
- **`useMarketingSetting(key)` hook** — reads settings, cached via TanStack Query, invalidated on admin save.
- Shared UI primitives: `SavingsBar`, `TrustBadgeRow`, `LiveBadge` — reused by many features to stay consistent with existing gold/black tokens.
- All animations ≤ 300ms, `will-change` only on transform/opacity, lazy-loaded images, no layout shift.

## Phase 1 — Product page conversion core
The highest-impact block; every item lives on the product detail page.

1. **Sticky Add to Cart bar (mobile)** — thumb + title + price + discount + CTA. Appears after main CTA scrolls out.
2. **Live Stock Counter** — deterministic per poster (`4–15`, seed = poster.id + hour) so it doesn't jitter on re-render.
3. **Visitor Counter** — "🔥 N people viewing" (seed = poster.id + 5-min bucket).
4. **Bestseller / Popular / New / Limited badges** — auto-derived from `sales_count`, `views_count`, `created_at`; admin override column on `posters`.
5. **Trust Section row** — 5 icons under the CTA.
6. **Fast Checkout ("Buy Now")** — skips cart, pushes item + jumps to checkout.

## Phase 2 — Cart & site-wide upsell
7. **Bundle Discount** — tiered 10/15/20% applied in cart, savings line shown live.
8. **Free Shipping Progress** — sticky slim bar above footer; animates on cart change.
9. **Floating Offer Bubble** — bottom-right, opens current-promotions sheet.
10. **Wishlist Reminder** — small toast on home after 15s if wishlist has items.

## Phase 3 — Social proof & discovery
11. **Recent Purchases popup** — Egyptian names + governorates pool, cooldown from admin, enable/disable.
12. **Customer Reviews block** — verified badge, optional photo, admin-editable (reuse existing `reviews` table + admin curation flag).
13. **Recently Viewed strip** — reuse existing `recently_viewed` table.
14. **Smart Recommendations "You may also like"** — server fn scoring by category + tag overlap.
15. **Collection Covers** — rotating B&W fade covers (extends existing home-category-picks logic).
16. **Premium Hover** — subtle zoom + gold glow on `PosterCard` (CSS only, GPU).

## Phase 4 — Retention & admin polish
17. **Exit Intent Popup (desktop)** — `WELCOME10`, `localStorage` 7-day cooldown, `mouseleave` toward top.
18. **Admin → Marketing panel** — full toggles/text/timer/colors form for every feature above, grouped by section, live preview links.
19. **Performance sweep** — audit LCP image preload, `loading="lazy"` + `decoding="async"` on all card images, verify no CLS.
20. **Mobile QA pass** — Playwright screenshots at 375px for each feature; fix overlaps.

## Technical details

- **Data model**: `marketing_settings(key text pk, value jsonb, updated_at)` + `GRANT SELECT TO anon` (public reads), full CRUD to `authenticated` gated by `has_role(admin)` policy. `posters.badge_override text` for manual badges.
- **Reads**: public server fn using publishable-key client for marketing settings (SSR-safe). Admin writes via `requireSupabaseAuth` + admin role check.
- **No new libraries** — everything with existing shadcn + Tailwind + Motion primitives already in the project.
- **No redesign** — all new UI uses existing gold `#c9a24a`, black surfaces, current typography.

## Ask before I start

- OK to ship in these 4 phases (Phase 1 next turn), or do you want a different order?
- Any feature to drop? (e.g. Exit Intent can feel spammy on a luxury brand.)
