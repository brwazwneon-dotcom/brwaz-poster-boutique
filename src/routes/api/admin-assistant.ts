import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";

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
            execute: async ({ period }) => {
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
              if (error) return { error: error.message };
              const rows = (data ?? []).filter((r) => !r.is_test);
              const total = rows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
              const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
                acc[r.status] = (acc[r.status] ?? 0) + 1;
                return acc;
              }, {});
              return { period, count: count ?? rows.length, totalEGP: total, byStatus };
            },
          }),

          queryTopProducts: tool({
            description: "أعلى المنتجات مبيعًا أو مشاهدة.",
            inputSchema: z.object({
              by: z.enum(["sales", "views"]).default("sales"),
              limit: z.number().int().min(1).max(20).default(10),
            }),
            execute: async ({ by, limit }) => {
              const orderCol = by === "sales" ? "sales_count" : "views_count";
              const { data, error } = await supabaseAdmin
                .from("posters")
                .select("id,title,slug,sales_count,views_count,price,hidden")
                .eq("hidden", false)
                .order(orderCol, { ascending: false })
                .limit(limit);
              if (error) return { error: error.message };
              return { by, products: data ?? [] };
            },
          }),

          queryRecentOrders: tool({
            description: "آخر الطلبات مع بيانات العميل والحالة.",
            inputSchema: z.object({
              limit: z.number().int().min(1).max(20).default(10),
              status: z.string().optional(),
            }),
            execute: async ({ limit, status }) => {
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
              if (error) return { error: error.message };
              return { orders: data ?? [] };
            },
          }),

          queryCustomerLookup: tool({
            description: "بحث عن عميل برقم الهاتف أو رقم الطلب. يرجع كل طلباته.",
            inputSchema: z.object({
              query: z.string().min(3),
            }),
            execute: async ({ query }) => {
              const q = query.trim();
              const { data, error } = await supabaseAdmin
                .from("orders")
                .select(
                  "id,order_number,customer_name,phone,governorate,address,status,total_price,poster_title,quantity,created_at",
                )
                .or(`phone.ilike.%${q}%,order_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
                .order("created_at", { ascending: false })
                .limit(20);
              if (error) return { error: error.message };
              return { orders: data ?? [] };
            },
          }),

          queryNotifications: tool({
            description: "آخر التنبيهات والمشاكل في الداش بورد.",
            inputSchema: z.object({
              unreadOnly: z.boolean().default(false),
              limit: z.number().int().min(1).max(20).default(10),
            }),
            execute: async ({ unreadOnly, limit }) => {
              let q = supabaseAdmin
                .from("admin_notifications")
                .select("id,type,priority,title,message,created_at,read_at,resolved_at")
                .order("created_at", { ascending: false })
                .limit(limit);
              if (unreadOnly) q = q.is("read_at", null);
              const { data, error } = await q;
              if (error) return { error: error.message };
              return { notifications: data ?? [] };
            },
          }),

          generateProductDescription: tool({
            description:
              "توليد وصف احترافي بالعربية لمنتج (بوستر/إطار). يرجع الوصف كنص فقط.",
            inputSchema: z.object({
              title: z.string(),
              style: z.enum(["luxury", "casual", "short"]).default("luxury"),
              keywords: z.array(z.string()).optional(),
            }),
            execute: async ({ title, style, keywords }) => {
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
            },
          }),

          generateMarketingCopy: tool({
            description: "توليد رسالة تسويقية/سوشيال ميديا/واتساب.",
            inputSchema: z.object({
              topic: z.string(),
              channel: z.enum(["whatsapp", "instagram", "facebook", "sms"]).default("whatsapp"),
              tone: z.enum(["urgent", "friendly", "elegant"]).default("elegant"),
            }),
            execute: async ({ topic, channel, tone }) => {
              const res = await (
                await import("ai")
              ).generateText({
                model,
                prompt: `اكتب رسالة تسويقية بالعربية لقناة ${channel} بأسلوب ${tone} حول: ${topic}. المتجر Brwaz Neon متخصص في البوسترات الفاخرة والإطارات. اجعلها قصيرة وجذابة.`,
              });
              return { copy: res.text.trim() };
            },
          }),
        };

        const result = streamText({
          model,
          system: `أنت مساعد ذكاء اصطناعي داخل لوحة تحكم متجر Brwaz Neon (بوسترات وإطارات فاخرة).
- أجب دائمًا بالعربية بشكل مختصر وواضح.
- استخدم الأدوات المتاحة للحصول على بيانات حقيقية من قاعدة البيانات — لا تخترع أرقامًا.
- عند عرض الطلبات أو المنتجات، لخّص بشكل جدولي أو نقاط.
- المستخدم هو مسؤول المتجر (Admin) وله كامل الصلاحية على البيانات.
- تاريخ اليوم: ${new Date().toISOString().slice(0, 10)}.`,
          messages: convertToModelMessages(messages),
          tools,
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});