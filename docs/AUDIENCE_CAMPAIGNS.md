# Two audiences: poster buyers (`youth`) and photo-album printers (`album`)

The site tells the two audiences apart **by the pages a visitor opens**. Nothing has to be added to any ad link.

| Audience | Who opens these pages                                   | Pages                                                                        |
| -------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `youth`  | people browsing the framed posters                      | `/category/*`, `/poster/*`, `/best-sellers`, `/trending`, `/sets`, `/offers` |
| `album`  | people who want to print their photos and keep an album | `/photo-printing`, `/photo-4x6`                                              |

Shared pages tag nobody: the home page, cart, checkout, search, thank-you, track-order and so on. A visitor who only
opened shared pages has no audience.

`youth` is just the stored name of the poster audience (it appears in Meta events and in orders).

## What is remembered

`src/lib/audience.ts` keeps, in the visitor's browser, a **first** audience (90 days) and a **last** one (30 days),
like the traffic source in `attribution.ts`. It is updated on every page change.

- Meta events carry the **last** one as `audience_type`, so a Meta custom audience follows what the person looked at most
  recently. Someone who browsed posters and then opened photo printing is `album` from then on, until they browse posters
  again.
- The framed-poster order stores both in `orders.ad_tracking -> attribution -> audience` (`first` and `last`).

## Optional: tagging a link on purpose

A link may still carry `?aud=youth` or `?aud=album`. It wins over the page, so one ad can point at any page and still be
tagged. This is optional and never needed.

## Known gaps

- Photo-printing orders (`photo_orders`, `photo_4x6_orders`) do not store any audience. Their purchases are attributed in
  Meta (Pixel and Conversions API), not in the dashboard.
- The dashboard's "Audience Campaign Performance" report still calls the retired Supabase backend.
