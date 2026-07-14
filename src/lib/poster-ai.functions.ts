import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CategoryLite = { id: string; name: string; slug: string; parent_id: string | null };

type MaybeRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};
async function assertAdmin(supabase: unknown, userId: string) {
  const { data, error } = await (supabase as MaybeRpc).rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

type GenInput = {
  imageUrl?: string;
  filename?: string;
  categories: CategoryLite[];
  title?: string;
  categoryName?: string;
  subcategoryName?: string;
  tags?: string[];
  badge?: string | null;
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
  detected_type:
    | "football_player"
    | "football_team"
    | "movie"
    | "tv_series"
    | "anime"
    | "car"
    | "marvel"
    | "dc"
    | "gaming"
    | "quote"
    | "portrait"
    | "pet_portrait"
    | "family_portrait"
    | "other"
    | null;
  colors: string[];
  orientation: "portrait" | "landscape" | "square" | null;
  confidence: number;
};

export const generatePosterMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown): GenInput => {
    const d = data as GenInput;
    if (!d) throw new Error("input required");
    const hasImage = typeof d.imageUrl === "string" && d.imageUrl.length > 0;
    const hasText =
      (typeof d.title === "string" && d.title.trim().length > 0) ||
      (typeof d.filename === "string" && d.filename.trim().length > 0) ||
      (typeof d.categoryName === "string" && d.categoryName.trim().length > 0);
    if (!hasImage && !hasText) {
      throw new Error(
        "Cannot generate SEO because this poster has no title, filename, or category.",
      );
    }
    return {
      imageUrl: hasImage ? d.imageUrl : undefined,
      filename: typeof d.filename === "string" ? d.filename : undefined,
      categories: Array.isArray(d.categories) ? d.categories : [],
      title: typeof d.title === "string" ? d.title : undefined,
      categoryName: typeof d.categoryName === "string" ? d.categoryName : undefined,
      subcategoryName: typeof d.subcategoryName === "string" ? d.subcategoryName : undefined,
      tags: Array.isArray(d.tags) ? d.tags.map((t) => String(t)).filter(Boolean) : undefined,
      badge: typeof d.badge === "string" ? d.badge : null,
    };
  })
  .handler(async ({ data, context }): Promise<GeneratedPosterMeta> => {
    // AI generation is an admin-only operation.
    await assertAdmin(context.supabase, context.userId);
    const { geminiGenerate, urlToInlineData, extractText, GEMINI_TEXT_MODEL, getGeminiKey } = await import(
      "@/lib/gemini.server"
    );
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

    const hasImage = !!data.imageUrl;
    const modeLine = hasImage
      ? "Analyze the poster image and return JSON only."
      : "The image is not available yet — generate SEO from the text hints below and return JSON only.";
    const system = `You are an e-commerce SEO copywriter AND a visual recognition expert for BRWAZWNEON, a premium framed-poster store in Egypt selling Football, Movies, TV Series, Marvel & DC, Anime, Cars, Gaming, Portraits, Photography and Quotes posters. ${modeLine}

VISUAL RECOGNITION — identify the exact subject. Do NOT stop at generic labels like "football player" — name the actual person, team, movie, anime, car, etc.

Common subjects (non-exhaustive — always try to name the exact one you see):
- Football players: Lionel Messi, Cristiano Ronaldo, Mohamed Salah, Lamine Yamal, Pedri, Kylian Mbappe, Neymar, Vinicius Jr, Jude Bellingham, Erling Haaland, Robert Lewandowski, Luka Modric, Diego Maradona, Ronaldinho, Zinedine Zidane, Ronaldo Nazario, Kaka, Iniesta, Xavi, Sergio Ramos, Kevin De Bruyne, Harry Kane, Son Heung-min.
- Football clubs / national teams: Barcelona, Real Madrid, Liverpool, Manchester City, Manchester United, Arsenal, Chelsea, Tottenham, Juventus, Inter Milan, AC Milan, Napoli, PSG, Bayern Munich, Borussia Dortmund, Al Ahly, Zamalek, Egypt, Argentina, Brazil, Portugal, France, Germany, Morocco.
- Movies / series: Breaking Bad, Money Heist, The Dark Knight, John Wick, Harry Potter, Lord of the Rings, Fight Club, Interstellar, Oppenheimer, Scarface, The Godfather, Pulp Fiction, Inception, The Matrix, Joker, Avengers, Spider-Man, Batman, Deadpool, Iron Man, Star Wars, Dune, Peaky Blinders, Vikings, Game of Thrones, Stranger Things, La Casa de Papel.
- Anime: Naruto, One Piece, Dragon Ball, Attack on Titan, Bleach, Death Note, Jujutsu Kaisen, Chainsaw Man, Demon Slayer, Solo Leveling, My Hero Academia, Tokyo Revengers, Hunter x Hunter, Berserk, Spy x Family, Vinland Saga.
- Cars: Porsche 911, BMW M4, Mercedes AMG, Audi RS, Ferrari, Lamborghini, McLaren, Bugatti, Ford Mustang, Nissan GTR / Skyline, Toyota Supra, Tesla, Dodge Charger, Chevrolet Camaro.
- Marvel / DC: Iron Man, Spider-Man, Thor, Hulk, Captain America, Doctor Strange, Wolverine, Deadpool, Batman, Superman, Joker, Harley Quinn, Wonder Woman, Flash.
- Gaming: FIFA, Call of Duty, GTA, Fortnite, League of Legends, Valorant, Minecraft, Elden Ring, Cyberpunk 2077, PlayStation, Xbox.

Categories available (use the exact id after the # for category_id / subcategory_id, or null if none match):
${catList || "(none)"}

CATEGORY MAPPING RULES — CRITICAL:
- Football player or club → main "Football", subcategory = player/club name.
- Movie/TV → main "Movies" or "TV Series", subcategory = title.
- Anime → main "Anime", subcategory = title.
- Car → main "Cars", subcategory = brand or model.
- Marvel / DC → main "Marvel & DC" (or closest), subcategory = character.
- Gaming → main "Gaming", subcategory = game title.
- Portrait → main "Portraits".
If the parent category exists above, set category_id to its id. If the subcategory (player, team, movie, anime, car…) exists under it, set subcategory_id to its id. If the subcategory does NOT exist yet, leave subcategory_id null and put the exact clean name in "suggested_subcategory_name" (e.g. "Pedri", "Lamine Yamal", "Attack on Titan", "Porsche 911"). If the main category does not exist, put its name in "suggested_category_name".

Description writing rules (80-150 words, natural persuasive tone, no emojis, no hype words like "amazing"):
- Open by naming the exact subject you see in the image (player, movie, character, car model, etc.)
- Mention premium print quality on FujiFilm Crystal Archive chemical paper
- Mention the choice between a High Quality PVC Frame or a Wooden Portrait finish
- Mention long-lasting, fade-resistant colors and a professional gallery finish
- Suggest it as perfect wall decor for bedroom, office, gaming room, or a gift

Return JSON with this exact shape:
{
  "title": "clean human-friendly product title, 4-8 words, e.g. 'Lionel Messi World Cup Poster'",
  "detected_subject": "exact name of the person / team / movie / anime / car in the image, or null",
  "detected_type": "football_player | football_team | movie | tv_series | anime | car | marvel | dc | gaming | quote | portrait | pet_portrait | family_portrait | other",
  "description": "80-150 word marketing paragraph following the rules above",
  "seo_title": "SEO title max 60 chars, ending with '| BRWAZWNEON'",
  "seo_description": "SEO meta description max 155 chars, action-oriented, mention framed poster + Egypt / cash on delivery when it fits",
  "alt_text": "descriptive alt text for accessibility and Google Images, under 120 chars",
  "slug": "kebab-case url slug, lowercase letters, numbers and dashes only, under 60 chars",
  "badge": "one of: best-seller, new, trending, limited, exclusive — or null if none clearly applies",
  "tags": ["10 to 20 short relevant keywords/tags — ALWAYS include the detected subject, related club/franchise, style, room, gift, BRWAZWNEON"],
  "category_id": "<id or null>",
  "subcategory_id": "<id or null>",
  "suggested_category_name": "<name or null — only if the main category needs to be created>",
  "suggested_subcategory_name": "<name or null — the exact subject name to create under the detected parent>",
  "colors": ["2 to 5 dominant colors as lowercase english names, e.g. black, white, red, gold"],
  "orientation": "portrait | landscape | square",
  "confidence": 0.0
}
confidence is a number between 0 and 1 reflecting how confident you are that the subject, category and metadata are correct.
No markdown, no commentary.`;

    const hints = [
      data.title ? `Title: ${data.title}` : null,
      data.filename ? `Filename: ${data.filename}` : null,
      data.categoryName ? `Category: ${data.categoryName}` : null,
      data.subcategoryName ? `Subcategory: ${data.subcategoryName}` : null,
      data.tags?.length ? `Existing tags: ${data.tags.join(", ")}` : null,
      data.badge ? `Badge: ${data.badge}` : null,
    ].filter(Boolean).join("\n");
    const userText = hasImage
      ? `Identify the subject of this poster image and generate the metadata.\n${hints || `Filename hint: ${data.filename ?? "(none)"}`}`
      : `Generate the metadata for this poster using ONLY these text hints (no image yet).\n${hints || "(no hints provided)"}`;

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: userText },
    ];
    if (hasImage) {
      try {
        const inline = await urlToInlineData(data.imageUrl!);
        parts.push({ inlineData: { mimeType: inline.mimeType, data: inline.data } });
      } catch {
        // image not fetchable yet — fall back to text-only silently.
      }
    }
    const json = await geminiGenerate(GEMINI_TEXT_MODEL, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    });
    const content = extractText(json) ?? "";
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
    const allowedTypes = new Set([
      "football_player","football_team","movie","tv_series","anime","car",
      "marvel","dc","gaming","quote","portrait","pet_portrait","family_portrait","other",
    ]);
    const detectedType =
      typeof parsed.detected_type === "string" && allowedTypes.has(parsed.detected_type)
        ? (parsed.detected_type as GeneratedPosterMeta["detected_type"])
        : null;
    const cleanName = (v: unknown): string | null => {
      if (typeof v !== "string") return null;
      const s = v.trim();
      if (!s || s.length > 80) return null;
      return s;
    };
    const suggestedSub = subId ? null : cleanName(parsed.suggested_subcategory_name);
    const suggestedCat = catId ? null : cleanName(parsed.suggested_category_name);

    return {
      title,
      detected_subject: cleanName(parsed.detected_subject),
      detected_type: detectedType,
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
      suggested_category_name: suggestedCat,
      suggested_subcategory_name: suggestedSub,
      colors,
      orientation,
      confidence,
    };
  });