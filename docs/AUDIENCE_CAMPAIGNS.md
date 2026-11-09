# Two campaign audiences: youth and album

The store runs two ad campaigns, one per audience. The site tells their visitors apart so that each campaign can be
measured and retargeted on its own. There are no campaign-only pages: ads point at existing pages.

| Audience | Who                                                            | Ads point at      | `?aud=`                             |
| -------- | -------------------------------------------------------------- | ----------------- | ----------------------------------- |
| `youth`  | young people who like bold, quirky posters                     | `/` (or any page) | `youth`                             |
| `album`  | people who want to print many photos and keep them in an album | `/photo-printing` | `album` (also automatic, see below) |

## How a visitor is told apart

Never guessed from browsing, with one rule: **anyone who opens `/photo-printing` is the `album` audience**, with or without a tag. Otherwise by the ad link that brought them, which carries `?aud=youth` or `?aud=album`. The tag works
on any page, so a youth ad may also point at a category or a single poster.

`src/lib/audience.ts` remembers a **first** audience (90 days) and a **last** one (30 days) in the browser, like the traffic
source in `attribution.ts`. A page without `?aud=` changes nothing, so a returning visitor keeps the audience they came in
with. Meta events use the **last** one as `audience_type` (so a Meta custom audience follows what the person came for most
recently). The framed-poster order stores both inside `orders.ad_tracking -> attribution -> audience`.

## What to paste in Meta Ads Manager

For each campaign, set the ad's **Website URL** and the **URL parameters** field. Meta fills `{{campaign.id}}` and
`{{ad.id}}` itself; the site already reads them as the campaign and ad ids.

```
Website URL (youth):  https://brwazwneon.com/
URL parameters:       utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&aud=youth

Website URL (album):  https://brwazwneon.com/photo-printing
URL parameters:       utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&aud=album
```

## Known gaps (not covered by this change)

- Photo-printing orders (`photo_orders`, `photo_4x6_orders`) do not store any campaign or audience. Their purchases are
  attributed in Meta (Pixel and Conversions API), not in the dashboard.
- The dashboard's "Audience Campaign Performance" report still calls the retired Supabase backend.
