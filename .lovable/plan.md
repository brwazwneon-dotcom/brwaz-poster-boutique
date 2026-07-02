# Plan: Subcategory Tools + 4x6 Photo Printing with AI

This is a large, multi-part request. I'll ship it in a single pass but organized into clear phases so nothing is missed. No redesign — all additions preserve the current BRWAZWNEON premium black/white style.

## Phase 1 — Subcategory Visibility & Bulk Tools (Admin > Categories)

**Schema (already present):** `categories.hidden` + `sort_order` exist.

**Admin UI additions in `src/routes/admin.tsx` Categories tree:**
- Per-subcategory row buttons: Show/Hide toggle (eye icon), Rename (inline), Delete (with poster-safety check), Move to another main category (dropdown of parent categories), Reorder (up/down arrows — already partial).
- Bulk toolbar (appears when ≥1 checkbox selected): Hide Selected, Show Selected, Delete Selected (blocks if any has posters unless "reassign to…" chosen), Merge Duplicates (choose target).
- Hidden badge for admin visibility.

**Customer filter:** In `src/routes/category.$slug.tsx` and any subcategory chip renderer, filter out `hidden = true` when not in admin/preview mode. Posters stay untouched.

## Phase 2 — 4x6 Photo Printing Service

**New table** `photo_4x6_orders`:
- `id, order_number, customer_name, phone, address, governorate, package_key ('p8'|'p12'), photo_count, total_price, status, notes, created_at, updated_at`
- `original_paths text[]`, `enhanced_paths text[]`, `suit_paths text[]`, `selected_versions jsonb` (per-photo choice: original/enhanced/suit)

**New storage bucket** `photo-4x6` (private) with UUID-prefixed folder policy, similar to `custom-designs`.

**New site_settings key** `photo_4x6_config`:
```json
{
  "enabled": true,
  "packages": [
    {"key":"p8","photos":8,"price":80,"label":"8 صور 4×6"},
    {"key":"p12","photos":12,"price":99,"label":"12 صور 4×6"}
  ],
  "aiEnhanceEnabled": true,
  "aiSuitEnabled": true,
  "upsellEnabled": true,
  "upsellExampleImage": "",
  "upsellTitle": "Print Your Personal Photos 4×6",
  "upsellSubtitle": "Upload your favorite photos and we'll enhance the quality before printing."
}
```

**New route** `src/routes/photo-4x6.tsx`:
- Package selector cards (8/80 & 12/99, admin-configurable).
- Multi-image uploader (JPG/PNG/WEBP/HEIC → HEIC converted client-side via `heic2any` or server fallback).
- Client-side quality gate: min 800px on shortest side, warn otherwise.
- Per-photo action buttons: Enhance Quality, Improve Colors, Sharpen Face, Remove Blur, Prepare for Printing, "خلي الصورة ببدلة / Wear a Suit".
- Before/After slider (reuse existing `BeforeAfter.tsx`).
- Version picker per photo: Use Original / Use Enhanced / Use Suit.
- Checkout form → creates `photo_4x6_orders` row, uploads all three variant sets to storage, sends WhatsApp + FCM.

## Phase 3 — AI Enhancement & Suit

**Server function** `src/lib/photo-ai.functions.ts` (protected by `requireSupabaseAuth`-optional? No — public since customer flow, but heavily rate-limited by IP + honeypot):
- Actually, keep it callable anonymously since checkout is anonymous. Add basic per-session throttle server-side (max N requests/minute per IP) and file-size limits (≤ 8MB per image).
- Uses **Lovable AI Gateway**, model `google/gemini-3.1-flash-image` (Nano Banana 2) for both enhancement and suit generation via `/v1/images/generations` with input image editing.
- Prompts:
  - `enhance`: "Enhance photo quality for 4x6 print: increase sharpness, improve dynamic range, denoise, keep colors natural. Do not alter faces or composition."
  - `colors`: "Improve color balance and vibrancy for print output. Keep skin tones natural."
  - `sharpen_face`: "Sharpen facial features while preserving natural skin texture."
  - `remove_blur`: "Reduce motion/focus blur; keep composition."
  - `prepare_print`: "Optimize contrast, sharpness, and color for 4x6 photo print."
  - `suit`: "Transform the person into wearing a professional formal business suit (dark navy or black), keep the exact face, hair, and background. Do not add or remove people. If no clear person is visible, return an error."
- Returns base64 or storage URL; client stores enhanced/suit variants alongside originals.
- Person-detection safety: if suit response indicates no person (via a quick pre-check with Gemini vision `google/gemini-3-flash-preview` returning `has_person` bool), show the "Suit option works best with clear personal photos" message and do not burn image credits.
- Graceful failure: if AI errors, keep original selected and show "Our designer will enhance your photo manually before printing."

**Background processing:** fire-and-await per photo, but non-blocking UI — spinner per image, checkout enabled even if some are still processing (uses original if enhanced not ready).

## Phase 4 — Checkout Upsell Popup

**In `src/routes/cart.tsx`:** intercept checkout click. If `upsellEnabled` AND cart has no 4x6 item yet AND not shown this session (`sessionStorage`):
- Show modal with title/subtitle/example image + 2 package cards + "Add 4×6 Photos" / "Continue Without It".
- "Add" → `navigate('/photo-4x6?from=checkout')`.
- Runs AFTER the existing double-face-tape popup, in sequence.

## Phase 5 — Admin Orders & Settings

**Admin > Orders:** new tab/filter "4×6 Photos" showing `photo_4x6_orders` with customer info, package, all photo variants (thumbnail grid grouped by original/enhanced/suit), download-all ZIP, Mark Printed, Mark Delivered.

**Admin > Pricing (or new "4×6 Service" section):** edit packages (photos+price), toggle enable/disable, toggle AI enhance, toggle Wear a Suit, toggle upsell popup, change example image (upload), change popup title/subtitle.

## Phase 6 — Performance & Security

- Client-side compression before upload (canvas resize to max 2400px long edge, JPEG q0.9).
- Max 8MB per file, max 24 files per session.
- MIME sniff + extension whitelist; storage policy enforces UUID folder.
- AI calls run server-side only; API key never in client.
- If AI fails: original kept, friendly message shown, checkout unblocked.
- HEIC decoded via dynamic import to avoid bundle bloat.

## Technical details

- New tables get GRANTs for `authenticated` + `service_role`; anon insert allowed for `photo_4x6_orders` (public checkout) with strict RLS: insert allowed with rate check via trigger; select only for admin.
- New bucket policies mirror `custom-designs` pattern.
- Reuse existing FCM notification pipeline for new 4x6 orders.
- Reuse existing `BeforeAfter.tsx` component.
- All strings bilingual (EN/AR) via existing admin-i18n where relevant on admin side; customer flow supports Arabic labels as specified.

## Files to create
- `src/routes/photo-4x6.tsx`
- `src/lib/photo-ai.functions.ts`
- `src/components/PhotoUpsellModal.tsx`
- `src/components/admin/Photo4x6Tab.tsx` (orders)
- `src/components/admin/Photo4x6Settings.tsx`

## Files to modify
- `src/routes/admin.tsx` (categories tools + new tabs)
- `src/routes/category.$slug.tsx` (hide hidden subcats for customers)
- `src/routes/cart.tsx` (upsell modal integration)
- `src/lib/use-settings.ts` (photo_4x6_config)
- Header/Shop menu link to `/photo-4x6`

## Migrations
1. Table `photo_4x6_orders` + GRANTs + RLS + order-number sequence reuse.
2. Storage bucket `photo-4x6` + policies.
3. Seed `site_settings.photo_4x6_config`.

Ready to implement.