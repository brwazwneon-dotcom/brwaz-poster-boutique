# Meta Ads attribution & revenue analytics

Status: implemented on branch `feat/meta-ads-attribution` (not deployed). This is
the layer ABOVE the live Meta Pixel + Conversions API; that system is unchanged.

## 1. What exists (protected, untouched)

```
Browser  trackEvent() ─► fbq (Pixel)              eventID = uuid, or purchase_<order_number>
              └─ relay ─► sendCapiEvent ─► relayBrowserEvent ─► sendMetaEvent ─► graph.facebook.com/…/<pixel>/events
Checkout createOrderRows ─► DB rows + price guard ─► buildOrderPurchase (stored totals)
              └─ trackNewOrders ─► afterResponse(waitUntil) ─► sendPurchaseToMeta   (same event_id as the browser Purchase)
```

Nothing in the checkout path, `meta-pixel.ts`, `meta-capi.*` or `order-tracking.*`
imports the new code (enforced by `meta-ads-architecture.test.ts`).

## 2. What was added

```
Meta Marketing API ─► meta-marketing.server.ts (read-only client)
                  ─► meta-ads-sync.server.ts   (idempotent upsert, run log)
                  ─► Neon: meta_campaigns / meta_adsets / meta_ads / meta_ad_insights_daily / meta_sync_runs
Analytics Center ◄── meta-ads-report.server.ts ◄── Neon  +  existing analytics attribution
                      meta-ads-report.core.ts (pure join, unit-tested)
Admin UI: Analytics Center → "Meta Ads"   (sync status, Sync now, campaign → ad set → ad, exports)
```

Migration: `neon/migrations/025_meta_ads_reporting.sql` (additive, idempotent, five new tables).

## 3. Credentials (server-side only)

| Variable | Secret | Purpose |
|---|---|---|
| `META_MARKETING_ACCESS_TOKEN` | yes | Business Manager **system-user** token with the `ads_read` permission on the ad account |
| `META_AD_ACCOUNT_ID` | no | `276172695816769` (with or without `act_`) |
| `META_MARKETING_API_VERSION` | no | optional; defaults to `v25.0` |

The Pixel/CAPI token (`META_PIXEL_ACCESS_TOKEN`) is a dataset credential and is
never used for the Marketing API. The admin UI shows only configured / not
configured and the NAMES of missing variables.

## 4. How website traffic is tied to Meta rows

Verified against Ads Manager on 2026-09-27: the live ad links already carry Meta's
own ids —

- `utm_campaign` = campaign id (`52575575055376` = "IG | Sales | Offers 790-890 | Test 1")
- `utm_content`  = ad id (`52575869248376`)

Matching order (never guessed): exact id → unique case-insensitive name (Facebook /
Instagram traffic only) → otherwise shown as "unmatched Meta traffic". The ad set is
not in the URL; it is read from the ad's own record. Where the link names a
campaign that disagrees with the ad's own campaign, the campaign wins and no ad is assigned.

## 5. Attribution rules (existing system, extended not replaced)

- First touch: what first brought the visitor (kept 90 days). Last touch: the last
  NON-direct source (kept 30 days). A later direct visit never overwrites paid
  attribution (`attribution.ts`, 54 tests).
- Orders store `utm_source/medium/campaign` (the paid last touch at checkout). The ad
  id is not stored on the order; it is taken from the visitor's own session touch, and
  only when that touch carries the SAME campaign (`attributeCheckouts`).
- Nothing about checkout was changed. Orders without attribution stay "unattributed".

## 6. Revenue definitions

- **Net revenue** = orders that are not cancelled/returned. CPA and ROAS use it.
- **Confirmed** = status confirmed / shipped / delivered. **Delivered** = delivered only
  (no order is delivered yet, so that column is honestly 0).
- CPA = spend / net orders; ROAS = net revenue / spend. Zero spend or zero orders → "—",
  never Infinity. If Meta reports a currency other than EGP, both are withheld.
- "Meta purchases" is what Meta itself counts; it is shown beside, never mixed in.
  (Example seen in Ads Manager: 5 Meta purchases for the sales campaign vs. 1 order the
  website attributes to it — a real gap worth investigating, not smoothing over.)

## 7. Scheduling

Primary: the admin **Sync now** button. A stale (> 12 h) or never-run sync also
refreshes once when an admin opens the Meta Ads section, at most once per 30 minutes
(no retry loop). No cron or new infrastructure was added. A Vercel cron could call an
authenticated route later; that was not built because scheduled-function configuration
under the Nitro/Vercel build could not be verified here.

## 8. Retargeting readiness (no audiences created)

Data already flowing to Meta (browser + server): ViewContent, AddToCart, InitiateCheckout, Purchase.

| Audience | Possible now? |
|---|---|
| Viewed product, no AddToCart | Yes (ViewContent, exclude AddToCart) |
| AddToCart, no Purchase | Yes |
| InitiateCheckout, no Purchase | Yes, but thin (13 events in 30 days) |
| Purchasers / repeat purchasers | Purchasers yes; repeat needs volume (6 Purchase events in 30 days) |
| Value-based lookalikes | Needs Purchase volume first |

## 9. Event match quality (evidence, no change made)

Events Manager (2026-09-27): PageView / ViewContent / ViewCategory / ViewCart / Search /
photo_page_view are 4.4/10; AddToWishlist server events show **0.0/10**. Meta also says
server-side `fbc` coverage is low.

What the server sends today: `fbp`, `fbc` (only when a paid click set it), hashed
`external_id` (session id), client IP, user agent. Advanced Matching is OFF, so no email /
phone / city. Explanation: `fbc` exists only for visitors who arrived from an ad click;
almost all traffic is organic. Biggest available lever: hashed phone (Egyptian numbers are
already normalised in `meta-capi.server.ts`) on **Purchase** only. Recommendation: do not
enable Advanced Matching until a consent decision is made (not implemented in the project);
then enable it for checkout events only. AddToWishlist at 0.0 is unexplained and should be
investigated separately.

## 10. Combined Frame + Photo checkout (documented, not changed)

Two order records → two Purchase events (`purchase_<frame order>` and `purchase_<photo order>`)
whose values add up to the total. Meta counts two conversions; the admin counts one checkout.
Production history: 0 photo orders exist, so 0 of 8 checkouts were affected so far.
Future model, only if approved: one checkout-level id (`purchase_<first order number>`),
value = whole checkout, contents = all products, sent once from `trackNewOrders`,
with the per-order Purchase suppressed.

## 11. Known limitations

- Reach is not summed (not additive across days) and is not reported.
- Ad-account day vs Cairo day can differ at range edges.
- The CAPI module still posts to Graph `v23.0`; Meta's own table lists Marketing API v23 as
  past its listed expiry and auto-upgraded. It works today; bumping it is a separate, tested change.
- Live Marketing API calls were NOT exercised: no `ads_read` token exists yet. Tests use
  scripted responses and a rolled-back real-Postgres transaction.
