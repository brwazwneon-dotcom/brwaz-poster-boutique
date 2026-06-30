import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CategoryLite = { id: string; name: string; slug: string; parent_id: string | null };

type GenInput = {
  imageUrl: string;
  filename?: string;
  categories: CategoryLite[];
};

export type GeneratedPosterMeta = {
  title: string;
  description: string;
  seo_title: string;
  seo_description: string;
  tags: string[];
  category_id: string | null;
  subcategory_id: string | null;
};

export const generatePosterMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown): GenInput => {
    const d = data as GenInput;
    if (!d || typeof d.imageUrl !== "string") throw new Error("imageUrl required");
    return {
      imageUrl: d.imageUrl,
      filename: typeof d.filename === "string" ? d.filename : undefined,
      categories: Array.isArray(d.categories) ? d.categories : [],
    };
  })
  .handler(async ({ data }): Promise<GeneratedPosterMeta> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const mains = data.categories.filter((c) => !c.parent_id);
    const catList = mains
      .map((m) => {
        const subs = data.categories.filter((s) => s.parent_id === m.id);
        const subStr = subs.length
          ? ` (sub: ${subs.map((s) => `${s.name}#${s.id}`).join(", ")})`
          : "";
        return `- ${m.name}#${m.id}${subStr}`;
      })
      .join("\n");

    const system = `You are an e-commerce SEO assistant for BRWAZWNEON, a premium poster store selling Football, Movies, TV Series, Anime, Cars, and Custom posters. Analyze the poster image and return JSON only.
Categories available (use the exact id after the # for category_id / subcategory_id, or null if none match):
${catList || "(none)"}

Return JSON with this exact shape:
{
  "title": "concise commercial title, 4-8 words",
  "description": "1-2 sentence customer-facing description for a wall poster product page",
  "seo_title": "SEO title under 60 chars including main keyword + 'Poster'",
  "seo_description": "SEO meta description under 160 chars",
  "tags": ["5 to 10 short relevant tags"],
  "category_id": "<id or null>",
  "subcategory_id": "<id or null>"
}
No markdown, no commentary.`;

    const userText = `Identify the subject of this poster image and generate the metadata. Filename hint: ${data.filename ?? "(none)"}.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: data.imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI gateway ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    let parsed: Partial<GeneratedPosterMeta> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    const validIds = new Set(data.categories.map((c) => c.id));
    const catId =
      typeof parsed.category_id === "string" && validIds.has(parsed.category_id)
        ? parsed.category_id
        : null;
    const subId =
      typeof parsed.subcategory_id === "string" && validIds.has(parsed.subcategory_id)
        ? parsed.subcategory_id
        : null;

    return {
      title: String(parsed.title ?? "").slice(0, 120) || (data.filename ?? "Untitled Poster"),
      description: String(parsed.description ?? "").slice(0, 500),
      seo_title: String(parsed.seo_title ?? "").slice(0, 70),
      seo_description: String(parsed.seo_description ?? "").slice(0, 200),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t)).filter(Boolean).slice(0, 15)
        : [],
      category_id: catId,
      subcategory_id: subId,
    };
  });