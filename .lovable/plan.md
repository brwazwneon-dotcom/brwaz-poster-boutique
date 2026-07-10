
## Overview

سنبني نظام مراقبة متكامل داخل الداش بورد يعتمد على البنية الموجودة (`system_logs` + `admin_notifications`) بدون كسر أي شيء موجود. كل حاجة هتتربط ببعض: أي مشكلة تتسجل في Error Logs + تنشئ Notification + تظهر في Summary Cards.

## ما هو موجود بالفعل (نستفيد منه)

- `system_logs` table + RLS + client-side logger (`src/lib/error-logger.ts`) مع global handlers.
- `admin_notifications` table + `NotificationsCenterTab` + `NotificationBell`.
- RPC `admin_notifications_summary` (يرجّع 7 عدادات).
- تبويبات Admin موجودة: alerts, notifications, system-health, maintenance.

## الأقسام الجديدة

### 1. Error Logs Tab (جديد)
تبويب مستقل `error-logs` يعرض جدول `system_logs` كـ Cards مفهومة:
- Title مفهوم + Simple description (map من `category`/`message` عبر جدول ترجمة).
- Technical Details في `<details>` قابل للنسخ (stack + metadata + url).
- Severity chip بألوان (Low رمادي / Medium أزرق / High برتقالي / Critical أحمر).
- Status chip (Open / In Progress / Resolved) بأزرار تغيير الحالة.
- روابط للـ related order/customer لو الـ metadata فيها `order_id` / `customer_phone`.
- Filters: severity, status, category, search, date range.
- Pagination (50 كل صفحة).
- Actions: View Details, Copy Details, Mark Resolved.

### 2. Auto Bug Detector
دالة SQL `detect_bugs()` تعمل SCAN دوري وتنشئ notifications + system_logs entries:
- أوردر جديد بدون صور (join `orders` مع `photo_orders`/`custom_design_orders`).
- أوردر Printing > 24h.
- رقم واتساب مش صح (regex).
- أوردر بدون سعر منطقي (`total <= 0`).
- Low Quality Image (من metadata upload).
- Failed Uploads اللي مسجّلة كـ error.

تشغيل عبر:
- Client-side hook `useBugDetector()` يشغّل الفحص كل 5 دقايق لما الأدمن Online.
- زر Manual "Run Scan Now" في التاب.
- Dedupe عبر `entity_id` (لا تنشئ نفس الـ notification مرتين لنفس الأوردر).

### 3. Performance Monitor Tab
تبويب جديد `performance` يعرض:
- Web Vitals محفوظة في `analytics_visits` (لو موجودة) + قياسات client-side جديدة نضيفها في جدول `perf_metrics` جديد.
- عدد الأخطاء اليوم / Failed Uploads اليوم (من `system_logs`).
- Storage/DB status عبر ping بسيط.
- Cards ملونة: Good (< 1.5s) / Warning (1.5-3s) / Critical (> 3s).

جدول جديد `perf_metrics`:
```
id, page_path, metric (LCP/FCP/TTFB/upload_ms/page_load_ms),
value_ms, session_id, created_at
```
+ GRANTs + RLS (anon INSERT للـ metrics فقط، admin SELECT).
+ Client-side utility `recordPerfMetric()` يستدعى من `__root.tsx` (Performance Observer) ومن رفع الصور.
+ Auto notification لو صفحة > 3s متكرر.

### 4. Smart Alerts
Notifications موجودة بالفعل عبر `admin_notifications`. نضيف:
- `detect_bugs()` ينشئ التنبيهات المطلوبة.
- Enrich الـ notification بـ `link` (رابط للـ related entity) + `entity_type/id`.
- View في NotificationsCenterTab موجود (نضيف زر "Open Related Page" لو `link` موجود — موجود بالفعل عبر ExternalLink icon).

### 5. Dashboard Summary Cards
نوسّع RPC `admin_notifications_summary` لتضيف:
- `critical_errors_24h`, `open_bugs`, `failed_uploads_24h`, `slow_pages_24h`, `orders_need_attention`, `low_quality_24h`, `unresolved_alerts`.

نعرضها كـ Cards في أعلى `NotificationsCenterTab` + في `analytics` (Overview).

## Technical Details

### Migration واحدة
1. جدول `perf_metrics` + GRANTs + RLS + indexes.
2. تحديث RPC `admin_notifications_summary` بإضافة الحقول الجديدة.
3. دالة `detect_bugs()` SECURITY DEFINER تسكان وتـ upsert notifications.
4. دالة `resolve_error_log(uuid)` / `set_error_status(uuid, text)`.

### ملفات جديدة
- `src/components/admin/ErrorLogsTab.tsx`
- `src/components/admin/PerformanceMonitorTab.tsx`
- `src/lib/error-logs.ts` (fetch/update/humanize)
- `src/lib/bug-detector.ts` (run scan)
- `src/lib/perf-metrics.ts` (record + Performance Observer)

### تعديلات
- `src/routes/admin.tsx`: إضافة تبويبين جديدين (error-logs, performance) في الـ sidebar/menu.
- `src/components/ErrorLoggerBoot.tsx`: بدء الـ Performance Observer.
- `src/components/admin/NotificationsCenterTab.tsx`: توسيع Summary Cards.
- `src/lib/admin-i18n.tsx`: عناوين جديدة.

### Humanization map
`categoryToHuman` في `error-logs.ts`:
- `website_error` → "خطأ في الموقع"
- `upload_failed` → "فشل في رفع الصورة"
- `edge_function` → "حدثت مشكلة أثناء تنفيذ العملية..."
- إلخ.

### الأمان والأداء
- كل الاستعلامات فيها LIMIT + indexes موجودة.
- Detector يشتغل كل 5 دقايق فقط (setInterval + cleanup).
- Dedupe في notifications عبر `(type, entity_id)`.
- ما نلمسش أي وظيفة موجودة (checkout, orders, uploads تظل كما هي).

## Not in scope
- Server-side cron (pg_cron) — ممكن نضيفها لاحقًا؛ حاليًا نعتمد client-side scan لما الأدمن مفتوح الداش.
- Real-time subscriptions للـ error logs (نكتفي بـ refetch كل 30s).
