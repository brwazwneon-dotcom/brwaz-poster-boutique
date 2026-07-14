# Smart Tooltips & Help Hints — Admin Dashboard

نظام شامل للـ Tooltips والمساعدة داخل الداش بورد يشرح كل زر وكل حقل بالعربي والإنجليزي، مع Help Mode و First-Time Tour.

## Phase 1 — البنية الأساسية (Foundation)

**1. Tooltip Registry**
- ملف واحد `src/lib/admin-help.ts` فيه قاموس شامل:
  ```ts
  helpTexts = {
    "orders.view": { ar: "...", en: "..." , severity?: "info"|"warning"|"danger" },
    "orders.mark_confirmed": { ... },
    "images.optimize": { ... },
    ...
  }
  ```
- كل النصوص المطلوبة في الطلب (Orders / Images / Homepage / AI / Performance / Reports / Status Badges / Warnings) موجودة هنا.

**2. مكونات موحدة**
- `<HelpTip id="orders.view">children</HelpTip>` — يلف أي زر/أيقونة ويظهر Tooltip.
- `<HelpBadge status="new_order" />` — Badge بشرح تلقائي.
- `<HelpIcon id="..." />` — أيقونة `?` صغيرة تظهر فقط عند تفعيل Help Mode.
- `<ColumnHelp id="orders.total">Total</ColumnHelp>` — لرؤوس الجداول.
- كلها فوق `shadcn/ui Tooltip` + دعم Long Press على الموبايل (`onTouchStart` مع مؤقت 500ms).

**3. Help Mode Toggle**
- Context: `HelpModeProvider` مع `useHelpMode()`.
- زر في Header الداش بورد (أيقونة `?`) يفعّل/يعطّل الوضع.
- لما يشتغل: تظهر أيقونات `?` صغيرة بجانب العناصر المهمة، و Tooltips تظهر بشرح أطول.
- محفوظ في `localStorage`.

**4. دعم اللغة و RTL**
- يقرأ اللغة من `admin-i18n` الموجود.
- Tooltip يتموضع تلقائياً حسب `dir=rtl`.

## Phase 2 — التطبيق على كل العناصر

- **Orders Tab:** أزرار View / Change Status / Copy WA / Open WA / Download Original / Mark Printing / Mark Shipped / Add Note / Run Check + رؤوس الجدول (Status / Total / Last Activity).
- **Images / Display Order Tab:** Replace / Adjust / Needs Edit / Ready / Quality / Optimize / Rebuild / HQ / Download / Delete / Hide-Show / Pin / Move.
- **Homepage Tab:** Show-Hide Section / Move Up-Down / Add-Remove Trending / Save / Preview.
- **AI Tab:** Run SEO / Bulk SEO / Test Key / Reset Cooldown / OpenRouter Fallback / Generate Desc / Copy Prompt.
- **Performance Tab:** Run Check / Optimize / Clear Cache / Rebuild Thumbnails / Compress / Find Heavy / Fix Broken.
- **Reports Tab:** Export CSV / Excel / Date Filter / Open Details.
- **Status Badges:** New Order / Needs Review / Printing / Low Quality / Hidden / Trending / Critical.
- **Warnings:** Delete / Bulk Hide / Restore Backup / Change Prices — بلون تحذيري (أحمر/برتقالي) في الـ Tooltip.

## Phase 3 — First Time Guide + AI Help

- **Tour:** مكون `AdminTour` بسيط بدون مكتبات — Overlay مع Highlight للعنصر الحالي + خطوات (Orders / Images / Status / WhatsApp / Performance / Homepage) + أزرار Next/Back/Skip/Don't show. محفوظ في `localStorage`.
- **Ask AI about this:** زر داخل كل Tooltip موسع (في Help Mode) يفتح المساعد الذكي الموجود ويمرر له `helpId` ليشرح بتوسع.
- **Help Content Manager (اختياري):** صفحة تحت الإعدادات للـ Owner فقط، تسمح بتعديل النصوص وإخفاء Tooltip معين وإرجاع الافتراضي. النصوص المعدلة تُحفظ في جدول `admin_help_overrides` (اختياري في Phase 3).

## ملاحظات مهمة

- ما يتغيرش أي منطق تشغيلي — إضافة UI فقط.
- الأداء: Tooltip من `@radix-ui` (شغال أصلاً في المشروع)، Lazy render.
- الموبايل: Long Press + أيقونة `?` في Help Mode.
- كل الأزرار الخطيرة (Delete/Bulk/Restore/Change Prices) عليها تحذير أحمر واضح.

## Technical Details

- `src/lib/admin-help.ts` — قاموس النصوص (~80 مفتاح).
- `src/components/admin/help/HelpTip.tsx`, `HelpBadge.tsx`, `HelpIcon.tsx`, `HelpModeToggle.tsx`, `AdminTour.tsx`.
- `src/hooks/useHelpMode.tsx` — Context + localStorage.
- تعديلات على مكونات التابات الموجودة لإضافة `<HelpTip id="..">` حول الأزرار.
- بدون migration في Phase 1-2. Phase 3 (Help Content Manager) يحتاج جدول `admin_help_overrides`.

## Rollout

1. Phase 1 (Foundation + Help Mode + دعم اللغة والموبايل).
2. Phase 2 (لف كل الأزرار في التابات الموجودة).
3. Phase 3 (Tour + Ask AI + Content Manager).

هل أبدأ بـ Phase 1 و 2 مباشرة؟
