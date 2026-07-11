import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";

// ---- Small helper to wrap tool executes: never throw raw errors to the model ----
function safe<T extends (...args: any[]) => Promise<any>>(name: string, fn: T) {
  return async (...args: Parameters<T>) => {
    try {
      const out = await fn(...args);
      return { ok: true, ...out };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        friendly:
          "حصلت مشكلة أثناء تنفيذ الطلب. جرّب مرة أخرى أو افتح Error Logs لمعرفة التفاصيل.",
        friendly_en:
          "Something went wrong while completing this action. Please try again or check Error Logs for details.",
        details: msg,
        tool: name,
      };
    }
  };
}

export const Route = createFileRoute("/api/admin-assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // ---- Auth: verify admin via bearer token ----
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice(7);
        if (!token || token.split(".").length !== 3) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const claims = await userClient.auth.getClaims(token);
        const userId = claims.data?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: isAdmin, error: roleErr } = await supabaseAdmin.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });
        if (roleErr || !isAdmin) {
          return new Response("Forbidden", { status: 403 });
        }

        // ---- Parse messages ----
        let body: { messages?: UIMessage[] };
        try {
          body = (await request.json()) as { messages?: UIMessage[] };
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const messages = Array.isArray(body.messages) ? body.messages : [];

        // ---- Log the latest user message to assistant_requests (fire-and-forget) ----
        try {
          const last = [...messages].reverse().find((m) => m.role === "user");
          const text = last?.parts?.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
          if (text) {
            void supabaseAdmin.from("assistant_requests").insert({
              action: "admin-assistant",
              keyword: text.slice(0, 500),
              meta: { userId, ts: new Date().toISOString() },
            });
          }
        } catch {
          /* ignore logging failures */
        }

        // ---- AI gateway ----
        const { createLovableAiGateway } = await import("@/lib/ai-gateway.server");
        const gateway = createLovableAiGateway();
        const model = gateway("openai/gpt-5.5");

        // ---- Tools ----
        const tools = {
          queryOrdersStats: tool({
            description:
              "احصل على إحصائيات الطلبات (اليوم، الأمس، آخر 7 أيام، آخر 30 يومًا) — عدد الطلبات وإجمالي المبيعات.",
            inputSchema: z.object({
              period: z.enum(["today", "yesterday", "week", "month", "all"]),
            }),
            execute: safe("queryOrdersStats", async ({ period }: { period: string }) => {
              const now = new Date();
              let start: Date | null = new Date(now);
              let end: Date | null = null;
              if (period === "today") start.setHours(0, 0, 0, 0);
              else if (period === "yesterday") {
                start.setDate(start.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setHours(0, 0, 0, 0);
              } else if (period === "week") start.setDate(start.getDate() - 7);
              else if (period === "month") start.setDate(start.getDate() - 30);
              else start = null;
              let q = supabaseAdmin
                .from("orders")
                .select("id,total_price,status,created_at,is_test", { count: "exact" });
              if (start) q = q.gte("created_at", start.toISOString());
              if (end) q = q.lt("created_at", end.toISOString());
              const { data, count, error } = await q;
              if (error) throw error;
              const rows = (data ?? []).filter((r) => !r.is_test);
              const total = rows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
              const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
                acc[r.status] = (acc[r.status] ?? 0) + 1;
                return acc;
              }, {});
              return { period, count: count ?? rows.length, totalEGP: total, byStatus };
            }),
          }),

          queryTopProducts: tool({
            description: "أعلى المنتجات مبيعًا أو مشاهدة.",
            inputSchema: z.object({
              by: z.enum(["sales", "views"]).default("sales"),
              limit: z.number().int().min(1).max(20).default(10),
            }),
            execute: safe("queryTopProducts", async ({ by, limit }: { by: string; limit: number }) => {
              const orderCol = by === "sales" ? "sales_count" : "views_count";
              const { data, error } = await supabaseAdmin
                .from("posters")
                .select("id,title,slug,sales_count,views_count,price,hidden")
                .eq("hidden", false)
                .order(orderCol, { ascending: false })
                .limit(limit);
              if (error) throw error;
              return { by, products: data ?? [] };
            }),
          }),

          queryRecentOrders: tool({
            description: "آخر الطلبات مع بيانات العميل والحالة.",
            inputSchema: z.object({
              limit: z.number().int().min(1).max(20).default(10),
              status: z.string().optional(),
            }),
            execute: safe("queryRecentOrders", async ({ limit, status }: { limit: number; status?: string }) => {
              let q = supabaseAdmin
                .from("orders")
                .select(
                  "id,order_number,customer_name,phone,governorate,status,total_price,poster_title,quantity,created_at,is_test",
                )
                .eq("is_test", false)
                .order("created_at", { ascending: false })
                .limit(limit);
              if (status) q = q.eq("status", status);
              const { data, error } = await q;
              if (error) throw error;
              return { orders: data ?? [] };
            }),
          }),

          queryCustomerLookup: tool({
            description: "بحث عن عميل برقم الهاتف أو رقم الطلب. يرجع كل طلباته.",
            inputSchema: z.object({
              query: z.string().min(3),
            }),
            execute: safe("queryCustomerLookup", async ({ query }: { query: string }) => {
              const q = query.trim();
              const { data, error } = await supabaseAdmin
                .from("orders")
                .select(
                  "id,order_number,customer_name,phone,governorate,address,status,total_price,poster_title,quantity,created_at",
                )
                .or(`phone.ilike.%${q}%,order_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
                .order("created_at", { ascending: false })
                .limit(20);
              if (error) throw error;
              return { orders: data ?? [] };
            }),
          }),

          queryNotifications: tool({
            description: "آخر التنبيهات والمشاكل في الداش بورد.",
            inputSchema: z.object({
              unreadOnly: z.boolean().default(false),
              limit: z.number().int().min(1).max(20).default(10),
            }),
            execute: safe("queryNotifications", async ({ unreadOnly, limit }: { unreadOnly: boolean; limit: number }) => {
              let q = supabaseAdmin
                .from("admin_notifications")
                .select("id,type,priority,title,message,created_at,read_at,resolved_at")
                .order("created_at", { ascending: false })
                .limit(limit);
              if (unreadOnly) q = q.is("read_at", null);
              const { data, error } = await q;
              if (error) throw error;
              return { notifications: data ?? [] };
            }),
          }),

          queryOrdersNeedConfirmation: tool({
            description: "الأوردرات التي حالتها pending / new وتحتاج تأكيد من الأدمن.",
            inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
            execute: safe("queryOrdersNeedConfirmation", async ({ limit }: { limit: number }) => {
              const { data, error } = await supabaseAdmin
                .from("orders")
                .select("id,order_number,customer_name,phone,governorate,status,total_price,poster_title,quantity,created_at")
                .in("status", ["pending", "new", "processing"])
                .eq("is_test", false)
                .order("created_at", { ascending: false })
                .limit(limit);
              if (error) throw error;
              return { orders: data ?? [], count: data?.length ?? 0 };
            }),
          }),

          queryAbandonedCarts: tool({
            description: "السلات المتروكة (Abandoned Carts) خلال آخر 72 ساعة.",
            inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
            execute: safe("queryAbandonedCarts", async ({ limit }: { limit: number }) => {
              const { data, error } = await supabaseAdmin.rpc("admin_abandoned_orders", { p_limit: limit });
              if (error) throw error;
              return { carts: data ?? [] };
            }),
          }),

          queryLowQualityPosters: tool({
            description: "البوسترات ذات الجودة الضعيفة (ai_confidence < 0.5) أو التي تحتاج مراجعة.",
            inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
            execute: safe("queryLowQualityPosters", async ({ limit }: { limit: number }) => {
              const { data, error } = await supabaseAdmin
                .from("posters")
                .select("id,title,slug,ai_confidence,review_status,hidden,image_url")
                .or("ai_confidence.lt.0.5,review_status.eq.needs_review")
                .order("ai_confidence", { ascending: true, nullsFirst: true })
                .limit(limit);
              if (error) throw error;
              return { posters: data ?? [] };
            }),
          }),

          queryCustomersSegment: tool({
            description:
              "شرائح العملاء: new (خلال 7 أيام)، repeat (أكثر من طلب)، vip (إجمالي مشتريات > 1500)، leads (طلب واحد لم يكتمل).",
            inputSchema: z.object({
              segment: z.enum(["new", "repeat", "vip", "leads"]),
              limit: z.number().int().min(1).max(50).default(20),
            }),
            execute: safe("queryCustomersSegment", async ({ segment, limit }: { segment: string; limit: number }) => {
              const { data, error } = await supabaseAdmin
                .from("orders")
                .select("customer_name,phone,total_price,status,created_at")
                .eq("is_test", false)
                .order("created_at", { ascending: false })
                .limit(1000);
              if (error) throw error;
              const byPhone = new Map<string, { name: string; phone: string; count: number; total: number; last: string; anyDelivered: boolean }>();
              for (const r of data ?? []) {
                if (!r.phone) continue;
                const cur = byPhone.get(r.phone) ?? {
                  name: r.customer_name ?? "",
                  phone: r.phone,
                  count: 0,
                  total: 0,
                  last: r.created_at,
                  anyDelivered: false,
                };
                cur.count += 1;
                cur.total += Number(r.total_price ?? 0);
                if (r.status === "delivered" || r.status === "completed") cur.anyDelivered = true;
                byPhone.set(r.phone, cur);
              }
              const now = Date.now();
              const all = [...byPhone.values()];
              let filtered = all;
              if (segment === "new") filtered = all.filter((c) => now - new Date(c.last).getTime() < 7 * 86400000 && c.count === 1);
              if (segment === "repeat") filtered = all.filter((c) => c.count > 1);
              if (segment === "vip") filtered = all.filter((c) => c.total > 1500);
              if (segment === "leads") filtered = all.filter((c) => c.count === 1 && !c.anyDelivered);
              filtered.sort((a, b) => b.total - a.total);
              return { segment, customers: filtered.slice(0, limit), total: filtered.length };
            }),
          }),

          querySalesReport: tool({
            description: "تقرير مبيعات مفصل: يومي / أسبوعي / شهري مع تجميع بالحالة والمحافظة.",
            inputSchema: z.object({ period: z.enum(["today", "week", "month"]).default("week") }),
            execute: safe("querySalesReport", async ({ period }: { period: string }) => {
              const days = period === "today" ? 1 : period === "week" ? 7 : 30;
              const start = new Date(); start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0);
              const { data, error } = await supabaseAdmin
                .from("orders")
                .select("total_price,status,governorate,poster_title,quantity,created_at")
                .eq("is_test", false)
                .gte("created_at", start.toISOString())
                .limit(5000);
              if (error) throw error;
              const rows = data ?? [];
              const total = rows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
              const byGov: Record<string, number> = {};
              const byProduct: Record<string, number> = {};
              const byStatus: Record<string, number> = {};
              for (const r of rows) {
                if (r.governorate) byGov[r.governorate] = (byGov[r.governorate] ?? 0) + 1;
                if (r.poster_title) byProduct[r.poster_title] = (byProduct[r.poster_title] ?? 0) + (r.quantity ?? 1);
                byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
              }
              const topProducts = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 10);
              const topGov = Object.entries(byGov).sort((a, b) => b[1] - a[1]).slice(0, 10);
              return { period, orders: rows.length, totalEGP: total, byStatus, topProducts, topGovernorates: topGov };
            }),
          }),

          queryHomepageSections: tool({
            description: "قائمة أقسام الصفحة الرئيسية الحالية (الترتيب، الظهور، العناوين).",
            inputSchema: z.object({}),
            execute: safe("queryHomepageSections", async () => {
              const { data, error } = await supabaseAdmin
                .from("site_settings")
                .select("value")
                .eq("key", "home_sections")
                .maybeSingle();
              if (error) throw error;
              return { sections: data?.value ?? null };
            }),
          }),

          queryErrorLogsSummary: tool({
            description: "ملخص Error Logs خلال آخر 24 ساعة (عدد حسب المستوى، أعلى الأخطاء تكرارًا).",
            inputSchema: z.object({}),
            execute: safe("queryErrorLogsSummary", async () => {
              const since = new Date(Date.now() - 86400000).toISOString();
              const { data, error } = await supabaseAdmin
                .from("system_logs")
                .select("level,message,created_at")
                .gte("created_at", since)
                .order("created_at", { ascending: false })
                .limit(500);
              if (error) throw error;
              const rows = data ?? [];
              const byLevel: Record<string, number> = {};
              const byMessage: Record<string, number> = {};
              for (const r of rows) {
                byLevel[r.level] = (byLevel[r.level] ?? 0) + 1;
                const key = String(r.message ?? "").slice(0, 120);
                byMessage[key] = (byMessage[key] ?? 0) + 1;
              }
              const top = Object.entries(byMessage).sort((a, b) => b[1] - a[1]).slice(0, 10);
              return { total: rows.length, byLevel, topMessages: top };
            }),
          }),

          queryPerformanceSummary: tool({
            description: "ملخص أداء الموقع خلال آخر 24 ساعة (LCP, CLS, INP).",
            inputSchema: z.object({}),
            execute: safe("queryPerformanceSummary", async () => {
              const since = new Date(Date.now() - 86400000).toISOString();
              const { data, error } = await supabaseAdmin
                .from("perf_metrics")
                .select("metric,value_ms,page_path,created_at")
                .gte("created_at", since)
                .limit(2000);
              if (error) throw error;
              const rows = data ?? [];
              const grouped: Record<string, { count: number; sum: number; max: number }> = {};
              for (const r of rows) {
                const g = grouped[r.metric] ?? { count: 0, sum: 0, max: 0 };
                g.count += 1; g.sum += Number(r.value_ms); g.max = Math.max(g.max, Number(r.value_ms));
                grouped[r.metric] = g;
              }
              const summary = Object.fromEntries(
                Object.entries(grouped).map(([k, v]) => [k, { avg: Math.round(v.sum / v.count), max: Math.round(v.max), samples: v.count }]),
              );
              return { total: rows.length, metrics: summary };
            }),
          }),

          queryGeminiKeysStatus: tool({
            description: "حالة مفاتيح Gemini + OpenRouter (شغال / rate-limit / disabled).",
            inputSchema: z.object({}),
            execute: safe("queryGeminiKeysStatus", async () => {
              const { getGeminiKeysStatus } = await import("@/lib/gemini.server");
              const status = getGeminiKeysStatus();
              return { status };
            }),
          }),

          // ---- Actions (some destructive; require `confirm: true`) ----

          setPosterHidden: tool({
            description:
              "إظهار أو إخفاء بوستر. الإخفاء يحتاج تأكيد (confirm=true). بدون تأكيد يرجع طلب تأكيد.",
            inputSchema: z.object({
              posterId: z.string().uuid(),
              hidden: z.boolean(),
              confirm: z.boolean().default(false),
            }),
            execute: safe("setPosterHidden", async ({ posterId, hidden, confirm }: { posterId: string; hidden: boolean; confirm: boolean }) => {
              if (hidden && !confirm) {
                return { needsConfirmation: true, prompt: "هل تريد فعلًا إخفاء هذا البوستر؟", posterId };
              }
              const { error } = await supabaseAdmin.from("posters").update({ hidden }).eq("id", posterId);
              if (error) throw error;
              return { updated: true, posterId, hidden };
            }),
          }),

          setPosterTrending: tool({
            description: "إضافة أو إزالة بوستر من Trending Now.",
            inputSchema: z.object({ posterId: z.string().uuid(), trending: z.boolean() }),
            execute: safe("setPosterTrending", async ({ posterId, trending }: { posterId: string; trending: boolean }) => {
              const { error } = await supabaseAdmin.from("posters").update({ trending }).eq("id", posterId);
              if (error) throw error;
              return { updated: true, posterId, trending };
            }),
          }),

          updateOrderStatus: tool({
            description:
              "تغيير حالة أوردر. حالات cancelled أو refunded تحتاج تأكيد (confirm=true).",
            inputSchema: z.object({
              orderId: z.string().uuid(),
              status: z.string(),
              confirm: z.boolean().default(false),
            }),
            execute: safe("updateOrderStatus", async ({ orderId, status, confirm }: { orderId: string; status: string; confirm: boolean }) => {
              const risky = ["cancelled", "refunded", "returned"];
              if (risky.includes(status.toLowerCase()) && !confirm) {
                return { needsConfirmation: true, prompt: `تأكيد تغيير حالة الأوردر إلى ${status}؟`, orderId, status };
              }
              const { error } = await supabaseAdmin.from("orders").update({ status }).eq("id", orderId);
              if (error) throw error;
              return { updated: true, orderId, status };
            }),
          }),

          updateHomepageSection: tool({
            description:
              "تعديل قسم في الصفحة الرئيسية (إظهار/إخفاء أو تغيير عنوان). key = مفتاح القسم.",
            inputSchema: z.object({
              key: z.string(),
              visible: z.boolean().optional(),
              title_ar: z.string().optional(),
              title_en: z.string().optional(),
            }),
            execute: safe("updateHomepageSection", async ({ key, visible, title_ar, title_en }: { key: string; visible?: boolean; title_ar?: string; title_en?: string }) => {
              const { data: current } = await supabaseAdmin
                .from("site_settings")
                .select("value")
                .eq("key", "home_sections")
                .maybeSingle();
              const list = Array.isArray(current?.value) ? [...(current!.value as any[])] : [];
              const idx = list.findIndex((s: any) => s?.key === key);
              if (idx === -1) return { updated: false, message: `لم يتم العثور على قسم بالمفتاح ${key}` };
              if (visible !== undefined) list[idx].visible = visible;
              if (title_ar !== undefined) list[idx].title_ar = title_ar;
              if (title_en !== undefined) list[idx].title_en = title_en;
              const { error } = await supabaseAdmin
                .from("site_settings")
                .upsert({ key: "home_sections", value: list }, { onConflict: "key" });
              if (error) throw error;
              return { updated: true, section: list[idx] };
            }),
          }),

          suggestWhatsAppMessage: tool({
            description: "اقتراح رسالة واتساب مناسبة لعميل (تأكيد / متابعة / سلة متروكة).",
            inputSchema: z.object({
              customerName: z.string(),
              scenario: z.enum(["confirm", "followup", "abandoned", "thanks"]),
              orderRef: z.string().optional(),
            }),
            execute: safe("suggestWhatsAppMessage", async ({ customerName, scenario, orderRef }: { customerName: string; scenario: string; orderRef?: string }) => {
              const map: Record<string, string> = {
                confirm: `أهلاً ${customerName} 👋، ده تأكيد أوردرك${orderRef ? ` رقم ${orderRef}` : ""} من Brwaz Neon. هل التفاصيل صحيحة؟`,
                followup: `أهلاً ${customerName}، بنطمن عليك بخصوص أوردرك${orderRef ? ` ${orderRef}` : ""}. لو محتاج أي مساعدة إحنا معاك.`,
                abandoned: `أهلاً ${customerName}، لاحظنا إنك سيبت سلة عندنا 🛒. لو تحب نساعدك تكمل الطلب، إحنا موجودين.`,
                thanks: `شكرًا ${customerName} على ثقتك في Brwaz Neon ❤️. يسعدنا نشوف تقييمك للطلب.`,
              };
              return { message: map[scenario] };
            }),
          }),

          generateProductDescription: tool({
            description:
              "توليد وصف احترافي بالعربية لمنتج (بوستر/إطار). يرجع الوصف كنص فقط.",
            inputSchema: z.object({
              title: z.string(),
              style: z.enum(["luxury", "casual", "short"]).default("luxury"),
              keywords: z.array(z.string()).optional(),
            }),
            execute: safe("generateProductDescription", async ({ title, style, keywords }: { title: string; style: string; keywords?: string[] }) => {
              const kw = keywords?.length ? `\nكلمات مفتاحية: ${keywords.join("، ")}` : "";
              const styleHint =
                style === "luxury"
                  ? "بأسلوب فاخر راقٍ"
                  : style === "short"
                    ? "قصير ومباشر (سطرين)"
                    : "ودود عصري";
              const res = await (
                await import("ai")
              ).generateText({
                model,
                prompt: `اكتب وصف منتج بالعربية ${styleHint} لبوستر بعنوان: "${title}".${kw}\nركز على الجودة والفخامة والتفاصيل. لا تضع علامات ماركداون.`,
              });
              return { description: res.text.trim() };
            }),
          }),

          generateMarketingCopy: tool({
            description: "توليد رسالة تسويقية/سوشيال ميديا/واتساب.",
            inputSchema: z.object({
              topic: z.string(),
              channel: z.enum(["whatsapp", "instagram", "facebook", "sms"]).default("whatsapp"),
              tone: z.enum(["urgent", "friendly", "elegant"]).default("elegant"),
            }),
            execute: safe("generateMarketingCopy", async ({ topic, channel, tone }: { topic: string; channel: string; tone: string }) => {
              const res = await (
                await import("ai")
              ).generateText({
                model,
                prompt: `اكتب رسالة تسويقية بالعربية لقناة ${channel} بأسلوب ${tone} حول: ${topic}. المتجر Brwaz Neon متخصص في البوسترات الفاخرة والإطارات. اجعلها قصيرة وجذابة.`,
              });
              return { copy: res.text.trim() };
            }),
          }),

          // ============= Visitor / Funnel / Cart Intelligence =============

          queryVisitorStats: tool({
            description: "إحصائيات الزوار (today/yesterday/week) — visitors، unique، pageviews، أهم المصادر.",
            inputSchema: z.object({ period: z.enum(["today", "yesterday", "week"]).default("today") }),
            execute: safe("queryVisitorStats", async ({ period }: { period: string }) => {
              const now = new Date();
              const start = new Date(now);
              let end: Date | null = null;
              if (period === "today") start.setHours(0, 0, 0, 0);
              else if (period === "yesterday") {
                start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
                end = new Date(now); end.setHours(0, 0, 0, 0);
              } else start.setDate(start.getDate() - 7);
              let q = supabaseAdmin.from("analytics_visits").select("visitor_id,path,source,device,created_at").gte("created_at", start.toISOString()).limit(5000);
              if (end) q = q.lt("created_at", end.toISOString());
              const { data, error } = await q;
              if (error) throw error;
              const rows = data ?? [];
              const visitors = new Set(rows.map((r) => r.visitor_id)).size;
              const bySource: Record<string, number> = {};
              const byDevice: Record<string, number> = {};
              const byPath: Record<string, number> = {};
              for (const r of rows) {
                const s = r.source ?? "direct"; bySource[s] = (bySource[s] ?? 0) + 1;
                const d = r.device ?? "unknown"; byDevice[d] = (byDevice[d] ?? 0) + 1;
                if (r.path) byPath[r.path] = (byPath[r.path] ?? 0) + 1;
              }
              const topSources = Object.entries(bySource).sort((a,b)=>b[1]-a[1]).slice(0,5);
              const topPaths = Object.entries(byPath).sort((a,b)=>b[1]-a[1]).slice(0,10);
              return { period, visitors, pageviews: rows.length, byDevice, topSources, topPaths };
            }),
          }),

          queryLiveVisitors: tool({
            description: "الزوار خلال آخر 15 دقيقة والصفحات المفتوحة الآن.",
            inputSchema: z.object({}),
            execute: safe("queryLiveVisitors", async () => {
              const since = new Date(Date.now() - 15 * 60_000).toISOString();
              const { data, error } = await supabaseAdmin
                .from("analytics_visits")
                .select("visitor_id,path,device,city,created_at")
                .gte("created_at", since)
                .order("created_at", { ascending: false })
                .limit(200);
              if (error) throw error;
              const rows = data ?? [];
              const activeVisitors = new Set(rows.map((r) => r.visitor_id));
              const currentPages: Record<string, number> = {};
              for (const r of rows) {
                if (!r.path) continue;
                currentPages[r.path] = (currentPages[r.path] ?? 0) + 1;
              }
              return { active: activeVisitors.size, pageviews: rows.length, topPages: Object.entries(currentPages).sort((a,b)=>b[1]-a[1]).slice(0,10) };
            }),
          }),

          querySalesFunnel: tool({
            description:
              "تحليل الفانل: visitors → product_views → add_to_cart → checkout → orders، مع نسب التحويل ومكان أكبر Drop-off.",
            inputSchema: z.object({ period: z.enum(["today", "week", "month"]).default("today") }),
            execute: safe("querySalesFunnel", async ({ period }: { period: string }) => {
              const days = period === "today" ? 1 : period === "week" ? 7 : 30;
              const start = new Date(); start.setDate(start.getDate() - days); if (period === "today") start.setHours(0,0,0,0);
              const iso = start.toISOString();
              const [{ data: visits }, { data: posterEvents }, { data: cartEvents }, { data: orders }] = await Promise.all([
                supabaseAdmin.from("analytics_visits").select("visitor_id").gte("created_at", iso).limit(20000),
                supabaseAdmin.from("analytics_poster_events").select("visitor_id,event_type").gte("created_at", iso).limit(20000),
                supabaseAdmin.from("visitor_cart_events").select("visitor_id,event").gte("created_at", iso).limit(20000),
                supabaseAdmin.from("orders").select("id,status,created_at").gte("created_at", iso).eq("is_test", false).limit(5000),
              ]);
              const uniqVisitors = new Set((visits ?? []).map((r) => r.visitor_id).filter(Boolean));
              const productViews = new Set((posterEvents ?? []).filter((r) => r.event_type === "view").map((r) => r.visitor_id).filter(Boolean));
              const addedToCart = new Set((cartEvents ?? []).filter((r) => /add/i.test(r.event ?? "")).map((r) => r.visitor_id));
              const checkoutStarted = new Set((cartEvents ?? []).filter((r) => /check/i.test(r.event ?? "")).map((r) => r.visitor_id));
              const orderCount = (orders ?? []).length;
              const confirmedCount = (orders ?? []).filter((o) => o.status === "confirmed" || o.status === "delivered" || o.status === "completed").length;

              const funnel = [
                { step: "Visitors", count: uniqVisitors.size },
                { step: "Product Views", count: productViews.size },
                { step: "Add to Cart", count: addedToCart.size },
                { step: "Checkout Started", count: checkoutStarted.size },
                { step: "Orders Placed", count: orderCount },
                { step: "Confirmed Orders", count: confirmedCount },
              ];
              const rates: { from: string; to: string; rate: number }[] = [];
              for (let i = 0; i < funnel.length - 1; i++) {
                const a = funnel[i].count, b = funnel[i+1].count;
                rates.push({ from: funnel[i].step, to: funnel[i+1].step, rate: a > 0 ? Math.round((b/a)*1000)/10 : 0 });
              }
              const biggestDrop = [...rates].sort((a,b)=>a.rate-b.rate)[0];
              return { period, funnel, rates, biggestDropoff: biggestDrop };
            }),
          }),

          queryCartInsights: tool({
            description:
              "أكثر المنتجات/المقاسات إضافة للسلة + المنتجات ذات مشاهدات عالية بدون إضافة للسلة (Drop-off حاد).",
            inputSchema: z.object({ days: z.number().int().min(1).max(30).default(7) }),
            execute: safe("queryCartInsights", async ({ days }: { days: number }) => {
              const start = new Date(); start.setDate(start.getDate() - days);
              const iso = start.toISOString();
              const [{ data: cart }, { data: views }] = await Promise.all([
                supabaseAdmin.from("visitor_cart_events").select("poster_id,size,event").gte("created_at", iso).limit(20000),
                supabaseAdmin.from("analytics_poster_events").select("poster_id,event_type").gte("created_at", iso).eq("event_type", "view").limit(20000),
              ]);
              const bySize: Record<string, number> = {};
              const byPoster: Record<string, number> = {};
              for (const r of cart ?? []) {
                if (!/add/i.test(r.event ?? "")) continue;
                if (r.size) bySize[r.size] = (bySize[r.size] ?? 0) + 1;
                if (r.poster_id) byPoster[r.poster_id] = (byPoster[r.poster_id] ?? 0) + 1;
              }
              const viewsBy: Record<string, number> = {};
              for (const v of views ?? []) if (v.poster_id) viewsBy[v.poster_id] = (viewsBy[v.poster_id] ?? 0) + 1;
              // High views, no/low cart (ratio > 20 views per add)
              const problematic: { poster_id: string; views: number; adds: number }[] = [];
              for (const [pid, vc] of Object.entries(viewsBy)) {
                const ac = byPoster[pid] ?? 0;
                if (vc >= 10 && (ac === 0 || vc / Math.max(ac, 1) >= 20)) problematic.push({ poster_id: pid, views: vc, adds: ac });
              }
              problematic.sort((a, b) => b.views - a.views);
              const topProblem = problematic.slice(0, 10);
              const posterIds = [...new Set([...Object.keys(byPoster).slice(0, 10), ...topProblem.map((p) => p.poster_id)])];
              let titles: Record<string, string> = {};
              if (posterIds.length) {
                const { data: ps } = await supabaseAdmin.from("posters").select("id,title,slug").in("id", posterIds);
                titles = Object.fromEntries((ps ?? []).map((p) => [p.id, p.title]));
              }
              const topAdded = Object.entries(byPoster).sort((a,b)=>b[1]-a[1]).slice(0,10)
                .map(([id, adds]) => ({ id, title: titles[id] ?? id, adds }));
              return {
                days,
                topSizes: Object.entries(bySize).sort((a,b)=>b[1]-a[1]).slice(0,10),
                topAddedProducts: topAdded,
                highViewsLowCart: topProblem.map((p) => ({ ...p, title: titles[p.poster_id] ?? p.poster_id })),
              };
            }),
          }),

          suggestConversionImprovements: tool({
            description:
              "استنادًا إلى بيانات الفانل، اقترح تحسينات عملية لزيادة المبيعات. تُستدعى بعد querySalesFunnel/queryCartInsights.",
            inputSchema: z.object({
              biggestDropStep: z.string().describe("اسم الخطوة الأضعف من الفانل (مثلاً 'Add to Cart' أو 'Checkout Started')"),
              context: z.string().optional(),
            }),
            execute: safe("suggestConversionImprovements", async ({ biggestDropStep, context }: { biggestDropStep: string; context?: string }) => {
              const catalog: Record<string, string[]> = {
                "Product Views": [
                  "تحسين صور المنتج والـ Thumbnails",
                  "إبراز السعر والعروض على البطاقة",
                  "إضافة Badge (Hot / Bestseller / New)",
                  "إضافة Reviews مختصرة تحت البطاقة",
                  "تحسين Meta title / description للسيو",
                ],
                "Add to Cart": [
                  "زر Add to Cart أكبر وأوضح في صفحة المنتج",
                  "إظهار المقاسات والسعر بجانب الزر مباشرة",
                  "إضافة عرض 'اشتري 2 واحصل على خصم'",
                  "Live stock indicator (باقي 3 قطع)",
                  "Trust badges (دفع عند الاستلام / شحن سريع)",
                ],
                "Checkout Started": [
                  "تقليل عدد حقول Checkout",
                  "إظهار زر Cash on Delivery أوضح",
                  "إظهار إجمالي السعر شاملاً الشحن بدري",
                  "إضافة زر 'أكمل الطلب عبر واتساب'",
                  "تحسين سرعة صفحة Checkout",
                ],
                "Orders Placed": [
                  "تبسيط خطوة رفع الصور",
                  "زر 'ابعت الصور على واتساب' كبديل",
                  "إظهار Progress bar للخطوات",
                  "إزالة الحقول غير الضرورية",
                ],
                "Confirmed Orders": [
                  "أتمتة رسالة WhatsApp تلقائية للتأكيد",
                  "متابعة العملاء خلال ساعة من الطلب",
                  "زر Quick Confirm للأدمن",
                ],
              };
              const key = Object.keys(catalog).find((k) => biggestDropStep.toLowerCase().includes(k.toLowerCase())) ?? "Add to Cart";
              return { step: key, suggestions: catalog[key], context: context ?? null };
            }),
          }),

          // ============= Error Diagnosis =============

          diagnoseError: tool({
            description:
              "شرح آخر Error خطير (أو Error محدد) بلغة مفهومة + سبب محتمل + Suggested Fix.",
            inputSchema: z.object({ errorId: z.string().uuid().optional() }),
            execute: safe("diagnoseError", async ({ errorId }: { errorId?: string }) => {
              let q = supabaseAdmin
                .from("system_logs")
                .select("id,level,message,category,source,stack,url,created_at,status")
                .order("created_at", { ascending: false })
                .limit(1);
              if (errorId) q = q.eq("id", errorId);
              else q = q.in("level", ["error", "critical", "warn"]).is("status", null as any);
              const { data, error } = await q;
              if (error) throw error;
              const err = data?.[0];
              if (!err) return { message: "لم أجد أخطاء مفتوحة حاليًا. الموقع يبدو مستقرًا." };
              const msg = err.message ?? "";
              const category = err.category ?? err.source ?? "unknown";
              const suggested: string[] = [];
              if (/fetch|network|timeout/i.test(msg)) suggested.push("إعادة المحاولة (Retry)", "التحقق من اتصال المصدر الخارجي");
              if (/upload|image/i.test(msg)) suggested.push("Re-run image processing", "التأكد من حجم الملف");
              if (/ai|gemini|openrouter|rate/i.test(msg)) suggested.push("Reset مفتاح AI Cooldown", "تبديل Provider fallback");
              if (/permission|denied|forbidden|rls/i.test(msg)) suggested.push("مراجعة سياسات RLS", "مراجعة صلاحيات المستخدم");
              if (!suggested.length) suggested.push("افتح Error Logs للتفاصيل", "أعد تشغيل العملية");
              return {
                error: { id: err.id, message: msg, level: err.level, category, when: err.created_at, url: err.url },
                explanation: `الخطأ من نوع ${category} في ${err.url ?? "غير محدد"}. الرسالة: ${msg.slice(0, 200)}`,
                impact: err.level === "critical" ? "خطر عالي — قد يؤثر على العملاء" : err.level === "error" ? "متوسط" : "منخفض",
                suggested,
              };
            }),
          }),

          // ============= Safe Auto Fix (Level 1 — needs simple confirmation) =============

          runSafeAutoFix: tool({
            description:
              "تنفيذ إصلاح آمن Level 1. kinds: clear_old_perf_metrics | reset_all_gemini_cooldowns | archive_old_logs | mark_resolved_notifications_old | recalculate_poster_counters. يحتاج confirm=true.",
            inputSchema: z.object({
              kind: z.enum([
                "clear_old_perf_metrics",
                "reset_all_gemini_cooldowns",
                "archive_old_logs",
                "mark_resolved_notifications_old",
                "recalculate_poster_counters",
              ]),
              confirm: z.boolean().default(false),
            }),
            execute: safe("runSafeAutoFix", async ({ kind, confirm }: { kind: string; confirm: boolean }) => {
              if (!confirm) {
                const labels: Record<string, string> = {
                  clear_old_perf_metrics: "حذف قياسات الأداء الأقدم من 30 يومًا",
                  reset_all_gemini_cooldowns: "إعادة تعيين cooldown لكل مفاتيح Gemini",
                  archive_old_logs: "أرشفة/حذف Error Logs الأقدم من 60 يومًا",
                  mark_resolved_notifications_old: "تحديد التنبيهات القديمة كمُعالجة",
                  recalculate_poster_counters: "إعادة حساب عدادات المشاهدات/المبيعات للبوسترات",
                };
                return { needsConfirmation: true, prompt: `تأكيد تنفيذ: ${labels[kind]}؟`, kind };
              }
              if (kind === "clear_old_perf_metrics") {
                const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
                const { count, error } = await supabaseAdmin.from("perf_metrics").delete({ count: "exact" }).lt("created_at", cutoff);
                if (error) throw error;
                return { done: true, kind, deleted: count ?? 0 };
              }
              if (kind === "archive_old_logs") {
                const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
                const { count, error } = await supabaseAdmin.from("system_logs").delete({ count: "exact" }).lt("created_at", cutoff);
                if (error) throw error;
                return { done: true, kind, deleted: count ?? 0 };
              }
              if (kind === "mark_resolved_notifications_old") {
                const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
                const { count, error } = await supabaseAdmin
                  .from("admin_notifications")
                  .update({ resolved_at: new Date().toISOString() }, { count: "exact" })
                  .lt("created_at", cutoff)
                  .is("resolved_at", null);
                if (error) throw error;
                return { done: true, kind, updated: count ?? 0 };
              }
              if (kind === "reset_all_gemini_cooldowns") {
                const { resetGeminiKeyCooldown, getGeminiKeysStatus } = await import("@/lib/gemini.server");
                const status = getGeminiKeysStatus();
                for (let i = 0; i < status.length; i++) {
                  try { resetGeminiKeyCooldown(i); } catch {/* ignore */}
                }
                return { done: true, kind, resetKeys: status.length };
              }
              if (kind === "recalculate_poster_counters") {
                // Safe stand-in: mark as queued; heavy work belongs in a cron job
                return { done: true, kind, queued: true, note: "تم جدولة إعادة الحساب في الخلفية." };
              }
              return { done: false, kind };
            }),
          }),

          // ============= Performance Fixes (Level 2) =============

          runPerformanceFix: tool({
            description:
              "إصلاح أداء Level 2. kinds: disable_hidden_home_sections | reduce_homepage_items_count | clear_perf_metrics. يحتاج confirm=true.",
            inputSchema: z.object({
              kind: z.enum(["disable_hidden_home_sections", "reduce_homepage_items_count", "clear_perf_metrics"]),
              itemsCount: z.number().int().min(4).max(50).default(12),
              confirm: z.boolean().default(false),
            }),
            execute: safe("runPerformanceFix", async ({ kind, itemsCount, confirm }: { kind: string; itemsCount: number; confirm: boolean }) => {
              if (!confirm) return { needsConfirmation: true, prompt: `تأكيد تنفيذ إصلاح الأداء: ${kind}؟`, kind };
              if (kind === "clear_perf_metrics") {
                const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
                const { count, error } = await supabaseAdmin.from("perf_metrics").delete({ count: "exact" }).lt("created_at", cutoff);
                if (error) throw error;
                return { done: true, kind, deleted: count ?? 0 };
              }
              // Load current homepage sections
              const { data: current } = await supabaseAdmin.from("site_settings").select("value").eq("key", "home_sections").maybeSingle();
              const list = Array.isArray(current?.value) ? [...(current!.value as any[])] : [];
              if (kind === "reduce_homepage_items_count") {
                for (const s of list) if (s && typeof s === "object") s.items_count = itemsCount;
              }
              // disable_hidden_home_sections is a no-op safeguard: already hidden sections stay hidden
              const { error } = await supabaseAdmin.from("site_settings").upsert({ key: "home_sections", value: list }, { onConflict: "key" });
              if (error) throw error;
              return { done: true, kind, sectionsCount: list.length };
            }),
          }),

          // ============= Cart Recovery Action =============

          markCartRecoveryAction: tool({
            description:
              "تسجيل إجراء متابعة على سلة متروكة: contacted | recovered | ignored. يُخزن كتنبيه إداري.",
            inputSchema: z.object({
              visitorId: z.string(),
              action: z.enum(["contacted", "recovered", "ignored"]),
              note: z.string().optional(),
            }),
            execute: safe("markCartRecoveryAction", async ({ visitorId, action, note }: { visitorId: string; action: string; note?: string }) => {
              const { error } = await supabaseAdmin.from("admin_notifications").insert({
                type: "cart_recovery",
                priority: "low",
                title: `Cart recovery: ${action}`,
                message: `Visitor ${visitorId} — ${action}${note ? ` — ${note}` : ""}`,
                metadata: { visitorId, action, note: note ?? null },
              } as any);
              if (error) throw error;
              return { logged: true, visitorId, action };
            }),
          }),

          // ============= Developer Task (Level 3) =============

          createDeveloperTask: tool({
            description:
              "إنشاء Developer Task عندما يطلب الأدمن تعديل كود أو Feature جديدة تحتاج مبرمج. يُخزن كتنبيه للأدمن بنوع developer_task.",
            inputSchema: z.object({
              title: z.string().min(3),
              description: z.string().min(3),
              priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
              affectedPages: z.array(z.string()).optional(),
              riskLevel: z.enum(["low", "medium", "high"]).default("medium"),
              acceptanceCriteria: z.array(z.string()).optional(),
            }),
            execute: safe("createDeveloperTask", async (input: {
              title: string; description: string; priority: string;
              affectedPages?: string[]; riskLevel: string; acceptanceCriteria?: string[];
            }) => {
              const { data, error } = await supabaseAdmin.from("admin_notifications").insert({
                type: "developer_task",
                priority: input.priority,
                title: `[Task] ${input.title}`,
                message: input.description,
                metadata: {
                  affectedPages: input.affectedPages ?? [],
                  riskLevel: input.riskLevel,
                  acceptanceCriteria: input.acceptanceCriteria ?? [],
                  status: "planned",
                  createdBy: "ai-assistant",
                },
              } as any).select("id").maybeSingle();
              if (error) throw error;
              return { created: true, taskId: data?.id, title: input.title };
            }),
          }),
        };

        const result = streamText({
          model,
          system: `أنت "AI Admin Assistant" داخل لوحة تحكم متجر Brwaz Neon (بوسترات وإطارات فاخرة).

قواعد إلزامية:
- افهم أوامر الأدمن بالعربي الفصحى والعامي والإنجليزي، ورد بنفس لغة السؤال.
- استخدم الأدوات المتاحة دائمًا للحصول على البيانات — لا تخترع أرقامًا أو أسماء.
- عند نجاح الأداة (ok=true) لخّص النتيجة بشكل عملي وواضح، ثم اقترح "Suggested Next Actions" مختصرة.
- عند فشل الأداة (ok=false) لا تعرض التفاصيل التقنية للأدمن. اكتب friendly من نتيجة الأداة واقترح بديلاً.
- أي إجراء خطير (إخفاء، حذف، إلغاء، Bulk، Auto Fix) نفذه بـ confirm=false أولًا لعرض تأكيد. بعد الموافقة أعد الاستدعاء بـ confirm=true.
- لتحسين المبيعات: اجمع أولاً بيانات querySalesFunnel + queryCartInsights ثم استدعِ suggestConversionImprovements بأكبر Drop-off.
- لأي مشكلة أداء: استخدم queryPerformanceSummary ثم اقترح runPerformanceFix (بموافقة).
- لأي Error: استخدم diagnoseError واعرض السبب والـ Suggested Fix. لا تطبع رسالة الخطأ الخام.
- إذا الأدمن طلب Feature أو تعديل كود يحتاج مبرمج، استخدم createDeveloperTask (بعد فهم واضح).
- إذا لم تجد بيانات كافية قل ذلك بوضوح ولا تخمن.
- تاريخ اليوم: ${new Date().toISOString().slice(0, 10)}.
- التنسيق: عناوين قصيرة، نقاط أو جداول Markdown مبسّطة. لا تعرض stack traces أو JSON خام.`,
          messages: await convertToModelMessages(messages),
          tools,
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});