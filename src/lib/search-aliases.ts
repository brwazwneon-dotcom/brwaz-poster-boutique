// Search helpers that work from the category list already loaded in the browser (no extra request):
//  - Arabic spellings of the shop's collections, so "سبايدر مان", "ميسي" or "فيراري" find the same
//    posters as their English names (poster titles and tags are English only);
//  - matching a typed word to the collections / sub-collections it names, so the search box can show
//    a button that opens that collection's own page (/category/<slug>), a link that can be shared.

import { normalizeText } from "@/lib/search-core";

type CategoryLike = {
  id: string;
  name: string;
  slug: string;
  name_ar?: string | null;
  parent_id: string | null;
  hidden?: boolean;
  status?: "published" | "draft";
  show_in_search?: boolean;
};

/** [Arabic spellings, English search text]. Spellings are matched after Arabic letter folding. */
const ALIASES: Array<[string[], string]> = [
  [
    ["سبايدر مان", "سبايدرمان", "سبيدر مان", "سبايدر", "الرجل العنكبوت", "spiderman", "spider man"],
    "spider",
  ],
  [["مارفل", "مارفيل"], "marvel"],
  [["باتمان", "بات مان"], "batman"],
  [["جوكر", "الجوكر"], "joker"],
  [["انمي", "أنمي"], "anime"],
  [["هجوم العمالقة", "اتاك اون تايتان"], "attack on titan"],
  [["دراجون بول", "دراغون بول"], "dragon ball"],
  [["ناروتو"], "naruto"],
  [["كرة قدم", "كورة", "فوتبول"], "football"],
  [["الاهلي", "اهلي"], "al ahly"],
  [["الزمالك", "زمالك"], "zamalek"],
  [["ارسنال", "أرسنال"], "arsenal"],
  [["برشلونة", "برشلونه"], "barcelona"],
  [["ريال مدريد", "ريال"], "real madrid"],
  [["يوفنتوس", "يوفي"], "juventus"],
  [["مانشستر يونايتد", "مان يونايتد"], "manchester united"],
  [["رونالدو", "كريستيانو", "كريستيانو رونالدو", "سي ار 7"], "cristiano ronaldo"],
  [["رونالدينيو"], "ronaldinho"],
  [["ميسي", "ليونيل ميسي"], "messi"],
  [["نيمار"], "neymar"],
  [["هالاند", "هالند"], "haaland"],
  [["لامين يامال", "يامال"], "lamine yamal"],
  [["صلاح", "محمد صلاح", "مو صلاح"], "salah"],
  [["زيدان"], "zidane"],
  [["بيدري"], "pedri"],
  [["رافينيا"], "raphinha"],
  [["دوري ابطال اوروبا", "دوري الابطال"], "champions league"],
  [["العاب", "ألعاب", "جيمز"], "games"],
  [["بلايستيشن", "بلاي ستيشن"], "ps4"],
  [["جتا", "جي تي ايه", "جي تا"], "gta"],
  [["اسلامي", "إسلامي", "اسلاميات"], "islamic"],
  [["اقتباسات", "كلمات", "عبارات"], "quotes"],
  [["افلام", "أفلام", "فيلم"], "movies"],
  [["مسلسلات", "مسلسل"], "series"],
  [["بريكينج باد", "بريكنج باد"], "breaking bad"],
  [["صراع العروش", "جيم اوف ثرونز"], "game of thrones"],
  [["بيت الورق", "لا كاسا دي بابيل"], "casa de papel"],
  [["لوسيفر"], "lucifer"],
  [["ناركوس"], "narcos"],
  [["بريزون بريك"], "prison break"],
  [["بيكي بلايندرز", "بيكي بلاندرز"], "peaky blinders"],
  [["هاري بوتر"], "harry potter"],
  [["انسبشن"], "inception"],
  [["انترستيلار", "إنترستيلار"], "interstellar"],
  [["اوبنهايمر", "أوبنهايمر"], "oppenheimer"],
  [["شيرلوك"], "sherlock"],
  [["فايت كلوب", "نادي القتال"], "fight"],
  [["الاب الروحي", "العراب", "جودفاذر"], "god father"],
  [["ماتريكس", "الماتريكس"], "matrix"],
  [["تايتانيك"], "titanic"],
  [["سيد الخواتم", "لورد اوف ذا رينجز"], "lord of the rings"],
  [["فايكنج", "فايكينج"], "viking"],
  [["ديكستر"], "dexter"],
  [["فريندز", "فرندز"], "friends"],
  [["سيارات", "عربيات", "عربيه"], "super cars"],
  [["فيراري", "فراري"], "ferrari"],
  [["مرسيدس"], "mercedes"],
  [["بي ام دبليو", "بي ام"], "bmw"],
  [["اودي", "أودي"], "audi"],
  [["بورش", "بورشه"], "porsche"],
  [["مكلارين", "ماكلارين"], "mclaren"],
  [["موستانج", "موستنج", "مستانج"], "mustang"],
  [["بوجاتي"], "bugatti"],
  [["للبنات", "بنات", "هدية للبنات", "لها"], "for her"],
  [["دول", "دول العالم", "بلاد"], "countries"],
];

/** Letters folded and spaces removed, with the Arabic "ال" prefix dropped from every word. */
export function compactKey(s: string): string {
  return normalizeText(s)
    .split(" ")
    .map((w) => (w.length > 3 ? w.replace(/^ال/, "") : w))
    .join("");
}

const ALIAS_INDEX = ALIASES.flatMap(([spellings, term]) =>
  spellings.map((s) => ({ key: compactKey(s), term })),
).filter((a) => a.key.length >= 2);

/** English search text for an Arabic spelling (exact, or the start of one while typing); else null. */
export function aliasTerm(query: string): string | null {
  const key = compactKey(query);
  if (key.length < 2) return null;
  const exact = ALIAS_INDEX.find((a) => a.key === key);
  if (exact) return exact.term;
  // While typing an Arabic spelling ("سبايد"), the start of it is enough; English text is never guessed.
  if (key.length >= 3 && /[؀-ۿ]/.test(key)) {
    return ALIAS_INDEX.find((a) => a.key.startsWith(key))?.term ?? null;
  }
  return null;
}

/** What to send to the poster search: the English text for a known Arabic spelling, else the text itself. */
export function expandSearchText(query: string): string {
  return aliasTerm(query) ?? query;
}

function isShown(c: CategoryLike): boolean {
  return !c.hidden && c.status !== "draft" && c.show_in_search !== false;
}

/**
 * Collections and sub-collections the typed text names, best first (at most `limit`).
 * An exact name beats a name that starts with the text, which beats one that contains it;
 * a sub-collection wins a tie against its parent.
 */
export function matchCategories<T extends CategoryLike>(
  query: string,
  categories: T[],
  limit = 3,
): T[] {
  const expanded = compactKey(expandSearchText(query));
  const typed = compactKey(query);
  const keys = [...new Set([expanded, typed])].filter((k) => k.length >= 3);
  if (keys.length === 0) return [];
  const scored: Array<{ c: T; score: number }> = [];
  for (const c of categories) {
    if (!isShown(c)) continue;
    const names = [c.name, c.name_ar ?? "", c.slug.replace(/-/g, " ")]
      .map(compactKey)
      .filter((n) => n.length >= 3);
    let best = 0;
    for (const k of keys) {
      for (const n of names) {
        if (n === k) best = Math.max(best, 300);
        else if (n.startsWith(k)) best = Math.max(best, 200);
        else if (n.includes(k)) best = Math.max(best, 100);
        else if (k.length >= 5 && k.includes(n) && n.length >= 5) best = Math.max(best, 50);
      }
    }
    if (best > 0) scored.push({ c, score: best + (c.parent_id ? 5 : 0) });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((x) => x.c);
}
