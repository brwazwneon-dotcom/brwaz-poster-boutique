# Two new Admin tools

Both live under the existing Admin panel and reuse the current premium black styling. No changes to the storefront checkout, cart, prices, or upload logic.

---

## 1) Bulk AI SEO per Sub Category

### Where it appears
Admin → **Categories** tab, in the sub-category rows under each main category.

- New button on every sub-category row: `✨ Generate SEO for all posters`
- Shown only for sub-categories (rows with `parent_id`), never on main categories.

### Confirmation modal (opens on click)
Header: sub-category name.

Body:
- Posters in this sub-category: **N**
- Estimated AI requests: **N** (or N×fields when "Regenerate all")
- Warning line about overwrite behavior.

Options block:
- Mode (radio): **Only fill missing fields** (default) · **Regenerate everything**
- Fields (checkboxes, all on by default): title, description, seo_title, seo_description, tags, hashtags, alt_text
- "Send a test notification when done" (optional toggle)

Buttons: Cancel · **Start SEO Generation**.

### Runner UI (drawer / inline panel)
Persistent while the batch runs:

```text
Processing 12 / 85 posters
✔ 10 completed   ⚠ 1 needs review   ✖ 1 failed   ↷ 0 skipped
[ Pause ] [ Resume ] [ Retry failed ] [ Stop ]
```

- Live poster list with per-row status chip and the fields that were updated.
- Errors expand to show the provider message.
- Progress persists across tab switches inside Admin while the browser stays open (in-memory queue in a React context).

### Backend
- New Supabase Edge Function `bulk-seo-generate` (single poster per invocation, batched from the client).
- Provider order: **OpenRouter** → **Gemini key rotation** on failure. No Lovable AI Gateway.
- Reuses the existing SEO prompt/system used by the current single-poster SEO tool; only difference is field-selection + overwrite mode.
- Safe update rule enforced server-side:
  - `Only fill missing` → the function reads the row first and writes ONLY the requested fields where the current value is null/empty.
  - `Regenerate everything` → overwrites the requested fields.
- Original image, price, category, sku, all other product data are never touched.

### Logs
New table `ai_seo_logs`:
- poster_id, category_id (sub-cat), status (`ok` / `failed` / `skipped` / `needs_review`), fields_updated (text[]), provider (`openrouter` / `gemini`), error (text, nullable), admin_user_id, created_at.

RLS: admins can select/insert; nobody else. Grants: `authenticated` + `service_role`.

New Admin sub-tab **AI SEO Logs** with a filterable table (by sub-category, status, date) and a CSV export.

---

## 2) Customer Purchase Test / Order Flow Preview

### Entry points
- Admin → **Orders** tab → new button `🧪 Preview as Buyer`
- Admin top-bar shortcut with same button.

### Test Mode
- Global toggle in Admin → **Settings** (persisted in `site_settings` key `test_mode`).
- Only visible to admins. Sends a signed `test_mode=1` cookie for the current admin session, so the storefront can detect it without leaking to real customers.
- When active:
  - A subtle black/gold `TEST MODE` badge sticks to the bottom-left of every storefront page (admin-only, via the cookie).
  - Any order the storefront submits while the cookie is present is flagged `is_test = true` on insert (via a signed request param the server verifies against the admin session).
  - Test orders are **excluded** from all analytics and admin dashboard aggregates (add `WHERE is_test = false` to `admin_dashboard`, `admin_realtime_analytics`, `admin_behavior_dashboard`).
  - Sales counters (`sales_count`, `cart_adds_count`, `views_count`) are NOT incremented for test orders.
  - No customer notifications (WhatsApp/email) are sent unless the admin explicitly opted in per-test (see next section).

### Preview as Buyer flow
Clicking the button opens the real storefront in a new tab with the cookie set, so the admin walks the actual customer journey end-to-end:
product → frame → size → cart → checkout → name/phone/governorate/address → payment screenshot upload → submit.

Every screen is the real one; nothing is mocked. The only differences are the badge, the `is_test` flag, and the notification suppression above.

After submit the admin sees the actual thank-you page a real customer sees (order number, payment instructions, WhatsApp button, estimated delivery, double-face-tape upsell, 4x6 upsell) — unchanged.

### Admin test result panel
Back in Admin → Orders, test orders show in a dedicated **Test Orders** section (isolated from real orders list) with:
- Order details, payment screenshot preview.
- "What the customer saw" — live iframe of `/order/success/{id}?admin_preview=1`.
- "What admin receives" — WhatsApp message preview, email preview (if email templates are enabled), push preview (if enabled).
- Actions: `Delete test order` · `Convert to real order` (clears `is_test`, ships) · `Run another test` (re-opens the flow) · `Send test notification to admin` (fires a one-off notification to the current admin only).

### Data changes
- `orders` gets `is_test boolean not null default false`.
- Analytics/aggregate views/functions updated to filter it out.
- No changes to prices, cart code, checkout logic, or order structure otherwise.

---

## Rollout order

1. Migration: `orders.is_test`, `ai_seo_logs` table + policies + grants, filter updates in `admin_dashboard` / `admin_realtime_analytics` / `admin_behavior_dashboard`.
2. Edge function `bulk-seo-generate` (OpenRouter + Gemini fallback).
3. Admin: `CategoryPicker` row button + confirmation modal + batch runner + AI SEO Logs sub-tab.
4. Test Mode toggle + admin cookie + storefront detection + badge + `is_test` write path.
5. Preview-as-Buyer buttons + Test Orders section + actions.

Everything ships behind admin-only surfaces; the storefront is otherwise untouched.
