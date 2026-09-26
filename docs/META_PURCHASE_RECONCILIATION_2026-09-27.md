# Meta Purchases vs website orders — reconciliation (2026-09-27)

Evidence only. Every number below was read on 2026-09-27 from Neon (read-only queries),
Events Manager (dataset 4466074806960925) and Ads Manager (ad account 276172695816769).
Where something could not be read it says so.

## 1. What Meta says

| Item | Value | Source |
|---|---|---|
| Campaign 52575575055376 | "IG \| Sales \| Offers 790-890 \| Test 1", results **5 purchases**, spend **607.29 EGP**, 6,273 impressions, 4,506 reach, status ACTIVE, budget 250 EGP/day | Ads Manager, range 28/08–26/09 (Cairo), default attribution windows |
| Ad 52575869248376 | "إعلان جديد بهدف المبيعات - نسخة": same 5 / 607.29 / 6,273 → it is the campaign's ad | Ads Manager |
| Purchase events, all sources (dataset) | **7 browser + 1 server (CAPI) = 8**, event match quality 4.4/10 | Events Manager → Purchase → details |
| Deduplication | **"Still being analyzed"** (Meta's own state); not failed, not confirmed | Events Manager → Purchase → Event deduplication |
| Not read | Meta's per-day purchase split, purchase value, the attribution-setting column | Ads Manager renderer timed out |

Other campaigns spent in the same range (e.g. "لبنان" 607.77 EGP with 62 messaging conversions,
"layan" 367.23 EGP), so Facebook/Instagram visitors are not all from the Sales campaign.

## 2. What the website says (Neon, non-test rows)

- 9 real checkouts, 0 test orders, 0 photo orders.
- Pixel enabled 2026-09-19 22:43 UTC; CAPI enabled 2026-09-26 15:06 UTC.
- Attribution capture (first/last touch on visits) went live **2026-09-24 05:19 Cairo**.

| Order | Cairo time | Status | EGP | Visitor's legacy source | utm on the order |
|---|---|---|---|---|---|
| BRW-1008 | 09-14 03:37 | cancelled | 980 | direct | – (before the Pixel) |
| BRW-1009 | 09-14 17:22 | cancelled | 1,630 | direct | – (before the Pixel) |
| BRW-1012 | 09-20 02:17 | cancelled | 1,430 | direct | – |
| BRW-1017 | 09-22 07:11 | shipped | 1,000 | instagram | ig / paid / 52575575055376 |
| BRW-1018 | 09-22 14:04 | confirmed | 1,520 | facebook | – |
| BRW-1027 | 09-22 15:09 | processing | 900 | facebook | – |
| BRW-1033 | 09-22 18:30 | processing | 1,080 | instagram | – |
| BRW-1038 | 09-23 04:01 | confirmed | 2,584 | instagram | – |
| BRW-1049 | 09-27 00:15 | new | 4,550 | direct (first & last touch) | – |

## 3. The reconciliation

1. **Browser Purchase count matches orders.** 7 checkouts happened after the Pixel was enabled
   (1012, 1017, 1018, 1027, 1033, 1038, 1049) and Meta shows 7 browser Purchase events. ✔
2. **Server Purchase count matches.** 1 checkout after CAPI was enabled (1049) and Meta shows 1 CAPI
   Purchase. Its `orders.ad_tracking` was written (keys: fbp, ip, ua, purchase_ref, event_source_url;
   no fbc/fbclid). ✔ (The first real post-CAPI order; server and browser each arrived.)
3. **Meta's 5 vs the website's 1.** Five orders came from visitors whose recorded source was
   Facebook/Instagram: 1017, 1018, 1027, 1033, 1038 (all 22–23 Sep). That equals Meta's 5. Only 1017
   carries a UTM on the order. The other four were placed **before attribution capture existed**
   (24 Sep 05:19), so the website has no campaign for them — it is a data-coverage gap on the
   website side, not a Meta over-count. The number matches; the per-order link to *this
   campaign* is NOT proven (other campaigns also ran, and Meta does not expose which order).
4. **Cancelled orders.** A Purchase fires at order placement; a later cancellation (e.g. 1012) does not
   retract it in Meta. Meta counts placed orders; the dashboard's net figures exclude cancelled.
5. **Deduplication.** Not observable yet (Meta: analysis pending). Same `event_id` on both channels is
   guaranteed by code; two new Purchase events for one new order (7→8 total) is what a not-yet-merged
   pair looks like in the overview counts. Re-check after Meta finishes analysing.
6. **Dates/timezone.** Ads Manager range 28/08–26/09 vs Neon Cairo days: same days, no order falls near
   an edge. Meta's ad-account day vs Cairo day was not compared.
7. **Combined Frame + Photo double Purchase:** 0 photo orders exist, so it has affected 0 checkouts.

## 4. What this means for ROAS / CPA (do not present as authoritative yet)

| Basis | Orders | Net revenue | CPA | ROAS |
|---|---|---|---|---|
| Website attribution today (1 order carries the campaign) | 1 | 1,000 | 607.29 | 1.65× |
| The 5 Facebook/Instagram-sourced orders (Meta's count) | 5 | 7,084 | 121.46 | 11.67× |

The truth is bracketed by these. The second row assumes all five came from this campaign, which the
evidence supports numerically but cannot prove per order. Orders are "placed" (net of cancelled);
only 2 of the 5 are confirmed (2,584 + 1,520 = 4,104 EGP), 1 is shipped, none is delivered.
From now on the order snapshot (below) makes the link explicit for new orders.

## 5. Historical backfill — deterministic rule, NOT applied

- Orders with `orders.utm_campaign` set (only BRW-1017 today): `meta_campaign_id` = that value when the
  order's utm_source is facebook/instagram and the value is all digits. No inference.
- Any order with no stored campaign (1018, 1027, 1033, 1038) cannot be assigned without guessing from
  the visitor's legacy source, which names a platform, not a campaign. **Not backfilled.**
