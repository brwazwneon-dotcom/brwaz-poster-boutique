# Auto Performance & Image Optimization System

نظام متكامل يراقب سرعة الموقع تلقائيًا وينشئ نسخ عرض محسّنة لكل صورة (Thumbnail / Preview / Large) — **بدون أي مساس بالصور الأصلية للطباعة**.

## المبادئ الأساسية (Non-negotiable)

- الصور الأصلية `original` **لا تُضغط ولا تُحذف ولا تُستبدل** أبدًا — تُحفظ كما هي للطباعة والتحميل فقط.
- كل الصور المعروضة في الموقع (Grid / Product / Lightbox) تستخدم نسخ محسّنة (WebP بجودة 82–90).
- Preserve Original Quality = ON دائمًا؛ لا يمكن تعطيلها من الواجهة.

## البنية

### 1. جدول `image_variants` جديد
```
id, source_table, source_id, original_path, variant (thumb|medium|large|web),
url, width, height, size_bytes, format, status (pending|processing|done|failed),
error, created_at
```
+ GRANTs + RLS (admin كامل، anon SELECT للـ URL فقط للعرض).
+ Index على `(source_table, source_id, variant)`.

### 2. Image Optimization Pipeline (Client-side)
- Utility `src/lib/image-pipeline.ts` يعمل عند رفع أي صورة:
  1. يرفع الأصلية كما هي (بدون ضغط).
  2. ينشئ 3 نسخ WebP بأحجام: **thumb 400px / medium 900px / large 1600px** عبر Canvas.
  3. يرفعهم إلى نفس bucket تحت مسار `variants/{variant}/...`.
  4. يسجّل كل نسخة في `image_variants`.
- عند الفشل: يُسجَّل في `system_logs` + notification، الأصلية تظل موجودة، الطلب لا يفشل.

### 3. `<SmartImage>` — تعديل بسيط
- يقرأ من `image_variants` عبر hook `useImageVariant(sourceId, variant)`.
- يبني `srcset` + `sizes` للـ responsive.
- Grid → thumb، Product → medium، Lightbox → large، Download → original.
- Fallback للأصلية لو النسخة المحسّنة غير موجودة (backward compatible).

### 4. Performance Monitor (يبني على الموجود)
- `src/lib/perf-metrics.ts` موجود ويسجّل LCP/FCP/TTFB/page_load. نضيف:
  - `CLS` عبر `PerformanceObserver({type:'layout-shift'})`.
  - `page_size_bytes` + `image_count` عبر `PerformanceObserver({type:'resource'})`.
  - قياس Slow API/DB queries من Supabase response headers.
- RPC جديدة `admin_performance_dashboard()` تُرجع:
  - الحالة العامة (Fast/Warning/Slow/Critical) بناءً على p75 LCP.
  - متوسط سرعة كل صفحة، أبطأ 20 صفحة، أبطأ/أكبر 20 صورة.
  - عدد الصور بدون thumbnail، Heavy images، Broken images.

### 5. صفحات Admin الجديدة

#### `Performance Control Center` — تبويب `performance` (نوسّع الموجود)
- Cards: حالة الموقع، متوسط السرعة، أبطأ الصفحات/الصور، آخر Optimization، Auto Optimization ON/OFF.
- زر **Run Auto Speed Fix** يشغّل الإصلاحات الآمنة.
- زر **Optimize Existing Images** مع Progress bar.

#### `Image Control Center` — تبويب جديد `images`
- إحصائيات: Total / Original / Optimized / Missing / Heavy / Broken / Pending.
- Storage used + average image size + Largest 20.
- أزرار: Optimize Existing / Rebuild Thumbnails / Rebuild Previews / Find Heavy / Find Broken / Clear Cache / Run Health Check.
- جدول Image Issues مع زر **Fix** لكل صف.

#### `Image Optimization Settings` — قسم داخل tab `settings`
- Toggles: Auto optimize new uploads، WebP، AVIF، Lazy loading، Responsive images.
- Inputs: Thumb size (400)، Medium (900)، Large (1600)، WebP quality (85)، JPEG quality (85)، Max display size.
- Toggle مقفول: **Preserve Original Quality (Owner only, locked ON)**.

### 6. Auto Speed Fix (Safe Actions)
عند LCP > 3s للـ p75:
- تفعيل Lazy Loading (لو مطفي).
- تقليل Homepage initial items إلى 12.
- استبدال أي `<img src=original>` بـ thumbnail (auto scan).
- مسح perf_metrics أقدم من 30 يوم.
- إعادة بناء thumbnails الناقصة.
- تأجيل Meta Pixel / GA4 (async/defer).

عند LCP > 6s → Critical:
- Notification عاجل.
- اقتراح تعطيل Section بطيء (يحتاج Confirm).

**ممنوع تلقائيًا**: حذف/ضغط الأصلية، إخفاء sections، Maintenance Mode.

### 7. Bulk Optimize Existing Images
Server function `optimizeExistingImages` (batch of 25):
- يفحص جدول `posters` + كل صور الأوردرات.
- لكل صورة بدون variants → يضيفها إلى queue.
- المعالجة الفعلية client-side (batch worker في تبويب Admin مفتوح) لتفادي حدود الـ worker.
- Progress: `Processing 25/1200 · Thumbnails 25 · Previews 25 · Skipped 25 · Failed 0`.

### 8. Assistant Integration
إضافة intents في `src/routes/api/admin-assistant.ts`:
- "الموقع بطيء ليه" → يقرأ Performance dashboard ويلخّص.
- "سرّع الموقع" → يشغّل Auto Speed Fix.
- "optimize للصور القديمة" → يشغّل Bulk Optimize.
- "الصور المكسورة" → يعرض Broken list.

### 9. Notifications
تُضاف إلى `admin_notifications`:
- `perf_slow_page`، `perf_critical_page`، `image_heavy_batch`، `image_thumb_failed`، `image_broken_detected`، `image_optimize_done`، `storage_almost_full`.

## Technical Details

### ملفات جديدة
- `src/lib/image-pipeline.ts` — إنشاء variants عند الرفع.
- `src/lib/image-variants.ts` — hooks (`useImageVariant`, `useImageStats`).
- `src/lib/performance-monitor.ts` — Auto Speed Fix runner.
- `src/components/admin/ImageControlCenter.tsx`
- `src/components/admin/ImageOptimizationSettings.tsx`

### تعديلات
- `src/lib/perf-metrics.ts` — إضافة CLS + resource size tracking.
- `src/components/SmartImage.tsx` — قراءة variants + srcset.
- `src/components/admin/PerformanceMonitorTab.tsx` — توسيع بـ Auto Fix + Optimize buttons.
- `src/routes/admin.tsx` — تسجيل تبويب `images` + Settings section.
- كل مكان يستدعي `uploadAndSign` للصور القابلة للعرض → wrap في `image-pipeline`.

### Migration واحدة
1. `CREATE TABLE image_variants` + GRANTs + RLS + indexes.
2. RPC `admin_image_stats()`.
3. RPC `admin_performance_dashboard()`.
4. RPC `enqueue_image_optimization(source_table, source_id, path)`.
5. توسعة `site_settings.key='image_optimization'` بالإعدادات الافتراضية.

### Rollout آمن
- كل التغييرات backward compatible: لو النسخة المحسّنة غير موجودة، النظام يعرض الأصلية (كما اليوم).
- لا تعديل على flow الرفع الحالي؛ الـ pipeline يعمل بجانبه.
- Bulk optimize opt-in (زر يدوي)، مش تلقائي على كل الصور القديمة دفعة واحدة.

## Out of scope (لاحقًا)
- AVIF (ينتظر توفر encoder موثوق client-side؛ WebP كافي الآن).
- Server-side pg_cron للـ optimization (نبدأ client-side worker).
- CDN transformer (Cloudflare Images) — بديل مستقبلي أفضل من Canvas.
