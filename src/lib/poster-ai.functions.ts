import { createServerFn } from "@tanstack/react-start";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";

type CategoryLite = { id: string; name: string; slug: string; parent_id: string | null };

type GenInput = {
  imageUrl: string;
  filename?: string;
  categories: CategoryLite[];
  categoryName?: string;
  subcategoryName?: string;
  badge?: string | null;
  productId?: string;
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
  suggested_category_name: string | null;
  suggested_subcategory_name: string | null;
  detected_subject: string | null;
  detected_type: string | null;
  colors: string[];
  orientation: "portrait" | "landscape" | "square" | null;
  confidence: number;
  detected_text: string | null;
  detected_language: string | null;
  visual_style: string | null;
  hashtags: string[];
  product_id: string | null;
  needs_review: boolean;
  validation_conflicts: string[];
};

const FORBIDDEN_WORDS_FOR_ISLAMIC = new Set([
  "ferrari",
  "bmw",
  "mercedes",
  "audi",
  "porsche",
  "lamborghini",
  "mclaren",
  "bugatti",
  "mustang",
  "nissan",
  "toyota",
  "tesla",
  "dodge",
  "chevrolet",
  "car",
  "automotive",
  "vehicle",
  "motor",
  "engine",
  "godfather",
  "marvel",
  "dc",
  "avengers",
  "spider-man",
  "batman",
  "superman",
  "anime",
  "naruto",
  "dragon ball",
  "one piece",
  "attack on titan",
  "football",
  "soccer",
  "messi",
  "ronaldo",
  "salah",
  "world cup",
  "movie",
  "tv series",
  "hollywood",
]);

const CATEGORY_HARD_BLOCKS: Record<string, Set<string>> = {
  islamic: FORBIDDEN_WORDS_FOR_ISLAMIC,
  "marvel & dc": new Set(["anime", "football", "car", "islamic", "quran", "allah", "calligraphy"]),
  cars: new Set(["anime", "football", "movie", "tv series", "islamic", "quran", "allah"]),
  anime: new Set(["car", "football", "islamic", "quran"]),
  football: new Set(["anime", "car", "islamic", "quran"]),
};

function checkCategoryHardBlock(
  categoryName: string,
  title: string,
  description: string,
  tags: string[],
  detectedSubject: string | null,
): string[] {
  const lowerCat = categoryName.toLowerCase().trim();
  const blockWords = CATEGORY_HARD_BLOCKS[lowerCat];
  if (!blockWords) return [];

  const conflicts: string[] = [];
  const check = (field: string, value: string) => {
    const lower = value.toLowerCase();
    for (const word of blockWords) {
      if (lower.includes(word)) {
        conflicts.push(`${field} contains forbidden term "${word}" for category "${categoryName}"`);
      }
    }
  };

  check("title", title);
  check("description", description);
  for (const t of tags) check("tag", t);
  if (detectedSubject) check("detected_subject", detectedSubject);

  return conflicts;
}

export const generatePosterMeta = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown): GenInput => {
    const d = data as Record<string, unknown>;
    if (!d) throw new Error("input required");
    if (typeof d.imageUrl !== "string" || !d.imageUrl) {
      throw new Error("imageUrl is required — text-only generation is no longer supported.");
    }
    return {
      imageUrl: d.imageUrl,
      filename: typeof d.filename === "string" ? d.filename : undefined,
      categories: Array.isArray(d.categories) ? (d.categories as CategoryLite[]) : [],
      categoryName: typeof d.categoryName === "string" ? d.categoryName : undefined,
      subcategoryName: typeof d.subcategoryName === "string" ? d.subcategoryName : undefined,
      badge: typeof d.badge === "string" ? d.badge : null,
      productId: typeof d.productId === "string" ? d.productId : undefined,
    };
  })
  .handler(async ({ data }): Promise<GeneratedPosterMeta> => {
    const { geminiGenerate, urlToInlineData, extractText, GEMINI_TEXT_MODEL, getGeminiKey } =
      await import("@/lib/gemini.server");
    if (!getGeminiKey()) throw new Error("GEMINI_API_KEY missing");

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

    const assignedCategoryName = data.categoryName ?? "";
    const assignedSubcategoryName = data.subcategoryName ?? "";

    const system = `You are an e-commerce SEO copywriter AND a visual recognition expert for BRWAZWNEON, a premium framed-poster store in Egypt selling Football, Movies, TV Series, Marvel & DC, Anime, Cars, Gaming, Portraits, Photography and Quotes posters.

You ALWAYS receive the real poster image as vision input.

YOUR JOB:
1. Read ALL visible text in the image (Arabic, English, names, quotes, brands, logos).
2. Identify what or who appears in the image with specificity.
3. Generate complete SEO metadata from the visual content only.

TEXT READING — inspect the image for every visible character. Extract:
- Arabic text (including religious phrases like bismillah, ayat al kursi, allah, muhammad)
- English text (player names, movie titles, car brands, quotes, logos)
- Numbers, dates, jersey numbers
- If no readable text is visible, return detected_text as null

SUBJECT IDENTIFICATION:
- Person / football player / actor: name the exact person if clearly identifiable.
- Car: name the exact make and model (e.g. "Ferrari 250 GTO", "Porsche 911").
- Anime / movie: name the exact title.
- Arabic calligraphy / Islamic art: describe the style (e.g. "Thuluth calligraphy", "Islamic geometric pattern").
- Quote: transcribe the quote text.
- If uncertain, use a general visual description and mark low confidence.

Categories available (use the exact id after the #):
${catList || "(none)"}

CATEGORY MAPPING RULES:
- Football player or club → main "Football", subcategory = name.
- Movie/TV → main "Movies" or "TV Series", subcategory = title.
- Anime → main "Anime", subcategory = title.
- Car → main "Cars", subcategory = brand/model.
- Marvel/DC → main "Marvel & DC", subcategory = character.
- Gaming → main "Gaming", subcategory = game.
- Portrait → main "Portraits".
- Arabic calligraphy / Islamic art → main "Islamic", subcategory = style/artist.
- Photography → main "Photography", subcategory = theme.

If the subcategory does NOT exist yet, set subcategory_id to null and put the name in suggested_subcategory_name.

Description writing rules (80-150 words, natural persuasive tone, no emojis):
- Open by naming the exact subject you see in the image.
- Mention premium FujiFilm Crystal Archive chemical paper print.
- Mention the choice between a High Quality PVC Frame or Wooden Portrait finish.
- Mention fade-resistant colors and professional gallery finish.
- Suggest as wall decor for bedroom, office, gaming room, or gift.

Return JSON with this exact shape:
{
  "title": "clean human-friendly product title, 4-8 words",
  "detected_subject": "exact identified subject name or null",
  "detected_type": "football_player | football_team | movie | tv_series | anime | car | marvel | dc | gaming | quote | portrait | pet_portrait | family_portrait | photography | islamic_art | calligraphy | landscape | abstract | other",
  "detected_text": "all visible text exactly as seen in the image, or null if no text",
  "detected_language": "ar | en | ar_en | other | null",
  "visual_style": "detailed description of the visual style: e.g. 'black and white photography', 'vintage poster', 'modern minimalist', 'oil painting style', 'digital art', 'Arabic calligraphy', 'comic book style', 'realistic portrait'",
  "description": "80-150 word marketing paragraph",
  "seo_title": "SEO title max 60 chars, ending with '| BRWAZWNEON'",
  "seo_description": "SEO meta description 120-160 chars, action-oriented, mention framed poster and Egypt",
  "alt_text": "descriptive alt text for accessibility and Google Images, under 120 chars",
  "slug": "kebab-case url slug, lowercase letters, numbers and dashes only, under 60 chars",
  "badge": "one of: best-seller, new, trending, limited, exclusive — or null",
  "tags": ["10 to 15 short relevant keywords — include detected subject, style, room, gift, BRWAZWNEON"],
  "hashtags": ["3 to 8 hashtags without the # symbol — include subject, style, brand"],
  "category_id": "<id or null>",
  "subcategory_id": "<id or null>",
  "suggested_category_name": "<name or null>",
  "suggested_subcategory_name": "<name or null>",
  "colors": ["2 to 5 dominant colors, lowercase english names"],
  "orientation": "portrait | landscape | square",
  "confidence": 0.0
}
confidence is 0-1 based on how certain you are about the identification.
No markdown, no commentary.`;

    const hints = [
      data.filename ? `Filename: ${data.filename}` : null,
      assignedCategoryName ? `Assigned category: ${assignedCategoryName}` : null,
      assignedSubcategoryName ? `Assigned subcategory: ${assignedSubcategoryName}` : null,
      data.badge ? `Badge: ${data.badge}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const userText = `Analyze this poster image. Identify the subject, read any visible text, and generate complete SEO metadata.\n${hints || ""}`;

    const inline = await urlToInlineData(data.imageUrl);
    if (!inline.mimeType.startsWith("image/")) {
      throw new Error(`Image URL returned non-image content type: ${inline.mimeType}`);
    }

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: userText },
      { inlineData: { mimeType: inline.mimeType, data: inline.data } },
    ];

    const json = await geminiGenerate(GEMINI_TEXT_MODEL, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    });
    const content = extractText(json) ?? "";
    let parsed: Record<string, unknown> = {};
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
    const confRaw =
      typeof parsed.confidence === "number" ? parsed.confidence : Number(parsed.confidence);
    const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : 0.7;
    const slugify = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    const title = String(parsed.title ?? "").slice(0, 120) || (data.filename ?? "Untitled Poster");
    const cleanName = (v: unknown): string | null => {
      if (typeof v !== "string") return null;
      const s = v.trim();
      if (!s || s.length > 80) return null;
      return s;
    };
    const suggestedSub = subId ? null : cleanName(parsed.suggested_subcategory_name);
    const suggestedCat = catId ? null : cleanName(parsed.suggested_category_name);

    const detectedType =
      typeof parsed.detected_type === "string" && parsed.detected_type
        ? String(parsed.detected_type)
        : null;

    const detectedText =
      typeof parsed.detected_text === "string" && parsed.detected_text.trim()
        ? parsed.detected_text.trim().slice(0, 500)
        : null;

    const detectedLang =
      typeof parsed.detected_language === "string" &&
      ["ar", "en", "ar_en", "other"].includes(parsed.detected_language)
        ? parsed.detected_language
        : null;

    const visualStyle =
      typeof parsed.visual_style === "string" && parsed.visual_style.trim()
        ? parsed.visual_style.trim().slice(0, 200)
        : null;

    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags
          .map((h) => String(h).replace(/^#/, "").trim().toLowerCase())
          .filter((h) => h && h.length <= 40)
          .slice(0, 10)
      : [];

    const generatedSeoDescription = String(parsed.seo_description ?? "");

    const validationConflicts = checkCategoryHardBlock(
      assignedCategoryName,
      title,
      generatedSeoDescription,
      Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t)) : [],
      cleanName(parsed.detected_subject),
    );

    const needsReview =
      validationConflicts.length > 0 || confidence < 0.5 || (!!detectedText && !detectedLang);

    return {
      title,
      detected_subject: cleanName(parsed.detected_subject),
      detected_type: detectedType,
      detected_text: detectedText,
      detected_language: detectedLang,
      visual_style: visualStyle,
      description: String(parsed.description ?? "").slice(0, 500),
      seo_title: String(parsed.seo_title ?? "").slice(0, 70),
      seo_description: generatedSeoDescription.slice(0, 160),
      alt_text: String(parsed.alt_text ?? "").slice(0, 160) || title,
      slug: typeof parsed.slug === "string" && parsed.slug ? slugify(parsed.slug) : slugify(title),
      badge,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags
            .map((t) => String(t))
            .filter(Boolean)
            .slice(0, 20)
        : [],
      hashtags,
      category_id: catId,
      subcategory_id: subId,
      suggested_category_name: suggestedCat,
      suggested_subcategory_name: suggestedSub,
      colors,
      orientation,
      confidence,
      product_id: data.productId ?? null,
      needs_review: needsReview,
      validation_conflicts: validationConflicts,
    };
  });
