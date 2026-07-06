// Edge Function: seo-generator
// Generates poster SEO content via OpenRouter (free models, with fallbacks).
// Reads OPENROUTER_API_KEY from Supabase Edge Function Secrets — never exposed to the client.
// Admin-only. Called from the front-end via supabase.functions.invoke("seo-generator").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen3-32b:free",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type GenInput = {
  title?: string;
  category?: string;
  subject?: string;
  tags?: string[];
  notes?: string;
};

type SeoResult = {
  title: string;
  description: string;
  seo_title: string;
  seo_description: string;
  tags: string[];
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function buildPrompt(input: GenInput) {
  const hints = [
    input.subject ? `Subject: ${input.subject}` : null,
    input.title ? `Current title: ${input.title}` : null,
    input.category ? `Category: ${input.category}` : null,
    input.tags?.length ? `Existing tags: ${input.tags.join(", ")}` : null,
    input.notes ? `Notes: ${input.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const system = `You are an e-commerce SEO copywriter for BRWAZWNEON, a premium framed-poster store in Egypt (Football, Movies, TV, Anime, Marvel & DC, Cars, Gaming, Portraits, Quotes).
Return STRICT JSON only, no markdown, no commentary. Shape:
{
  "title": "4-8 word product title",
  "description": "80-150 word marketing paragraph. Mention FujiFilm Crystal Archive chemical paper, PVC frame or Wooden Portrait finish, fade-resistant colors, gallery finish, and gift/wall decor use.",
  "seo_title": "max 60 chars, ends with ' | BRWAZWNEON'",
  "seo_description": "max 155 chars, action-oriented, mentions framed poster and Egypt / cash on delivery when it fits",
  "tags": ["10 to 20 short lowercase keywords, include subject, franchise, style, room, gift, brwazwneon"]
}`;

  const user = `Generate premium SEO content for this poster.\n${hints || "No specific hints — infer a strong generic listing."}`;
  return { system, user };
}

async function callOpenRouter(model: string, system: string, user: string, apiKey: string) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://brwaz-poster-boutique.lovable.app",
      "X-Title": "BRWAZWNEON SEO Generator",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status} on ${model}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error(`Empty content from ${model}`);
  return content;
}

function parseJson(content: string): Partial<SeoResult> {
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return {};
      }
    }
    return {};
  }
}

function normalize(parsed: Partial<SeoResult>, fallbackTitle: string): SeoResult {
  const title = String(parsed.title ?? "").trim().slice(0, 120) || fallbackTitle;
  const description = String(parsed.description ?? "").trim().slice(0, 900);
  let seo_title = String(parsed.seo_title ?? "").trim().slice(0, 70);
  if (seo_title && !/brwazwneon/i.test(seo_title)) {
    seo_title = `${seo_title} | BRWAZWNEON`.slice(0, 70);
  }
  const seo_description = String(parsed.seo_description ?? "").trim().slice(0, 200);
  const tags = Array.isArray(parsed.tags)
    ? Array.from(
        new Set(
          parsed.tags
            .map((t) => String(t).toLowerCase().trim())
            .filter((t) => t && t.length <= 40),
        ),
      ).slice(0, 20)
    : [];
  return { title, description, seo_title, seo_description, tags };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return json(500, { error: "AI temporarily unavailable — please try again." });
  }

  // Admin auth check
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return json(401, { error: "Unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "Unauthorized" });
  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr || !isAdmin) return json(403, { error: "Forbidden" });

  let input: GenInput = {};
  try {
    input = (await req.json()) as GenInput;
  } catch {
    // allow empty body
  }

  const { system, user } = buildPrompt(input);
  const fallbackTitle = input.title || input.subject || "Premium Framed Poster";

  let lastErr: unknown = null;
  for (const model of MODELS) {
    try {
      const content = await callOpenRouter(model, system, user, apiKey);
      const parsed = parseJson(content);
      const result = normalize(parsed, fallbackTitle);
      if (!result.description || !result.seo_description) {
        throw new Error(`Missing fields from ${model}`);
      }
      return json(200, { ...result, model });
    } catch (e) {
      lastErr = e;
      console.error("[seo-generator]", e instanceof Error ? e.message : String(e));
    }
  }

  return json(503, {
    error:
      "AI temporarily unavailable — OpenRouter is not responding. Please try again in a moment.",
    detail: lastErr instanceof Error ? lastErr.message : String(lastErr),
  });
});