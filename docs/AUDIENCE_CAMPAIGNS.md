# Two campaign audiences: youth and album

The store runs two ad campaigns, one per audience. The site tells their visitors apart so that each campaign can be
measured and retargeted on its own.

| Audience | Who                                                            | Landing page                                       | `?aud=` |
| -------- | -------------------------------------------------------------- | -------------------------------------------------- | ------- |
| `youth`  | young people who like bold, quirky posters                     | `/landing/youth`                                   | `youth` |
| `album`  | people who want to print many photos and keep them in an album | `/landing/album` (sends them to `/photo-printing`) | `album` |

## How a visitor is told apart

Only by where a campaign sends them, never guessed from browsing:

- the ad link carries `?aud=youth` or `?aud=album` (works on any page), or
- they open the campaign's landing page.

`src/lib/audience.ts` remembers a **first** audience (90 days) and a **last** one (30 days) in the browser, like the traffic
source in `attribution.ts`. Meta events use the **last** one as `audience_type` (so a Meta custom audience follows what the
person came for most recently). The framed-poster order stores both inside `orders.ad_tracking -> attribution -> audience`.

## What to paste in Meta Ads Manager

For each campaign, set the ad's **Website URL** to the landing page and the **URL parameters** field to the matching line.
Meta fills `{{campaign.id}}` and `{{ad.id}}` itself; the site already reads them as the campaign and ad ids.

```
Website URL (youth):  https://brwazwneon.com/landing/youth
URL parameters:       utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&aud=youth

Website URL (album):  https://brwazwneon.com/landing/album
URL parameters:       utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&aud=album
```

## The landing pages

`youth` and `album` have a built-in page (`src/lib/landing-defaults.ts`) that works with nothing set up. Saving a landing
page with the same key in the dashboard replaces it. Until then:

- `youth`: a poster grid of the trending posters, with a WhatsApp button.
- `album`: a short page that sends people to photo printing. It quotes no prices.

## Known gaps (not covered by this change)

- Photo-printing orders (`photo_orders`, `photo_4x6_orders`) do not store any campaign or audience. Their purchases are
  attributed in Meta (Pixel and Conversions API), not in the dashboard.
- The dashboard's "Audience Campaign Performance" report still calls the retired Supabase backend.
- `landing_pages` (`neon/migrations/011_landing_pages.sql`) is missing from the production database: the saved-page lookup
  fails with HTTP 500 there. The built-in pages do not depend on it.
