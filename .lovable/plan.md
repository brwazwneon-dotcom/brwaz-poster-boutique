
# Category Display Order Manager

طلبك كبير جدًا. هقسمه على 3 دفعات عشان يوصل شغّال وسريع، ونبني فوقه.
لو موافق على Phase 1، هبدأ فورًا وبعدها ننتقل للـ Phase 2 و 3.

---

## Phase 1 — النواة الأساسية (اللي هيخليك تتحكم فعليًا في الترتيب)

**Database**
- إضافة `display_order INTEGER` و `pinned BOOLEAN` على جدول `posters` (per-category ordering يعتمد على الفئة الحالية `category_id`).
- إضافة `sort_mode TEXT` و `display_order INTEGER` على جدول `categories` (لترتيب الـ Sub Categories وطريقة العرض).
- دوال SQL آمنة (admin only):
  - `admin_reorder_posters(category_id, ordered_ids uuid[])`
  - `admin_pin_poster(id, pinned)`
  - `admin_reorder_subcategories(parent_id, ordered_ids uuid[])`
  - `admin_set_category_sort_mode(id, mode)`

**Admin UI — تبويب جديد "Display Order"**
- شبكة من الكاتيجوريز الرئيسية. الضغط عليها يفتح صفحة الترتيب.
- داخل الكاتيجوري:
  - **Sub-tabs:** Posters Order · Sub Categories Order · Settings.
  - **Posters Order:** Grid بالـ thumbnails فقط (variant `thumb`) — أول 50 + Load More.
    - Drag & Drop (dnd-kit) — موجود فعلًا في المشروع.
    - أزرار لكل صورة: Move Up · Move Down · Pin to Top · Send to Bottom · Edit Order # · Hide/Show.
    - Badge "Pinned First" على المثبّتة.
    - Search + Filter (Sub Category / Visible / Trending / Best Seller).
    - Save Order → Toast: "تم حفظ ترتيب الكاتجوري بنجاح".
  - **Sub Categories Order:** نفس آلية الـ drag & reorder.
  - **Settings:** Sorting Mode (Manual / Newest / Best Sellers / Trending / Most Viewed / Random / AI) + Preview button يفتح `/category/{slug}` في تاب جديد.

**Storefront**
- `src/routes/category.$slug.tsx`: لما `sort_mode = manual`، نستخدم `order("pinned desc, display_order asc, created_at desc")` بدل قائمة Sort الحالية.
- باقي الـ modes ماتتش المنطق الحالي.
- ترتيب الـ Sub Categories في نفس الصفحة يتبع `display_order`.

---

## Phase 2 — Polish و Bulk Actions

- Checkboxes + Bulk: Move to Top / Bottom · Hide/Show · Mark Trending / Best Seller · Remove from Category · Move to Another Category.
- First Visible Items panel — pins مرقّمة (1..N) مع سحب مرئي.
- Activity Log لكل تغيير ترتيب (admin, category, poster, old→new, timestamp) في `system_logs`.

## Phase 3 — AI Assistant hooks

- أوامر عربية للـ Admin Assistant الموجود:
  - "خلي ميسي أول صورة في Football" → يبحث بالاسم، يعرض تأكيد، ثم `admin_pin_poster` + reorder.
  - "رتب Football يدويًا" → يحوّل sort_mode = manual.
  - أي تعديل يطلب تأكيد قبل الحفظ.

---

## Notes

- ماحدش هيتحذف. الترتيب فقط يؤثر على العرض.
- الترتيب per-category — لو نقلت بوستر لكاتيجوري تانية يبدأ ترتيب جديد.
- الـ Storefront لازال يحترم `hidden = false`.
- Homepage sections اللي بتقرأ من نفس الكاتيجوري هتلتزم تلقائيًا بالترتيب اليدوي.

**موافق أبدأ Phase 1 فورًا؟**
