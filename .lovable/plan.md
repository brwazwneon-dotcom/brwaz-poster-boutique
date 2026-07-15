طلبك ضخم جدًا ويلمس تقريبًا كل الموقع. عشان أضمن جودة عالية وأقدر أختبر كل حاجة، هنفذها على مراحل. المرحلة الأولى (اللي هعملها دلوقتي) فيها أعلى تأثير على السرعة + الـ Preloader بالكامل، وباقي المراحل نعملها بعد ما نتأكد إن الأولى شغالة زي ما هي.

## المرحلة 1 — دلوقتي (Speed Quick Wins + Preloader)

### 1. Black Logo Preloader (كامل)
- ملف جديد `src/components/AppPreloader.tsx`:
  - خلفية سوداء fullscreen، اللوجو في النص
  - Animation: fade in + pulse scale (0.96 ↔ 1.04) + glow ناعم
  - Fade out في 500ms عند الجاهزية
  - `min 600ms / max 2500ms`
  - يظهر مرة واحدة فقط لكل session (`sessionStorage.preloaderShown`)
  - يتحقن مبكر من غير Layout Shift، ومناسب للموبايل
- يُركّب من `__root.tsx`

### 2. Thumbnails بدل الصور الأصلية في الـ grids
- في كل الشاشات العامة (Home, Trending, Best Sellers, Category, Search, Related, Recently Viewed, Personal Rails, Poster Gallery):
  - استخدم variant `thumb` أولاً، fallback على الأصلي
  - كل `<img>` يحصل على `loading="lazy"`, `decoding="async"`, `width`, `height`
  - أول صورة LCP في الهوم = `fetchpriority="high"` وبدون lazy
- صفحة المنتج تستخدم `medium`، Lightbox يستخدم `large`، الأصلي يفضل للداش/الطباعة فقط

### 3. فصل bundle الأدمن عن العميل
- تأكيد إن كل ملفات `src/components/admin/**` و `src/routes/admin*` مش داخلة في bundle العميل عن طريق:
  - dynamic import للـ admin route (lazy) بدل static import في routeTree
  - إزالة أي import للأدمن من مكونات مشتركة

### 4. تأجيل Analytics
- تحميل Meta Pixel و GA4 بعد `requestIdleCallback` / `load` event بدل ما يكونوا blocking
- لا تغيير في الوظائف، بس التوقيت

### 5. تحسين الخطوط
- تقليل أوزان Inter (400, 600 فقط — موجود بالفعل)
- إضافة `&display=swap` (متأكد إنه موجود) + preconnect (موجود)
- إزالة preloads غير ضرورية لو فيه

### 6. تقليل الـ initial payload في Homepage
- الأقسام تحت الفولد تتحمل بعد ما الصفحة تظهر (React `Suspense` + `React.lazy` أو `useInView` gate)
- كل rail يبدأ بـ 8-12 عنصر فقط + زر Load More

## المرحلة 2 — لاحقًا (بعد ما توافق)
- Speed Control Card في الداش (Optimize Images, Rebuild Thumbnails, Clear Cache, Auto Speed Fix...)
- Rebuild thumbnails للصور القديمة
- Performance Monitor يسجل أسباب البطء (heavy images, slow API, big bundle)
- Auto Speed Fix logic

## المرحلة 3 — تحسينات متقدمة
- AVIF variants
- Responsive `srcset` كامل
- Route-level prefetch tuning

---

**ليه المراحل؟** المرحلة 1 لوحدها تعديلات في 15+ ملف. لو عملنا كل حاجة مرة واحدة، الاختبار هيبقى صعب ومخاطرة كسر عالية.

هل أبدأ فورًا في المرحلة 1 كما هي، أم عايز تعدل الأولويات؟