// Edge Function: seo-generator
// Generates poster SEO content via OpenRouter (free models, with fallbacks).
// Reads OPENROUTER_API_KEY from Supabase Edge Function Secrets — never exposed to the client.
// Admin-only. Called from the front-end via supabase.functions.invoke("seo-generator").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Providers, tried in order. Lovable AI Gateway first (no key needed on Lovable Cloud),
// then OpenRouter free tier as a fallback if the user configured OPENROUTER_API_KEY.
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const LOVABLE_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
];
const OPENROUTER_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
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
  include_hashtags?: boolean;
  include_alt_text?: boolean;
};

type SeoResult = {
  title: string;
  description: string;
  seo_title: string;
  seo_description: string;
  tags: string[];
  hashtags?: string[];
  alt_text?: string;
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
  "tags": ["10 to 20 short lowercase keywords, include subject, franchise, style, room, gift, brwazwneon"]${input.include_hashtags ? `,\n  "hashtags": ["8-15 social hashtags without the # symbol, lowercase, no spaces"]` : ""}${input.include_alt_text ? `,\n  "alt_text": "single descriptive alt text under 120 chars, plain text, no emoji"` : ""}
}`;

  const user = `Generate premium SEO content for this poster.\n${hints || "No specific hints — infer a strong generic listing."}`;
  return { system, user };
}

async function callGateway(
  url: string,
  model: string,
  system: string,
  user: string,
  apiKey: string,
  label: string,
) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://brwazwneon.lovable.app",
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
    throw new Error(`${label} ${res.status} on ${model}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error(`Empty content from ${label}:${model}`);
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
  const hashtags = Array.isArray(parsed.hashtags)
    ? Array.from(
        new Set(
          parsed.hashtags
            .map((t) => String(t).toLowerCase().replace(/^#+/, "").replace(/\s+/g, "").trim())
            .filter((t) => t && t.length <= 40),
        ),
      ).slice(0, 15)
    : undefined;
  const alt_text = typeof parsed.alt_text === "string"
    ? parsed.alt_text.trim().slice(0, 160) || undefined
    : undefined;
  return { title, description, seo_title, seo_description, tags, hashtags, alt_text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!lovableKey && !openrouterKey) {
    return json(500, { error: "AI is not configured on this project." });
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

  const attempts: Array<{ url: string; model: string; key: string; label: string }> = [];
  if (lovableKey) {
    for (const m of LOVABLE_MODELS) attempts.push({ url: LOVABLE_URL, model: m, key: lovableKey, label: "Lovable" });
  }
  if (openrouterKey) {
    for (const m of OPENROUTER_MODELS) attempts.push({ url: OPENROUTER_URL, model: m, key: openrouterKey, label: "OpenRouter" });
  }

  let lastErr: unknown = null;
  for (const a of attempts) {
    try {
      const content = await callGateway(a.url, a.model, system, user, a.key, a.label);
      const parsed = parseJson(content);
      const result = normalize(parsed, fallbackTitle);
      if (!result.description || !result.seo_description) {
        throw new Error(`Missing fields from ${a.label}:${a.model}`);
      }
      return json(200, { ...result, model: `${a.label}:${a.model}` });
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