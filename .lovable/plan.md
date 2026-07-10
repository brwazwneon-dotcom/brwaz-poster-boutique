# مساعد ذكاء اصطناعي للأدمن

مساعد ذكي داخل الداش بورد يجاوب على أسئلة عن بيانات الموقع، ينفذ إجراءات إدارية، يولّد محتوى، ويحلل الصور — بدون حفظ للمحادثات.

## الواجهة

**زر عائم (Floating Button)** في كل صفحات `/admin` أسفل يمين — يفتح **Sheet جانبي** للردود السريعة.

**تاب `assistant` مستقل** داخل الداش بورد — صفحة شات كاملة للمحادثات الأطول ورفع الصور.

الاتنين يستخدموا نفس المكوّن الأساسي (`AdminAssistantChat`) ونفس الـ endpoint، فرق العرض فقط.

زر **"محادثة جديدة"** بيمسح الرسائل (بدون حفظ — كل جلسة تبدأ من الصفر عند إعادة التحميل).

## قدرات المساعد (Tools)

المساعد يستخدم AI SDK tool calling عبر Lovable AI Gateway. الأدوات:

**قراءة بيانات:**
- `queryOrders` — عدد أوردرات اليوم/الأسبوع/بحسب الحالة، إجمالي المبيعات
- `queryTopProducts` — أعلى المنتجات مبيعًا في فترة محددة
- `queryLowStock` — منتجات على وشك النفاد
- `queryNotifications` — آخر التنبيهات والمشاكل
- `queryCustomerLookup` — بحث عن عميل برقم الهاتف أو الأوردر

**إجراءات إدارية (بتأكيد `needsApproval`):**
- `updateOrderStatus` — تغيير حالة أوردر
- `togglePosterVisibility` — إخفاء/إظهار منتج
- `toggleMaintenanceMode` — تشغيل/إيقاف وضع الصيانة
- `sendCustomerWhatsApp` — تجهيز رسالة واتساب لعميل

**توليد محتوى:**
- `generateProductDescription` — وصف منتج بالعربية
- `generateMarketingCopy` — رسائل تسويقية/سوشيال/حملات

**تحليل صور (رفع صورة):**
- المستخدم يرفع صورة → المساعد يقدر يوصفها، يحدد مشاكل الجودة، أو يقترح مسحها/إخفاءها من المنتجات
- Tool: `deletePosterImage` — يمسح صورة من منتج بعد تأكيد

## البنية التقنية

**Backend:**
- Server route: `src/routes/api/admin-assistant.ts` — يستقبل الرسائل، يتحقق أن المستخدم `admin` عبر `has_role`، يستخدم `streamText` مع `openai/gpt-5.5` عبر Lovable AI Gateway
- كل tool `execute` بينفذ queries على Supabase بصلاحيات المستخدم
- `stopWhen: stepCountIs(50)` لدعم multi-step reasoning
- الإجراءات الحساسة تستخدم `needsApproval: true` — الأدمن يوافق قبل التنفيذ

**Frontend:**
- `src/components/admin/AdminAssistantChat.tsx` — الشات الأساسي بـ AI Elements (`Conversation`, `Message`, `MessageResponse`, `PromptInput`, `Tool`, `Shimmer`)
- `src/components/admin/AdminAssistantButton.tsx` — الزر العائم + `Sheet` من shadcn
- `src/components/admin/AssistantTab.tsx` — التاب الكامل
- `useChat` من `@ai-sdk/react` مع `DefaultChatTransport` مؤشر لـ `/api/admin-assistant`
- بدون persistence — الرسائل في state فقط
- رفع صور كـ attachment parts (multimodal input)

**AI Elements المطلوبة:**
```
bun x ai-elements@latest add conversation message prompt-input tool shimmer
```

**التكامل:**
- إضافة `<AdminAssistantButton />` في `AdminShell` (يظهر في كل تابات الأدمن)
- إضافة `assistant` كتاب جديد في `src/routes/admin.tsx`
- شعار المساعد: أيقونة مخصصة (مش `Sparkles`) — روبوت صغير بالألوان السوداء الفاخرة للموقع

## ملفات جديدة/معدلة

**جديد:**
- `src/routes/api/admin-assistant.ts` — chat streaming endpoint
- `src/lib/admin-assistant-tools.server.ts` — تعريفات الـ tools
- `src/lib/ai-gateway.server.ts` — helper للـ Lovable AI Gateway
- `src/components/admin/AdminAssistantChat.tsx`
- `src/components/admin/AdminAssistantButton.tsx`
- `src/components/admin/AssistantTab.tsx`
- `src/components/ai-elements/*` (من CLI)

**معدل:**
- `src/components/admin/AdminShell.tsx` — إضافة الزر العائم
- `src/routes/admin.tsx` — إضافة تاب `assistant`

## ملاحظات

- **Secret**: يستخدم `LOVABLE_API_KEY` (موجود تلقائيًا — لا يحتاج إعداد)
- **حماية**: كل استدعاء يتحقق من صلاحية `admin` قبل الرد
- **بدون حفظ**: زي ما طلبت — كل session تبدأ فاضية
- **الواتساب**: يستخدم نفس نظام `wa.me` الموجود
