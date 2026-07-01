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
  alt_text: string;
  slug: string;
  badge: string | null;
  tags: string[];
  category_id: string | null;
  subcategory_id: string | null;
  colors: string[];
  orientation: "portrait" | "landscape" | "square" | null;
  confidence: number;
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

    const system = `You are an e-commerce SEO copywriter for BRWAZWNEON, a premium framed-poster store in Egypt selling Football, Movies, TV Series, Marvel & DC, Anime, Cars, Gaming, Portraits, Photography and Quotes posters. Analyze the poster image and return JSON only.
Categories available (use the exact id after the # for category_id / subcategory_id, or null if none match):
${catList || "(none)"}

Description writing rules (80-150 words, natural persuasive tone, no emojis, no hype words like "amazing"):
- Open by naming the exact subject you see in the image (player, movie, character, car model, etc.)
- Mention premium print quality on FujiFilm Crystal Archive chemical paper
- Mention the choice between a High Quality PVC Frame or a Wooden Portrait finish
- Mention long-lasting, fade-resistant colors and a professional gallery finish
- Suggest it as perfect wall decor for bedroom, office, gaming room, or a gift

Return JSON with this exact shape:
{
  "title": "clean human-friendly product title, 4-8 words, e.g. 'Lionel Messi World Cup Poster'",
  "description": "80-150 word marketing paragraph following the rules above",
  "seo_title": "SEO title max 60 chars, ending with '| BRWAZWNEON'",
  "seo_description": "SEO meta description max 155 chars, action-oriented, mention framed poster + Egypt / cash on delivery when it fits",
  "alt_text": "descriptive alt text for accessibility and Google Images, under 120 chars",
  "slug": "kebab-case url slug, lowercase letters, numbers and dashes only, under 60 chars",
  "badge": "one of: best-seller, new, trending, limited, exclusive — or null if none clearly applies",
  "tags": ["10 to 20 short relevant keywords/tags — subjects, franchise, style, room, gift, BRWAZWNEON"],
  "category_id": "<id or null>",
  "subcategory_id": "<id or null>",
  "colors": ["2 to 5 dominant colors as lowercase english names, e.g. black, white, red, gold"],
  "orientation": "portrait | landscape | square",
  "confidence": 0.0
}
confidence is a number between 0 and 1 reflecting how confident you are that the subject, category and metadata are correct.
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
    const allowedBadges = new Set(["best-seller", "new", "trending", "limited", "exclusive"]);
    const badge =
      typeof parsed.badge === "string" && allowedBadges.has(parsed.badge) ? parsed.badge : null;
    const allowedOrient = new Set(["portrait", "landscape", "square"] as const);
    const orientation =
      typeof parsed.orientation === "string" && allowedOrient.has(parsed.orientation as never)
        ? (parsed.orientation as "portrait" | "landscape" | "square")
        : null;
    const colors = Array.isArray(parsed.colors)
      ? parsed.colors
          .map((c) => String(c).toLowerCase().trim())
          .filter((c) => c && c.length <= 24)
          .slice(0, 6)
      : [];
    const confRaw = typeof parsed.confidence === "number" ? parsed.confidence : Number(parsed.confidence);
    const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : 0.7;
    const slugify = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    const title = String(parsed.title ?? "").slice(0, 120) || (data.filename ?? "Untitled Poster");

    return {
      title,
      description: String(parsed.description ?? "").slice(0, 500),
      seo_title: String(parsed.seo_title ?? "").slice(0, 70),
      seo_description: String(parsed.seo_description ?? "").slice(0, 200),
      alt_text: String(parsed.alt_text ?? "").slice(0, 160) || title,
      slug: (typeof parsed.slug === "string" && parsed.slug ? slugify(parsed.slug) : slugify(title)),
      badge,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t)).filter(Boolean).slice(0, 20)
        : [],
      category_id: catId,
      subcategory_id: subId,
      colors,
      orientation,
      confidence,
    };
  });