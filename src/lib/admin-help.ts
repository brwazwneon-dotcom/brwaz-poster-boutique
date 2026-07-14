// Registry of tooltip / help strings used across the Admin Dashboard.
// Keys are stable ids referenced from <HelpTip id="..." />.
// Each entry supplies an EN + AR string and an optional severity that
// controls the tooltip color (info | warning | danger).

export type HelpSeverity = "info" | "warning" | "danger";

export type HelpEntry = {
  en: string;
  ar: string;
  severity?: HelpSeverity;
};

export const HELP: Record<string, HelpEntry> = {
  // ── Global ───────────────────────────────────────────────
  "help.mode_toggle": {
    en: "Turn Help Mode on to show a small ? next to important controls with a longer explanation.",
    ar: "فعّل وضع المساعدة لعرض علامة ? بجانب العناصر المهمة مع شرح أوسع.",
  },
  "help.mode_on": { en: "Help Mode is ON. Click any ? for a detailed explanation.", ar: "وضع المساعدة مُفعّل. اضغط على أي ? للحصول على شرح مفصّل." },
  "help.start_tour": { en: "Start a short guided tour of the dashboard.", ar: "ابدأ جولة سريعة داخل الداش بورد." },

  // ── Orders ───────────────────────────────────────────────
  "orders.view": { en: "Open full order details, images and customer info.", ar: "افتح تفاصيل الطلب الكاملة والصور وبيانات العميل." },
  "orders.change_status": { en: "Move this order to a different stage (New → Confirmed → Printing → Shipped).", ar: "انقل الطلب إلى مرحلة أخرى (جديد ← مؤكد ← طباعة ← تم الشحن)." },
  "orders.copy_wa": { en: "Copy a ready-made WhatsApp message with the order details.", ar: "انسخ رسالة واتساب جاهزة تحتوي على تفاصيل الطلب." },
  "orders.open_wa": { en: "Open a WhatsApp chat with the customer directly.", ar: "افتح محادثة واتساب مع العميل مباشرة." },
  "orders.download_original": { en: "Download the original high-quality image used for printing.", ar: "حمّل الصورة الأصلية بأعلى جودة لاستخدامها في الطباعة." },
  "orders.mark_confirmed": { en: "Set this order to Confirmed after verifying customer details and images.", ar: "غيّر حالة الطلب إلى مؤكد بعد التأكد من بيانات العميل والصور." },
  "orders.mark_printing": { en: "Move this order to the Printing stage.", ar: "انقل الطلب إلى مرحلة الطباعة." },
  "orders.mark_shipped": { en: "Mark this order as Shipped. The customer is notified.", ar: "علّم الطلب كأنه تم شحنه. سيتم إخطار العميل." },
  "orders.add_note": { en: "Add an internal note to this order. Customers never see it.", ar: "أضف ملاحظة داخلية على الطلب. لن يراها العميل." },
  "orders.run_check": { en: "Run an automatic verification on the order (missing data, image quality, etc.).", ar: "شغّل فحصاً تلقائياً على الطلب (بيانات ناقصة، جودة الصور…)." },

  // Order table columns
  "orders.col.status": { en: "The current stage of the order.", ar: "المرحلة الحالية للطلب." },
  "orders.col.total": { en: "Total order value including products and shipping.", ar: "إجمالي قيمة الطلب شامل المنتجات والشحن." },
  "orders.col.last_activity": { en: "The last action taken on this order or customer.", ar: "آخر إجراء تم على هذا الطلب أو العميل." },
  "orders.col.severity": { en: "How critical this issue is.", ar: "درجة خطورة المشكلة." },

  // ── Images ───────────────────────────────────────────────
  "images.replace": { en: "Replace this image with a new one. The old file is kept as a backup.", ar: "استبدل الصورة بأخرى جديدة. يُحتفظ بالصورة القديمة كنسخة احتياطية." },
  "images.adjust_sizes": { en: "Choose which print sizes are enabled for this image.", ar: "اختر مقاسات الطباعة المفعّلة لهذه الصورة." },
  "images.needs_edit": { en: "Flag this image as needing editing before it can be published.", ar: "علّم الصورة أنها تحتاج تعديل قبل النشر." },
  "images.ready": { en: "Mark this image as ready for printing and sale.", ar: "علّم الصورة بأنها جاهزة للطباعة والبيع." },
  "images.quality_check": { en: "Run an automatic quality check (resolution, sharpness, DPI).", ar: "شغّل فحص جودة تلقائي (الدقة، الحدة، الـ DPI)." },
  "images.optimize": {
    en: "Generate lightweight display versions of images so the site loads faster. The original print file is not touched.",
    ar: "ينشئ نسخ عرض خفيفة وسريعة للصور بدون التأثير على الصورة الأصلية للطباعة.",
  },
  "images.rebuild_thumb": { en: "Rebuild the thumbnail for this image if it looks broken.", ar: "أعد بناء الصورة المصغّرة إذا كانت تظهر بشكل خاطئ." },
  "images.view_hq": { en: "Preview the image at full quality.", ar: "معاينة الصورة بأعلى جودة." },
  "images.download_original": { en: "Download the original high-quality image for printing.", ar: "حمّل الصورة الأصلية بأعلى جودة لاستخدامها في الطباعة." },
  "images.delete": {
    en: "Move this image to Trash. It will only be deleted permanently after confirmation.",
    ar: "ينقل الصورة إلى سلة المهملات. لن يتم حذفها نهائياً إلا بعد التأكيد.",
    severity: "danger",
  },
  "images.hide": {
    en: "Hide this item from the site but keep it in the dashboard. You can show it again at any time.",
    ar: "يخفي هذا العنصر من الموقع، لكنه لا يحذفه من الداش بورد. يمكنك إظهاره مرة أخرى في أي وقت.",
  },
  "images.show": { en: "Show this item on the site again.", ar: "أظهر هذا العنصر على الموقع مرة أخرى." },
  "images.pin_top": { en: "Pin this item so it always appears at the top of its category.", ar: "ثبّت هذا العنصر ليظهر دائماً في أول الفئة." },
  "images.move_up": { en: "Move this item one step up in the order.", ar: "حرّك هذا العنصر خطوة للأعلى في الترتيب." },
  "images.move_down": { en: "Move this item one step down in the order.", ar: "حرّك هذا العنصر خطوة للأسفل في الترتيب." },
  "images.send_bottom": { en: "Send this item to the end of the list.", ar: "أرسل هذا العنصر إلى نهاية القائمة." },
  "images.add_trending": { en: "Add this image to the Trending Now section on the homepage.", ar: "يضيف هذه الصورة إلى قسم Trending Now في الصفحة الرئيسية." },
  "images.remove_trending": { en: "Remove this image from the Trending Now section.", ar: "أزل هذه الصورة من قسم Trending Now." },

  // ── Homepage ─────────────────────────────────────────────
  "home.show_section": { en: "Show this section on the homepage.", ar: "أظهر هذا القسم في الصفحة الرئيسية." },
  "home.hide_section": { en: "Hide this section from the homepage without deleting it.", ar: "أخفِ هذا القسم من الصفحة الرئيسية بدون حذفه." },
  "home.manage_items": { en: "Choose which items appear inside this section.", ar: "اختر العناصر التي تظهر داخل هذا القسم." },
  "home.save_changes": { en: "Save your changes. The homepage updates instantly.", ar: "احفظ التغييرات. سيتم تحديث الصفحة الرئيسية فوراً." },
  "home.preview": { en: "Open a preview of the homepage exactly as customers see it.", ar: "افتح معاينة للصفحة الرئيسية كما يراها العميل." },

  // ── AI ───────────────────────────────────────────────────
  "ai.run_seo": { en: "Automatically generate a title, description and tags to improve search ranking.", ar: "ينشئ عنوان ووصف وTags تلقائياً لتحسين ظهور المنتج في البحث." },
  "ai.bulk_seo": {
    en: "Run AI SEO on many products at once. Existing manual edits are preserved.",
    ar: "شغّل الـ AI SEO على عدد كبير من المنتجات دفعة واحدة مع الحفاظ على التعديلات اليدوية.",
    severity: "warning",
  },
  "ai.test_key": { en: "Send a small test request to verify the Gemini API key works.", ar: "أرسل طلب اختبار صغير للتأكد أن مفتاح Gemini يعمل." },
  "ai.reset_cooldown": { en: "Reset the AI cooldown timer if you hit a rate limit.", ar: "أعد ضبط مؤقّت التبريد إذا وصلت لحد الاستخدام." },
  "ai.use_openrouter": { en: "Switch temporarily to the OpenRouter fallback model if Gemini fails.", ar: "استخدم OpenRouter كبديل مؤقت إذا فشل Gemini." },
  "ai.generate_description": { en: "Generate a product description automatically.", ar: "ولّد وصف المنتج تلقائياً." },
  "ai.copy_prompt": { en: "Copy the prompt used for this generation to reuse or fine-tune.", ar: "انسخ الـ Prompt المستخدم لإعادة استخدامه أو تعديله." },

  // ── Performance ──────────────────────────────────────────
  "perf.run_check": { en: "Analyze site performance and highlight anything that slows it down.", ar: "حلّل أداء الموقع وأظهر أي شيء يبطئه." },
  "perf.optimize_existing": { en: "Optimize every existing image on the site (create lightweight display versions).", ar: "شغّل التحسين على كل الصور الموجودة (إنشاء نسخ عرض خفيفة)." },
  "perf.clear_cache": {
    en: "Clear cached images and pages. Users will see fresh content but the first load will be slower.",
    ar: "امسح الكاش للصور والصفحات. سيرى المستخدمون محتوى محدّثاً لكن أول تحميل سيكون أبطأ.",
    severity: "warning",
  },
  "perf.rebuild_thumbs": { en: "Rebuild all thumbnails.", ar: "أعد بناء كل الصور المصغّرة." },
  "perf.compress": { en: "Compress display images to reduce bandwidth. Print originals are not affected.", ar: "اضغط صور العرض لتقليل استهلاك الإنترنت. الصور الأصلية للطباعة لا تتأثر." },
  "perf.find_heavy": { en: "Find the largest images that hurt performance.", ar: "ابحث عن أكبر الصور التي تؤثر على الأداء." },
  "perf.fix_broken": { en: "Detect and try to fix broken image links.", ar: "اكتشف الصور المكسورة وحاول إصلاحها." },

  // ── Reports ──────────────────────────────────────────────
  "reports.export_csv": { en: "Download the current report as a CSV file.", ar: "حمّل التقرير الحالي كملف CSV." },
  "reports.export_excel": { en: "Download the current report as an Excel file.", ar: "حمّل التقرير الحالي كملف Excel." },
  "reports.filter_date": { en: "Filter the report by a date range.", ar: "صفّي التقرير حسب فترة زمنية." },
  "reports.open_details": { en: "Open the full details of this report row.", ar: "افتح تفاصيل هذا الصف الكاملة." },

  // ── Status badges ────────────────────────────────────────
  "status.new_order": { en: "A new order that has not been confirmed yet.", ar: "طلب جديد لم يتم تأكيده بعد." },
  "status.needs_review": { en: "This order has missing data or an image that needs review.", ar: "هذا الطلب يحتوي على بيانات ناقصة أو صورة تحتاج مراجعة.", severity: "warning" },
  "status.printing": { en: "The order is currently at the printing stage.", ar: "الطلب حالياً في مرحلة الطباعة." },
  "status.low_quality": { en: "This image may not print at high quality.", ar: "الصورة قد لا تكون مناسبة للطباعة بجودة عالية.", severity: "warning" },
  "status.hidden": { en: "The item is hidden from the site but still available in the dashboard.", ar: "العنصر مخفي من الموقع لكنه موجود في الداش بورد." },
  "status.trending": { en: "This item is featured in the Trending Now section.", ar: "هذا العنصر يظهر في قسم Trending Now." },
  "status.critical": { en: "A critical issue that may affect the site or orders.", ar: "مشكلة مهمة قد تؤثر على الموقع أو الطلبات.", severity: "danger" },

  // ── Dangerous actions ────────────────────────────────────
  "danger.delete": {
    en: "Warning: this may affect data. You will be asked to confirm before it runs.",
    ar: "تحذير: هذا الإجراء قد يؤثر على البيانات. سيتم طلب تأكيد قبل التنفيذ.",
    severity: "danger",
  },
  "danger.bulk_hide": {
    en: "All selected items will be hidden from the site. They will not be deleted.",
    ar: "سيتم إخفاء كل العناصر المحددة من الموقع. لن يتم حذفها.",
    severity: "warning",
  },
  "danger.restore_backup": {
    en: "Restoring a backup can change current data. Use with caution.",
    ar: "استرجاع نسخة احتياطية قد يغيّر البيانات الحالية. استخدمه بحذر.",
    severity: "danger",
  },
  "danger.change_prices": {
    en: "Price changes only affect new orders, not past ones.",
    ar: "تغيير السعر سيؤثر على الطلبات الجديدة فقط، وليس الطلبات القديمة.",
    severity: "warning",
  },

  // ── Display Order tab ────────────────────────────────────
  "display.sort_mode": { en: "Choose how items in this category are sorted for customers.", ar: "اختر كيف تُرتَّب العناصر في هذه الفئة أمام العميل." },
  "display.save_order": { en: "Save the current order. Customers will see the change immediately.", ar: "احفظ الترتيب الحالي. سيرى العميل التغيير فوراً." },
  "display.edit_number": { en: "Set an exact position number for this item.", ar: "حدّد رقم الموقع بدقة لهذا العنصر." },
};

export function getHelp(id: string): HelpEntry | null {
  return HELP[id] ?? null;
}

export function helpText(id: string, lang: "en" | "ar"): string {
  const entry = HELP[id];
  if (!entry) return "";
  return lang === "ar" ? entry.ar : entry.en;
}