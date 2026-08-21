# ملف السياق التقني — BRWAZ Poster Boutique

> **آخر تحديث:** 26 يوليو 2026  
> **اسم المشروع:** `brwaz-poster-boutique`  
> **الموقع الرسمي:** https://brwazwneon.com  
> **النوع:** متجر إلكتروني متكامل للبوسترات والطباعة الفوتوغرافية مع دعم عربي كامل  

---

## 1. نظرة عامة على المشروع (Project Overview)

### 1.1 المفهوم الأساسي
منصة تجارة إلكترونية مصرية متخصصة في بيع البوسترات المطبوعة والإطارات (PVC, Wooden) وخدمات الطباعة الفوتوغرافية. تدعم التصميم المخصص (Custom Design) وتحسين الصور بالذكاء الاصطناعي.

### 1.2 الفئة المستهدفة
- العملاء في مصر (دعم كامل للغة العربية، عملة EGP، طرق دفع محلية: Instapay, COD)
- مهتمون بالبوسترات (أفلام، كرة قدم، أنمي، سيارات، ديكور، موسيقى، عائلي)
- باحثون عن تصميم مخصص للصور الشخصية
- باحثون عن طباعة صور فوتوغرافية عالية الجودة

### 1.3 طريقة العمل العامة
1. **التصفح**: متجر إلكتروني بأقسام (فئات، مجموعات، عروض، الأكثر مبيعاً، الرائجة)
2. **التخصيص**: اختيار الإطار (PVC/Wood)، الحجم (20×30 إلى 100×60 سم)، اللون (أسود/أبيض/خشب)
3. **السلة والدفع**: سلة تسوق مع خصم الكمية، دفع عبر Instapay أو COD
4. **الطلبات**: إدارة الطلبات عبر لوحة تحكم المسؤول مع تتبع المراحل
5. **المحتوى المخصص**: رفع الصور وتحريرها وتخصيص الإطارات للبوسترات
6. **الطباعة الفوتوغرافية**: خدمة طباعة صور 4×6 وصور تقليدية (3 أحجام)
7. **الذكاء الاصطناعي**: مساعد بحث، تحسين الصور، اقتراح بيانات وصفية، توليد محتوى تسويقي

---

## 2. التقنيات والبيئة المستخدمة (Technologies & Stack)

### 2.1 لغات البرمجة
| اللغة | الاستخدام |
|-------|-----------|
| **TypeScript 5.8** | كل الكود (99% TS، بدون JavaScript خام) |
| **CSS** | Tailwind CSS v4 + shadcn/ui |
| **SQL** | قواعد بيانات Supabase (PostgreSQL) |

### 2.2 إطار العمل الأساسي — TanStack Start
```
@tanstack/react-router ^1.168.25        ← التوجيه (Routing)
@tanstack/react-start ^1.167.50         ← SSR + Server Functions
@tanstack/react-query ^5.83.0           ← إدارة حالة الخادم (Server State)
@tanstack/router-plugin ^1.167.28       ← Vite plugin للتوجيه
@tanstack/zod-adapter ^1.167.0          ← Zod validation
vite ^8.0.16                            ← بناء وتطوير
nitro 3.0.260603-beta                   ← Nitro SSR engine
```

### 2.3 واجهة المستخدم
```yaml
UI:
  React 19.2: واجهة المستخدم
  Tailwind CSS 4.2: تصميم
  shadcn/ui (new-york style): مكونات UI (46 مكوناً)
  tw-animate-css 1.3.4: حركات CSS
  cmdk: قائمة أوامر
  embla-carousel-react 8.6.0: كاروسيل
  lucide-react 0.575.0: أيقونات
  recharts 2.15.4: رسوم بيانية
  sonner 2.0.7: إشعارات توست
  vaul 1.1.2: Bottom sheet
  react-day-picker 9.14.0: منتقي التاريخ
  react-resizable-panels 4.6.5: ألواح قابلة للسحب
  react-hook-form 7.71.2: نماذج
  @hookform/resolvers 5.2.2: تحقق من صحة النماذج
  input-otp 1.4.2: إدخال OTP
```

### 2.4 i18n والتدويل
```
i18next ^26.3.6           ← إطار التدويل
react-i18next ^17.0.10   ← React binding
i18next-browser-languagedetector 8.2.1 ← كشف اللغة
اللغات: ar (عربي, fallback), en (إنجليزي)
ملفات الترجمة: src/lib/locales/{ar,en}.json
```

### 2.5 قاعدة البيانات — Supabase (PostgreSQL)
```yaml
مشروع Supabase:
  Project ID: volrlqjrsxemhjwrnpun
  إصدار: supabase-js ^2.108.2
  عدد التهجيرات: 90 تهجيرة (من 24 يونيو إلى 22 يوليو 2026)
  الإضافات: pg_trgm (بحث نصي), pg_cron (جدولة المهام)
  البنية:
    - public: الجداول الأساسية
    - extensions: pg_trgm, pg_cron
    - storage: الصور والملفات
```

#### الجداول الأساسية
| الجدول | الغرض |
|--------|-------|
| `posters` | البوسترات (SEO، hidden، trending، pinned، sales_count، edit_settings) |
| `categories` | الفئات (هرمية: parent_id، slug، image_url، sort_order) |
| `orders` | الطلبات (حالة، سعر، شحن، ملاحظات) |
| `order_items` | عناصر الطلب |
| `cart_items` | عناصر السلة |
| `wishlists` | المفضلة |
| `recently_viewed` | المشاهدة مؤخراً |
| `image_variants` | متغيرات الصور المحسّنة (thumb/small/medium/large × AVIF/WebP) |
| `site_settings` | إعدادات الموقع (جميع الإعدادات الديناميكية) |
| `admin_devices` | أجهزة المسؤول للإشعارات |
| `admin_notifications` | إشعارات المسؤول |
| `analytics_visits` | زيارات التحليلات |
| `analytics_poster_events` | أحداث البوسترات |
| `best_sellers` | الأكثر مبيعاً |
| `hero_banners` | البانرات الرئيسية |
| `slider_images` | صور السلايدر |
| `before_after` | صور قبل/بعد |
| `reviews` | المراجعات |
| `photo_orders` | طلبات الطباعة الفوتوغرافية |
| `photo_4x6_orders` | طلبات الصور 4×6 |
| `custom_design_orders` | طلبات التصميم المخصص |
| `backups` | النسخ الاحتياطية |
| `assistant_requests` | طلبات المساعد الذكي |
| `collection_showcase_settings` | إعدادات عرض المجموعات |
| `collection_showcase_images` | صور عرض المجموعات |
| `sets` | مجموعات الإطارات (Frame Sets) |
| `system_logs` | سجلات النظام |
| `perf_metrics` | مقاييس الأداء |
| `visitor_profiles` | ملفات الزوار للتخصيص |
| `visitor_interest_scores` | درجات الاهتمام |
| `visitor_cart_events` | أحداث السلة |
| `marketing_secrets` | أسرار التسويق (Firebase, Meta CAPI) |
| `trending_searches` | عمليات البحث الرائجة |
| `highlights` | النقاط البارزة |
| `notifications_logs` | سجل الإشعارات |
| `assistant_config` | إعدادات المساعد |
| `landing_pages`, `landing_page_posters` | صفحات الهبوط |
| `custom_offers` | العروض المخصصة |
| `campaigns` | الحملات التسويقية |

### 2.6 الخدمات السحابية والتكاملات الخارجية
| الخدمة | الغرض |
|--------|-------|
| **Supabase** | قاعدة البيانات، المصادقة، التخزين، RPC |
| **Vercel** | استضافة (Cloudflare Workers module preset) |
| **Firebase Cloud Messaging** | إشعارات PUSH للمسؤولين |
| **Google Gemini API** | تحسين الصور، توليد بيانات وصفية، ذكاء اصطناعي |
| **OpenRouter** | سيرفر بديل للذكاء الاصطناعي (Llama 3.3, Qwen 2.5) |
| **Meta Pixel + CAPI** | تتبع الإعلانات (Facebook/Meta Ads) |
| **Google Analytics 4 (gtag.js)** | تحليلات جوجل |
| **TikTok Pixel** | تتبع إعلانات تيك توك |
| **ipapi.co** | كشف الموقع الجغرافي للزوار |
| **Lovable AI Gateway** | بوابة الذكاء الاصطناعي للمساعد الإداري |
| **jsPDF + jspdf-autotable** | توليد PDF (التقارير) |
| **xlsx** | تصدير Excel |
| **heic2any** | تحويل صور HEIC |
| **html2canvas** | التقاط لقطات شاشة للصور |
| **isomorphic-git** | تكامل Git (نادر الاستخدام) |

### 2.7 أدوات التطوير
```yaml
TypeScript 5.8: لغة البرمجة
ESLint 9.32: فحص الكود
Prettier 3.7: تنسيق الكود
Vitest 4.1: اختبارات
jsdom 29.1: بيئة DOM للاختبارات
@types/node 22.16: أنواع Node
@vitejs/plugin-react 5.2: React plugin لـ Vite
@lovable.dev/vite-tanstack-config 2.7.4: تكوين Lovable المخصص
```

### 2.8 نظام الصور وتحسينها
```
Image Variants (image_variants table):
  thumb  (240px) ← AVIF, WebP, original
  small  (320px) ← AVIF, WebP, original
  medium (640px) ← AVIF, WebP, original
  large  (1280px) ← AVIF, WebP, original

نظام نسخ احتياطية:
  BACKUP_TABLES: 14 جدولاً
  التشفير: AES-256-GCM (مفتاح من BACKUP_ENCRYPTION_KEY)
  الاحتفاظ: 30 يومي + 12 أسبوعي + 12 شهري + 5 أمان
```

---

## 3. هيكلة الصلاحيات وأمن النظام (Permissions & Access Control)

### 3.1 أنواع المستخدمين
| الدور | الوصف |
|-------|-------|
| **عام (Public/Anon)** | زائر غير مسجل — يرى المتجر، يضيف للسلة، يقدم طلبات |
| **مسجل (Authenticated)** | مستخدم مسجل — يضيف للمفضلة، يرى آخر المشاهدة |
| **مسؤول (Admin)** | دور `admin` في جدول `user_roles` — يدير الموقع بالكامل |
| **محرر (Editor)** | دور `editor` — صلاحيات محدودة (غير مستخدم حالياً) |
| **مشاهد (Viewer)** | دور `viewer` — يرى لوحة التحكم فقط (غير مستخدم حالياً) |

### 3.2 المصادقة — Supabase Auth
```yaml
النظام: Supabase Auth (بريد إلكتروني + كلمة سر)
إدارة الجلسة: autoRefreshToken + persistSession
التسجيل التلقائي للمسؤول:
  - مستخدم brwazwneon@gmail.com يحصل على دور admin تلقائياً
  - يتم عبر grant_admin_for_brand_email() function
كشف الدور: has_role(user_id, role) function
تقييد: has_role محظور للمستخدمين العامين والمسجلين
         (يُسمح فقط للجلسات المصادقة عبر auth.uid())
```

### 3.3 RLS Policies للملفات (Storage)
```
custom-designs bucket:    anyone → upload (لرفع الصور للطلب)
originals bucket:         admin only → upload
customer-photos bucket:   anyone → upload
backups bucket:           admin only → CRUD
posters bucket:           public → read, admin → write
poster-optimized bucket:  public → read, admin → write
photo-4x6 bucket:         anyone → upload
```

### 3.4 أمان الخادم
```
- Admin API: Bearer token → getClaims → has_role RPC
- Backup API: x-backup-secret header (constant-time comparison)
- Server Functions: protected via createServerFn with Supabase auth check
- AI Functions: poster-ai.functions → admin-only
- Firebase Admin: only imported by admin code, never public routes
- Gemini API Keys: 10 keys (GEMINI_API_KEY_1..10) مع cooldown معدّل
```

### 3.5 صلاحيات لوحة التحكم
```
- كل تبويبات الإدارة تتطلب auth + admin role
- إن لم يكن المستخدم مسؤولاً → تظهر رسالة "No admin access"
- "/admin" و "/auth" فقط مسموح بهما أثناء وضع الصيانة
```

---

## 4. منطق العمل وسير العمليات (Business Logic & Workflow)

### 4.1 دورة حياة البوستر (Poster Lifecycle)
```
1. رفع الصورة الأصلية → Supabase Storage (bucket: originals)
2. تحسين الصورة تلقائياً → image_variants (thumb/small/medium/large × AVIF/WebP)
3. مراجعة الذكاء الاصطناعي → generatePosterMeta() (seo, category, title, description)
4. نشر → posters.hidden = false
5. تتبع → views_count, sales_count, trending, pinned
6. تحديث → admin يمكن تعديل edit_settings (fit, zoom, pan, stretch, rotate)
```

### 4.2 دورة حياة الطلب (Order Lifecycle)
```
1. يختار العميل بوستر + إطار/لون/حجم
2. يضيف للسلة (مع خصم الكمية)
3. يتابع إلى صفحة السلة:
   - يعدل الكمية
   - يختار طريقة الدفع (Instapay/COD)
   - يرفع صورة الدفع (إن وجدت)
   - يملأ بيانات التوصيل
4. إرسال الطلب → Supabase orders + order_items
5. المسؤول يستلم إشعار FCM
6. تحديث الحالة عبر لوحة التحكم (13 مرحلة: order_created → delivered)
7. WhatsApp: رسائل تأكيد، طباعة، شحن، مراجعة
```

### 4.3 نظام السلة (Cart System)
```
تقنية: React Context + localStorage
مفتاح: brwazwneon_cart_v1
الخصم التلقائي:
  - 2+ Posters: 10% خصم
  - 3+ Posters: 15% خصم
  - 4+ Posters: 20% خصم
العرض الخاص:
  - 6-pack 20x30: سعر خاص
  - 4-pack 30x40: سعر خاص
الرسوم: packaging_fee (20 EGP)، shipping (حسب العتبة المجانية)
عند الإضافة: Meta Pixel (AddToCart) + analytics + behavior tracking
```

### 4.4 نظام المفضلة (Wishlist)
```
تقنية: Hybrid (local storage + Supabase sync)
1. Hydrate من localStorage عند التحميل
2. عند تسجيل الدخول → merge local + DB via upsert
3. عند Toggle → تحديث فوري + Meta Pixel (AddToWishlist) + sync Supabase
```

### 4.5 نظام التوصيات والتخصيص (Behavior)
```
النظام: Visitor profiles + interest scoring
حدث  CategoryBrowse: +1-3 للفئة
حدث  ProductView: +1-3 للفئة، +0.3-1 للوسم
حدث  Wishlist/Cart: +1 للفئة
حدث  Purchase: merge_visitor_to_phone
RPCs:
  - upsert_visitor_profile()
  - score_visitor_interest(category_id, score, tag, size, frame_type)
  - get_recommendations(limit) → 7 فئات توصيات
```

### 4.6 نظام تحسين الصور بالذكاء الاصطناعي (Photo AI)
```
الإجراءات المدعومة:
  - enhance: تحسين عام
  - colors: تحسين الألوان
  - sharpen_face: توضيح الوجه
  - remove_blur: إزالة الضبابية
  - prepare_print: تجهيز للطباعة
  - suit: إضافة بدلة رسمية
النموذج: Gemini Image Generation (vision model)
المُدخل: data:image/... URL (أقصى ~8MB)
المُخرج: { ok, imageBase64, error, message }
حالة خاصة: suit → "NO_PERSON" → return error: "no_person"
```

### 4.7 نظام توليد البيانات الوصفية (Poster AI)
```
المُدخل: image_url, filename, categories, category, badge
النظام: Gemini + prompt مع SEO copywriter persona
التحقق: حظر cross-category (مثلاً إسلامي ≠ أنمي)
المُخرج:
  - title, description, SEO fields, slug
  - badge, tags, hashtags, category_id, subcategory_id
  - suggested names, colors, orientation
  - confidence, detected_subject, detected_type, detected_language
  - visual_style, needs_review, validation_conflicts
المراجعة التلقائية: confidence < 0.5 → needs_review: true
```

### 4.8 نظام النسخ الاحتياطي (Backups)
```
الجدول: pg_cron → /api/public/hooks/backup
التكرار: يومي (أو يدوي عبر admin)
البيانات: 14 جدولاً + قائمة ملفات Storage
التشفير: AES-256-GCM (SHA-256 للمفتاح)
الاستعادة: manual restore، emergency restore (أحدث نسخة صحية)
الاحتفاظ: 30 يومي + 12 أسبوعي + 12 شهري + 5 أمان
```

### 4.9 نظام إشعارات المسؤولين (FCM)
```
البنية التحتية: Firebase Cloud Messaging
Service Worker: /firebase-messaging-sw.js (CDN + firebase compat SDK)
الإشعارات:
  - notifyNewOrder → يرسل لجميع admin_devices
  - notifyMaintenanceToggle → عند تفعيل/إلغاء الصيانة
  - sendTestNotification → اختبار
تسجيل الجهاز: requestAndRegisterAdminDevice()
  - يطلب الإذن
  - يحصل على FCM token
  - upsert في admin_devices
  - يسجل onMessage للمقدمة
```

### 4.10 نظام مراقبة الأخطاء (Error Monitoring)
```
Client-side:
  - window.onerror + unhandledrejection → system_logs
  - In-memory dedup (30s)
  - يهمل أخطاء تحميل الموارد (معالجة في SafeImage)
  - يرسل لـ Lovable error reporting API

Server-side:
  - errorMiddleware يلتقط الأخطاء غير المتوقعة
  - normalizeCatastrophicSsrResponse يعالج أخطاء SSR
  - lastCapturedError مع TTL 5s

سجلات الأخطاء:
  - fetchErrorLogs() ← مرشحة بالخطورة/الحالة/الفئة/البحث
  - setErrorLogStatus() ← تحديث حالة الخطأ
  - humanizeError() ← تحويل الخطأ لنص عربي
```

### 4.11 نظام تحليلات الموقع
```
ثلاث طبقات:
  1. تحليلات داخلية (analytics_visits + analytics_poster_events)
     - trackVisit(path) ← زائر/جلسة/مسار/مصدر/جهاز/موقع
     - markUniqueView(posterId) ← مشاهدة فريدة
     - logPosterEvent(posterId, eventType) ← أحداث البوسترات
  
  2. Meta Pixel + CAPI (خادم + متصفح)
     - أحداث قياسية: PageView, ViewContent, AddToCart, Purchase...
     - أحداث مخصصة: ViewCategory, PhotoPrintingCustomer...
     - Advanced Matching (email, phone)
     - eventID لمنع التكرار
  
  3. Google Analytics 4 (gtag.js)
     - page_view, search, view_item, add_to_cart...
  
  4. TikTok Pixel
     - يتم تحميله عبر script + requestIdleCallback
     - fires page() على تغيير المسار
```

### 4.12 نظام إعدادات الأداء (Performance Flags)
```
العلامات المتاحة:
  - emergency_fast_mode: يلغي كل شيء غير أساسي
  - safe_mode: يحمي من الأعطال
  - pause_heavy_jobs: يوقف المهام الثقيلة
  - disable_preloader: يلغي تحميل الموارد المسبق
  - disable_social_proof: يلغي إشعارات البيع
  - disable_floating_offer: يلغي فقاعة العرض العائم
  - analytics_defer_ms: تأخير تحميل التحليلات
  - whatsapp_enabled، assistant_enabled، offers_enabled
  - max_home_sections: أقصى عدد أقسام للصفحة الرئيسية
  - collapse_tools_mobile: طي الأدوات على الجوال

التخزين: site_settings (key: "performance_flags") + cache window.__brwzPerfFlags
إعادة التحميل: staleTime 30s
```

### 4.13 نظام العرض والتخصيص
```
FramePreview (المكوّن الموحّد لعرض البوستر):
  - جميع البوسترات في الموقع تستخدم FramePreview حصراً
  - يركّب صورة الإطار (mockup) فوق صورة البوستر
  - الموضع: top/left/width/height كنسب مئوية من settings الموقع
  - CSS إلزامي: object-fit:cover، transform:none، scale:1، line-height:0، display:block

خصائص FramePreview:
  - posterUrl، avifSrcSet، webpSrcSet، sizes (للاستجابة)
  - frameType (pvc/wood)، color (black/white/wood)
  - aspectClassName: نسبة العرض إلى الارتفاع
  - bare: بدون إطار خارجي
  - editSettings: تعديل الموضع والقص
  - artwork: محتوى مخصص
```

### 4.14 نظام التحقق من صورة المعرض (Canvas Validation)
```
تُستخدم في CategoryGrids لاختيار أفضل الصور للمجموعات:
  1. تحميل الصورة في canvas بحجم 56×56
  2. أخذ عينات من البيكسل عند الحواف والوسط
  3. رفض الصور ذات الزوايا (landscape)
  4. رفض الصور ذات "حواف تشبه الحائط" (>72% محايد عند الحواف، <58% في الوسط)
  5. رفض الصور ذات "حواف تشبه الإطار" (>82% داكن عند الحواف، <62% في الوسط)
الهدف: عرض الصورة الخام فقط بدون حواف إطارات أو خلفيات حائط
```

### 4.15 نظام التصميم والسمات (Theme System)
```
5 سمات:
  - brw-classic (داكن، افتراضي): خلفية #0a0a0a، ألوان محايدة
  - neon-gallery (داكن مع سماوي): نقاط بارزة بـ #00e5ff
  - warm-studio (دافئ): لون عنبري
  - midnight-luxe (أزرق غامق/ذهبي): بحري/شامبانيا
  - gallery-white (فاتح): أبيض مع نصوص داكنة

تطبيق السمة:
  - data-site-theme + data-theme على <html>
  - CSS variables (oklch colors)
  - sessionStorage للعرض المسبق (preview)
```

### 4.16 نظام إعدادات الإطار (Frame Mockup Settings)
```
الإطارات المتاحة: black (بلاستيك كلاسيك)، white (أبيض كلاسيك)، wood (خشب)
المواضع: top، left، width، height (نسب مئوية), rotate, skewX, skewY, 
          borderRadius, scale, perspective, rotateX, rotateY, flipX, flipY
المصدر: site_settings (key: "frame_mockups")
الإعدادات الافتراضية: MOCKUP_DEFAULTS في use-settings.ts
التحديث: admin → Editor → Mockups
```

---

## 5. الإعدادات الخاصة والقيود (Special Configurations & Constraints)

### 5.1 متغيرات البيئة (Environment Variables)
```
مفاتيح Supabase:
  SUPABASE_URL، SUPABASE_PUBLISHABLE_KEY، SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY (للمهام الإدارية)
  SUPABASE_SECRET_KEY، SUPABASE_JWT_SECRET
  NEXT_PUBLIC_SUPABASE_* (نسخ قديمة)
  VITE_SUPABASE_* (لـ Vite)

قاعدة البيانات:
  POSTGRES_* (اتصال مباشر بـ PostgreSQL)
  (8 متغيرات: URL, HOST, DATABASE, USER, PASSWORD, ...)

الذكاء الاصطناعي:
  GEMINI_API_KEY_1..10 (10 مفاتيح Gemini)
  GEMINI_API_KEY (قديم)
  OPENROUTER_API_KEY (سيرفر بديل)
  LOVABLE_API_KEY (AI Gateway)

أخرى:
  BACKUP_ENCRYPTION_KEY (تشفير النسخ الاحتياطي)
  VERCEL_OIDC_TOKEN (Vercel identity)
  VERCEL_GIT_COMMIT_SHA (build ID)
```

### 5.2 قواعد التحقق من صحة البيانات
```
Validation في صفحة السلة (Checkout):
  - اسم العميل: يجب ألا يكون فارغاً
  - الهاتف: رقم مصري (01xxxxxxxxx)
  - المحافظة: اختيار من القائمة (غير فارغ)
  - العنوان: يجب ألا يكون فارغاً
  - العناصر: كل عنصر يحتوي size, qty, image
  - السعر: يجب أن يتطابق مع العروض والخصومات

تحقق Poster AI:
  - لا يمكن وضع بوستر كرة قدم في فئة إسلامية
  - لا يمكن وضع بوستر أنمي في فئة سيارات
  - إلزام فئة فرعية إن كانت الفئة الرئيسية تتطلبها

تحقق تحسين الصور:
  - يجب أن يكون إدخال data:image/... 
  - أقصى حجم 8MB
  - يجب أن تحتوي الصورة على شخص (لا ينطبق على suit)
```

### 5.3 قواعد الأسعار (Pricing Defaults)
```yaml
إطارات PVC:
  20×30: 80 EGP    30×40: 120 EGP    40×60: 200 EGP
  50×70: 260 EGP   60×90: 340 EGP    80×120: 460 EGP
  100×60: 380 EGP  100×70: 420 EGP

إطارات Wood:
  20×30: 120 EGP   30×40: 180 EGP    40×60: 300 EGP
  50×70: 390 EGP   60×90: 510 EGP    80×120: 690 EGP
  100×60: 570 EGP  100×70: 630 EGP

خدمات التصميم المخصص:
  رسم التصميم: 1,000 EGP

الطباعة الفوتوغرافية:
  10×15: 6 EGP     13×18: 10 EGP     15×20: 14 EGP
  (الحد الأدنى 20 صورة)

الطباعة 4×6:
  (قابلة للتكوين عبر admin)
  التغليف: 20 EGP

الشحن: 45 EGP (مجاني للطلبات ≥ 399 EGP)
```

### 5.4 قيود الأداء
```
- أقصى 2500 منتج للفحص التلقائي للمجموعات
- دفعات 80 ID لاستعلام image_variants
- staleTime 60s لإعدادات الموقع
- staleTime 30s لمؤشرات الأداء
- تأخير 3.5s لتحميل Boot Components في الخلفية
- defer analytics via requestIdleCallback
- أول 4 بطاقات في الشبكة تحمل eager loading
- IntersectionObserver + 800px rootMargin للتمرير اللانهائي
```

### 5.5 قيود إضافية
```
- أقصى حجم للرفع: 25MB لكل ملف (Custom Design)
- أقصى 20 ملفاً (Custom Design)
- أقصى 20 صورة (Photo Printing)
- AVIF/WebP srcSets تُستخدم فقط للمتصفحات الداعمة
- SVG احتياطي للصور المكسورة (IMAGE_FALLBACK)
- خدمة العامل (SW): /firebase-messaging-sw.js مع نطاق /
- SEO: توليد XML Sitemap كل ساعة
- الروابط المعطلة لمحاكاة الإطارات: /__l5e/ و .lovableproject.com يتم تجاهلها
```

---

## 6. الهدف الحالي وخارطة الطريق (Current Goal & Roadmap)

### 6.1 الإنجازات الأخيرة

تم بنجاح:
1. **توحيد خط أنابيب العرض** — جميع البوسترات (ProductCard, CategoryGrids, FramedArtwork, ShopByCollection, PersonalRails, RecentlyViewed, RelatedPosters) تستخدم `FramePreview` حصراً. تم إزالة المكوّن `ProductFrameArtwork` بالكامل.

2. **CSS إلزامي في FramePreview** — `object-fit:cover`، `transform:none`، `scale:1`، `line-height:0`، `display:block`، `width:100%`، `height:100%` مثبّتة في كود `FramePreview.tsx` نفسها (وليس من خلال Tailwind فقط).

3. **تحقق هندسي عبر headless Chrome** — تم استخراج `getComputedStyle` + `getBoundingClientRect` لكل `.frame-opening`:
   - جميع الفتحات: `diffW=0` و `diffH=0` (بدون فجوات)
   - `object-fit:cover`، `transform:none` في كل الصور
   - الهندسة متطابقة بين ProductCard-style و PosterGallery-style

4. **نشر الإنتاج** — `https://brwazwneon.com` يعمل مع جميع المسارات (200 OK): /, /category/*, /trending, /best-sellers, /wishlist, /offers

5. **ما زال قائماً** — لا يمكن التحقق البصري من الإنتاج عبر headless Chrome لأن Supabase تمنع جلب البيانات في وضع الرأس (bot detection). التحقق المحلي مكتمل.

### 6.2 الفروق المتبقية
| الخاصية | البطاقة (Grid) | المعاينة (Selected Preview) |
|---------|----------------|-------------------------------|
| دقة الصورة | thumbnail (240px) | medium (640px) |
| الهندسة | متطابقة | متطابقة |
| المصدر | `cardArtworkUrl` | `resolveProductArtwork(poster, imageMap)` |

### 6.3 المهام القادمة
1. **التحقق البصري للإنتاج** — المستخدم بحاجة لفتح `https://brwazwneon.com/category/movies` في متصفح حقيقي والتحقق من تطابق البطاقة مع المعاينة.

2. **تحسين جودة الصور في الشبكة** — اختيارياً: تغيير `ProductCard` لاستخدام `small` (320px) بدلاً من `thumb` (240px) لجودة أفضل مع الحفاظ على الهندسة.

3. **سبك الفرق الهندسي في الشاشة العريضة** — التحقق من الهندسة في viewports أكبر (عرض > 1200px).

4. **اختبار RTL** — التأكد من أن جميع المكونات تعمل بشكل صحيح مع الاتجاه من اليمين إلى اليسار (للعربية).

---

## 7. كل ما تم بناؤه في التطبيق (Complete Work History)

### 7.1 البنية التحتية الأساسية
- مشروع **TanStack Start** + **Vite** + **React 19**
- تكامل كامل مع **Supabase** (Auth, Database, Storage, RPC, Realtime)
- تكامل مع **Vercel** (نشر Production مع Cloudflare Workers)
- نظام **Nitro SSR** مع دعم Cloudflare module preset

### 7.2 مكونات واجهة المستخدم
- **46 مكوناً من shadcn/ui** (جميعها مخصصة للسمة الداكنة الفاتحة)
- **35+ مكوناً مخصصاً** للمتجر:
  - SiteHeader (رأس متجاوب مع قائمة منسدلة للموبايل)
  - SiteFooter (4 أعمدة مع روابط ديناميكية)
  - FramePreview (عرض الإطارات الموحد)
  - FramedArtwork (غلاف حول FramePreview)
  - ProductCard (بطاقة منتج مع اختيار)
  - PosterGallery (معرض صور مع تكبير)
  - InfiniteProductGrid (شبكة تمرير لانهائي)
  - CategoryGrids (أشرطة مجموعات الفئات)
  - ShopByCollection (بطاقات مجموعات التسوق)
  - SearchBox (بحث مع إكمال تلقائي)
  - SafeImage (صورة آمنة مع fallback)
  - FrameEditor (محرر إطارات للعميل)
  - FrameComparison (جدول مقارنة الإطارات)
  - SizeGuide (دليل المقاسات)
  - PosterBadge (شارات البوستر)
  - WishlistHeart (أيقونة المفضلة)
  - WhatsAppButton (زر واتساب عائم)
  - FloatingActions (أزرار عائمة)
  - MobileFloatingActions (قائمة أدوات الجوال)
  - MobileToolsSheet (صفحة أدوات الجوال المنزلقة)
  - StickyProductBar (شريط منتج ثابت)
  - BackToTopButton (زر العودة للأعلى)
  - AnnouncementBar (شريط الإعلانات المتحرك)
  - SocialProof (إشعارات البيع المباشرة)
  - CustomerReviews (آراء العملاء مع تحميل صور)
  - Highlights (أيقونات النقاط البارزة)
  - HomeSlider (سلايدر الصفحة الرئيسية)
  - HeroBannerSlider (سلايدر البانرات)
  - BeforeAfter (مقارنة قبل/بعد)
  - PhotoEnhancementBeforeAfter (تحسين الصور)
  - RoomTransformation (غرفة ثلاثية الأبعاد)
  - WallOfInspiration (جدار الإلهام)
  - TrustedQuality (ثقة الجودة)
  - StorefrontFAQ (أسئلة شائعة)
  - ProductInfoSections (معلومات المنتج)
  - AssistantButton (مساعد البحث الذكي)
  - FrameSetsHome (مجموعات الإطارات)
  - RelatedPosters (البوسترات ذات الصلة)
  - TrendingNow (الرائجة الآن)
  - BestSellers (الأكثر مبيعاً)
  - PersonalizedSections (التوصيات المخصصة)
  - PersonalRails (أشرطة التوصيات)
  - ThemeBoot / ThemePreviewBanner (السمات)
  - MaintenanceGate / MaintenancePage (الصيانة)
  - PreviewBadge / TestModeBadge (شارات التطوير)
  - AppPreloader (محمل الموارد المسبق)

### 7.3 المسارات والصفحات
- **/** — الصفحة الرئيسية (25+ قسماً قابلاً للتكوين)
- **/category/$slug** — صفحة الفئة مع معاينة وتخصيص
- **/cart** — سلة التسوق والدفع الكامل
- **/offers** — عروض الحزم
- **/trending** — الرائجة
- **/best-sellers** — الأكثر مبيعاً
- **/wishlist** — المفضلة
- **/search** — البحث
- **/custom-design** — التصميم المخصص
- **/photo-4x6** — طباعة 4×6 مع تحسين AI
- **/photo-printing** — طباعة فوتوغرافية تقليدية
- **/sets** — مجموعات الإطارات
- **/landing/$audience** — صفحات هبوط للحملات (5 جماهير)
- **/auth** — صفحة تسجيل الدخول للمسؤول
- **/admin** — لوحة التحكم الكاملة (56 تبويباً)
- **/offline** — صفحة عدم الاتصال
- **/sitemap.xml** — خريطة الموقع (SSR ديناميكي)
- **/api/admin-assistant** — API المساعد الذكي
- **/api/public/hooks/backup** — API النسخ الاحتياطي

### 7.4 مكتبات الخدمة والمنطق
- **إدارة السلة** — CartProvider + localStorage + خصم الكمية
- **إدارة المفضلة** — WishlistProvider + hybrid sync
- **آخر المشاهدة** — RecentlyViewedProvider + localStorage + Supabase
- **الصور المحسّنة** — image_variants (thumb/small/medium/large × AVIF/WebP)
- **تحديد المواقع** — ipapi.co مع localStorage cache
- **التحليلات** — Facebook Pixel + CAPI + GA4 + TikTok + داخلي
- **التخصيص** — Visitor Profiles + Interest Scoring
- **النسخ الاحتياطي** — تشفير AES-256-GCM + pg_cron
- **الإشعارات** — Firebase Cloud Messaging + ADM
- **الأخطاء** — client capture + server capture + system_logs
- **الأداء** — Performance Flags + متغيرات تعديل السلوك
- **الترجمة** — i18next + react-i18next (ar/en)
- **السمات** — 5 سمات متكاملة مع CSS variables
- **إعدادات الموقع** — site_settings (جميع الإعدادات الديناميكية)
- **التخزين** — Supabase Storage مع signed URLs (TTL 10 سنوات)
- **أدوات مساعدة** — utils (cn, formatCurrency, slugify, etc.)

### 7.5 الذكاء الاصطناعي والتكاملات
- **AI Gateway** — Lovable AI Gateway للمساعد الإداري
- **Gemini API** — 10 مفاتيح مع priority queue + cooldown + OpenRouter fallback
- **مساعد إداري** — 20+ أداة (استعلامات، إجراءات، توليد، تشخيص)
- **تحسين الصور** — 6 إجراءات (enhance/colors/sharpen/blur/print/suit)
- **توليد بيانات وصفية** — SEO + category + tags للمسؤول
- **مساعد بحث** — بحث نصي كامل مع اقتراحات

### 7.6 لوحة التحكم الإدارية (56 تبويباً)
- Analytics, Reports, Realtime Analytics
- Behavior Management, Posters CRUD
- AI Upload, AI Settings
- Assistant, Assistant Requests
- Categories, Subcategories, Display Order
- Orders, Abandoned Orders, Customers
- Custom Design Orders, Photo 4x6, Photo Printing
- Offers, Trending Manager
- Slider, Hero Banners, Highlights
- Best Sellers, Homepage Sections
- Home Category Picks, Room Transformation
- Sets, Collections, Collection Showcase
- Quick Bar, Footer Menu, Mockups
- Wishlist, Reviews, Before/After
- Photo Enhancement, Storefront Content
- Marketing, Campaign Landings, Campaign Reports
- Social Proof, Announcement Bar
- Size Guide, Alerts, Notifications
- Error Logs, Performance, Stability
- Images (Image Control Center)
- Backups, System Health, Env Check
- Maintenance, Exports
- Branding, Appearance, Settings

### 7.7 بنية قاعدة البيانات (90 تهجيرة)
- **الأساس** (24 يونيو): roles, posters, categories, orders, auth
- **التوسع** (يونيو-يوليو): photo_orders, wishlists, reviews, sets, best_sellers, hero_banners
- **SEO والبحث** (يونيو): pg_trgm للبحث النصي، أعمدة SEO
- **التتبع** (يوليو): visitor profiles, interest scoring, cart events
- **الإشعارات** (يوليو): admin_devices, admin_notifications, FCM
- **النسخ الاحتياطي** (يوليو): backups table, pg_cron
- **تحسين الصور** (يوليو): image_variants
- **العرض** (يوليو): collection_showcase, homepage layout, themes
- **الصيانة** (يوليو): perf_metrics, system_logs, error logs

---

## ملخص المسار الحالي

**ما تم تحقيقه:**
- ✅ مشروع e-commerce كامل الخدمات (Posters, Frames, Custom Design, Photo Printing)
- ✅ دفع Instapay + COD مع شحن في مصر
- ✅ عرض بوسترات موحّد (FramePreview) مع هندسة متطابقة عبر جميع المكونات
- ✅ ذكاء اصطناعي متكامل (تحسين صور، توليد بيانات، مساعد إداري)
- ✅ تحليلات ثلاثية الطبقات (داخلي + Meta + GA4 + TikTok)
- ✅ نظام تخصيص وتوصيات قائم على السلوك
- ✅ لوحة تحكم إدارية متكاملة (56 تبويباً)
- ✅ سمات متعددة (5 سمات)
- ✅ ترجمة كاملة (عربي/إنجليزي)
- ✅ نسخ احتياطي مشفر تلقائي

**المهمة الحالية:**
- التحقق البصري من تطابق الهندسة بين بطاقة الشبكة ومعاينة المنتج المحدد على `https://brwazwneon.com`
- اختيارياً: تحسين دقة الصور في الشبكة من `thumb` (240px) إلى `small` (320px)
