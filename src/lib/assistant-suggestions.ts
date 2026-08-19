// Suggestions catalog for the AI-style poster assistant.
// Bilingual (EN + AR). Each item carries a canonical English query
// (used for searching posters) plus display labels.

export type AssistantCategory =
  "football" | "movies" | "tv-series" | "anime" | "cars" | "music" | "custom" | "family" | "quotes";

export type Suggestion = {
  /** English query used to search the posters DB */
  q: string;
  /** Display label (English) */
  label: string;
  /** Optional Arabic display label */
  labelAr?: string;
  /** Extra search aliases (matched during autocomplete) */
  aliases?: string[];
  category: AssistantCategory;
};

export const CATEGORY_CHIPS: {
  key: AssistantCategory;
  label: string;
  labelAr: string;
  emoji: string;
}[] = [
  { key: "football", label: "Football Players", labelAr: "لاعبين كورة", emoji: "⚽" },
  { key: "movies", label: "Movies", labelAr: "أفلام", emoji: "🎬" },
  { key: "tv-series", label: "TV Series", labelAr: "مسلسلات", emoji: "📺" },
  { key: "anime", label: "Anime", labelAr: "أنمي", emoji: "🎌" },
  { key: "cars", label: "Cars", labelAr: "عربيات", emoji: "🚗" },
  { key: "music", label: "Rap / Music", labelAr: "موسيقى", emoji: "🎤" },
  { key: "custom", label: "Custom Design", labelAr: "تصميم مخصص", emoji: "✨" },
  { key: "family", label: "Family Photos", labelAr: "صور عائلية", emoji: "🖼️" },
  { key: "quotes", label: "Motivational Quotes", labelAr: "اقتباسات", emoji: "💬" },
];

export const SUGGESTIONS: Suggestion[] = [
  // Football
  {
    q: "Cristiano Ronaldo",
    label: "Cristiano Ronaldo",
    labelAr: "كريستيانو رونالدو",
    aliases: ["cr7", "كريستيانو", "رونالدو"],
    category: "football",
  },
  { q: "CR7", label: "CR7", aliases: ["cristiano"], category: "football" },
  {
    q: "Messi",
    label: "Lionel Messi",
    labelAr: "ميسي",
    aliases: ["messi", "ميسي", "leo messi"],
    category: "football",
  },
  {
    q: "Mohamed Salah",
    label: "Mohamed Salah",
    labelAr: "محمد صلاح",
    aliases: ["salah", "محمد صلاح", "صلاح"],
    category: "football",
  },
  { q: "Neymar", label: "Neymar", labelAr: "نيمار", category: "football" },
  { q: "Mbappe", label: "Mbappé", labelAr: "مبابي", category: "football" },
  { q: "Haaland", label: "Haaland", labelAr: "هالاند", category: "football" },
  { q: "Ronaldinho", label: "Ronaldinho", labelAr: "رونالدينيو", category: "football" },
  { q: "Zidane", label: "Zinedine Zidane", labelAr: "زيدان", category: "football" },
  { q: "Ramos", label: "Sergio Ramos", labelAr: "راموس", category: "football" },
  { q: "Real Madrid", label: "Real Madrid", labelAr: "ريال مدريد", category: "football" },
  { q: "Barcelona", label: "Barcelona", labelAr: "برشلونة", category: "football" },
  {
    q: "Manchester United",
    label: "Manchester United",
    labelAr: "مانشستر يونايتد",
    category: "football",
  },
  { q: "Liverpool", label: "Liverpool", labelAr: "ليفربول", category: "football" },

  // Movies
  { q: "Batman", label: "Batman", labelAr: "باتمان", category: "movies" },
  { q: "Joker", label: "Joker", labelAr: "جوكر", category: "movies" },
  { q: "John Wick", label: "John Wick", category: "movies" },
  { q: "Fight Club", label: "Fight Club", category: "movies" },
  { q: "Interstellar", label: "Interstellar", category: "movies" },
  { q: "Godfather", label: "The Godfather", labelAr: "الأب الروحي", category: "movies" },
  { q: "Scarface", label: "Scarface", category: "movies" },
  { q: "Marvel", label: "Marvel", category: "movies" },
  { q: "DC", label: "DC", category: "movies" },
  { q: "Spider Man", label: "Spider-Man", labelAr: "سبايدر مان", category: "movies" },
  { q: "Iron Man", label: "Iron Man", labelAr: "آيرون مان", category: "movies" },
  { q: "Captain America", label: "Captain America", labelAr: "كابتن أمريكا", category: "movies" },

  // TV
  { q: "Peaky Blinders", label: "Peaky Blinders", category: "tv-series" },
  { q: "Breaking Bad", label: "Breaking Bad", category: "tv-series" },

  // Anime
  { q: "Naruto", label: "Naruto", labelAr: "ناروتو", category: "anime" },
  { q: "One Piece", label: "One Piece", category: "anime" },
  { q: "Luffy", label: "Luffy", labelAr: "لوفي", category: "anime" },
  { q: "Zoro", label: "Zoro", category: "anime" },
  { q: "Attack on Titan", label: "Attack on Titan", category: "anime" },
  { q: "Demon Slayer", label: "Demon Slayer", category: "anime" },
  { q: "Gojo", label: "Gojo", category: "anime" },
  { q: "Dragon Ball", label: "Dragon Ball", category: "anime" },
  { q: "Goku", label: "Goku", category: "anime" },

  // Cars
  { q: "BMW", label: "BMW", labelAr: "بي إم دبليو", aliases: ["بي ام"], category: "cars" },
  { q: "Mercedes", label: "Mercedes", labelAr: "مرسيدس", category: "cars" },
  { q: "Porsche", label: "Porsche", category: "cars" },
  { q: "Ferrari", label: "Ferrari", category: "cars" },
  { q: "Lamborghini", label: "Lamborghini", category: "cars" },
  { q: "Nissan GTR", label: "Nissan GTR", category: "cars" },
  { q: "Supra", label: "Toyota Supra", category: "cars" },
  { q: "Mustang", label: "Ford Mustang", category: "cars" },
  { q: "Range Rover", label: "Range Rover", category: "cars" },

  // Music
  { q: "Eminem", label: "Eminem", category: "music" },
  { q: "Travis Scott", label: "Travis Scott", category: "music" },
  { q: "Drake", label: "Drake", category: "music" },
  { q: "The Weeknd", label: "The Weeknd", category: "music" },
  { q: "Kanye West", label: "Kanye West", category: "music" },
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // strip Arabic diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchSuggestions(input: string, limit = 8): Suggestion[] {
  const q = norm(input);
  if (!q) return [];
  const scored: { s: Suggestion; score: number }[] = [];
  for (const s of SUGGESTIONS) {
    const haystacks = [s.label, s.labelAr ?? "", s.q, ...(s.aliases ?? [])]
      .map(norm)
      .filter(Boolean);
    let score = 0;
    for (const h of haystacks) {
      if (h === q) {
        score = Math.max(score, 100);
        continue;
      }
      if (h.startsWith(q)) {
        score = Math.max(score, 80);
        continue;
      }
      if (h.includes(q)) {
        score = Math.max(score, 50);
      }
    }
    if (score > 0) scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.s);
}
