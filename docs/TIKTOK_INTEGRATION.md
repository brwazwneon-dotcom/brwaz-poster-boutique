# TikTok integration — plan, architecture and rollout

Branch: `feat/tiktok-integration` (off `f102eeb`, the deployed and merged Meta Ads work).
Status: implemented, tested, **not deployed**. Everything ships **switched off**.

## 1. Where things stood

| Piece | Before |
|---|---|
| TikTok pixel `D9E35TRC77UDPAPRP140` | Booted in `routes/__root.tsx`, sends `PageView` only |
| Standard events (ViewContent, AddToCart, InitiateCheckout, CompletePayment…) | Not sent (a draft exists as uncommitted work of another session: `tiktok-pixel.ts`) |
| Events API (server side) | none |
| `ttclid` / `_ttp` | not captured (`click-ids.ts`, another session's uncommitted duplicate store, is not used) |
| Ads reporting (spend, ROAS) | none |
| Traffic / orders from TikTok in the database | **0** (no TikTok ads have run yet) |

Because no TikTok traffic exists yet, the system is built to be **correct and dormant**, then switched on
step by step while watching Events Manager → Test Events.

## 2. Architecture (mirrors the verified Meta design)

```
Storefront event ─► trackEvent() [meta-pixel.ts — ONE hook]
                      ├─► Meta (unchanged)
                      └─► trackTikTok() [tiktok-browser.ts]
                             ├─ ttq.track(<TikTok name>, props, {event_id})           (pixel)
                             └─ (if tiktok_events_api_enabled) relay ─► sendTikTokEventFromBrowser  [public, allow-listed]
                                                                 └─► relayTikTokBrowserEvent ─► Events API

Order created ─► trackNewOrders() [deferred, never blocks the response]
                   ├─ Meta Purchase                       (unchanged)
                   ├─ ad_tracking + attribution snapshot  (now also ttclid / ttp)
                   └─ sendTikTokPurchaseSafely ─► CompletePayment, event_id = purchase_<order number>
Browser Purchase (same event_id) ─► ttq.track("CompletePayment", …, {event_id})
```

- **One vocabulary.** The storefront's Meta-style names map onto TikTok's: `Purchase → CompletePayment`,
  `Lead → SubmitForm`, the rest keep their names (`tiktok-events.ts`). PageView is owned by the base pixel.
- **Deduplication.** Pixel and Events API send the same event name with the same `event_id` (TikTok dedups on
  event_id + event name, within 48 h). Purchase ids are the deterministic `purchase_<order number>` used for
  Meta, so one order has one id on every channel. Retries re-send the identical payload.
- **Purchase is server-built.** Value/contents come from the stored, price-guarded order; never from the
  browser. Test orders and failed orders produce none. The relay refuses Purchase.
- **Never blocks checkout.** The TikTok send runs beside the Meta send inside the existing deferred task
  (`afterResponse`): 3 s per attempt and one retry when deferred, 2.5 s and no retry when it must run inside the
  request. A TikTok or Meta failure cannot affect the other or the order.
- **Attribution.** `ttclid` is captured from the landing URL into the ONE attribution store
  (`attribution.ts`, 30-day click window, does not move first/last touch), `_ttp` is read from the pixel's
  cookie, both travel with the order, are stored in `orders.ad_tracking` and in the order-time snapshot.
  No second attribution system.
- **Privacy.** Customer email/phone are never sent unless `tiktok_advanced_matching_enabled` is on; then they are
  SHA-256 hashed (email lower-cased; phone in E.164). `external_id` (the visitor id) is always hashed.
- **Security.** Token only in `TIKTOK_EVENTS_ACCESS_TOKEN` (server env), sent in the `Access-Token` header, never
  in a URL/log/response. Host guard: non-production hosts never send. Public relay: schema-validated, allow-listed,
  rate-limited (120/min/IP), answers `{ok, skipped?}` only.

## 3. Configuration (all off by default)

| Where | Name | Meaning |
|---|---|---|
| Vercel (secret) | `TIKTOK_EVENTS_ACCESS_TOKEN` | Events API access token (created by the owner) |
| Vercel (optional) | `TIKTOK_TEST_EVENT_CODE` | while testing only: events go to Test Events, not live |
| Neon `site_settings` | `tiktok_events_api_enabled` | `true` turns the server side on (needs the token) |
| Neon `site_settings` | `tiktok_advanced_matching_enabled` | hashed email/phone; needs a consent decision first |
| Neon `site_settings` | `tiktok_pixel_id` | optional; defaults to the site's pixel |

The admin shows the state in Analytics → Advertising → TikTok (booleans only, never the token).

## 4. Rollout (each step reversible)

1. Deploy the code (nothing changes: Events API off, pixel now also sends standard events).
2. In TikTok Events Manager, create the Events API token for pixel `D9E35TRC77UDPAPRP140`; add it to Vercel with
   `TIKTOK_TEST_EVENT_CODE` from the Test Events tab; redeploy.
3. Set `tiktok_events_api_enabled = true`. Browse the site: Test Events shows browser + server events, deduped.
4. Place one real order: `CompletePayment` arrives from browser and server with `purchase_<order number>`.
5. Remove `TIKTOK_TEST_EVENT_CODE`, redeploy. Live.
6. Rollback at any step: set `tiktok_events_api_enabled = false` (no deploy needed).

## 5. Known gaps and honest limits

- **The Events API request shape is written from TikTok's public integration guides, not the official portal**
  (unreadable when this was built): endpoint `POST /open_api/v1.3/event/track/`, `Access-Token` header,
  `event_source: "web"`, `event_source_id: <pixel code>`, `data[]`, dedup on event_id + name. The first Test Events
  run is the real verification. Response success is taken as HTTP 200 + `code === 0`.
- No live TikTok call has been made (no token exists): all tests use scripted responses.
- Phone hashing assumes E.164 with `+` — only matters once Advanced Matching is enabled.
- TikTok ads reporting (spend / ROAS) is **Phase 2** (section 6) and is not built until TikTok campaigns exist.
- Other session's uncommitted TikTok files (`tiktok-pixel.ts`, `click-ids.ts`, the TikTok lines in `meta-pixel.ts`
  and `__root.tsx`) overlap this work. See section 7.

## 6. Phase 2 — TikTok Ads reporting (design, not built)

Mirror `meta-marketing.server.ts` / `meta-ads-sync.server.ts` / the pure report core:
`GET /open_api/v1.3/report/integrated/get/` (advertiser id, `data_level`, dimensions `campaign_id`/`stat_time_day`,
metrics spend, impressions, clicks, `complete_payment`), read-only, cursor/page loop, bounded retries, tables
`tiktok_*` (campaigns, ad groups, ads, daily insights, sync runs), env `TIKTOK_ADS_ACCESS_TOKEN` +
`TIKTOK_ADVERTISER_ID`. The join to website orders needs the ads' URLs to carry TikTok's macros
(`utm_campaign=__CAMPAIGN_ID__`, `utm_content=__CID__`), the same way the Meta ads carry Meta ids. Build it when
the first TikTok campaign runs, so it can be verified against real data.

## 7. Landing this next to the other session's uncommitted TikTok work

They are independent implementations of the same idea. To avoid two senders:
1. Land this branch first (it does not touch `__root.tsx` or those files).
2. Then discard the other session's `trackTikTok(...)` line in `meta-pixel.ts`, its `tiktok-pixel.ts`, its
   `flushTikTokQueue` calls in `__root.tsx` and `click-ids.ts` (this branch's `tiktok-browser.ts` polls the pixel's
   ready flag itself, so `__root.tsx` needs no change). `tiktok-architecture.test.ts` fails if a second
   browser sender appears.
