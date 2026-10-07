// Poster search: normalisation + ranking. Pure (no I/O), server-side only in practice
// (the browser never receives the catalog; it only gets the ranked top N).
//
// Why this exists: the old search was `title ILIKE '%q%'` (plus tags, which are empty).
// It could not match "spider man"/"spiderman" against "SPIDER (3)", ignored category and
// sub-category names ("marvel" found 1 of 59 MARVEL posters), treated "gta 5" and "GTA (5)"
// as different, and had no tolerance for the typos that exist in the catalogue itself
// ("FIGHT CLUP", "BEAKY BLINDER"). 42% of real customer searches returned nothing.
//
// Normalisation only affects matching/ranking. Stored titles are never modified.

export type SearchSource = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  category_name_ar?: string | null;
  parent_name?: string | null;
  parent_name_ar?: string | null;
  tags: string[] | null;
  badge: string | null;
  views_count?: number | null;
};

export type SearchHit = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  tags: string[] | null;
  badge: string | null;
};

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 80;
export const MAX_RESULTS = 120;

/**
 * Lower-case, strip diacritics/marks (Latin accents AND Arabic tashkeel), unify Arabic
 * letter variants, map Arabic-Indic digits, and turn every run of punctuation, symbols
 * and emoji into one space. "Mustang🔥 (4)" -> "mustang 4", "GTA_5" -> "gta 5".
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // accents, tashkeel, hamza/madda marks (أ إ آ ؤ ئ -> ا ا ا و ي)
    .toLowerCase()
    .replace(/ـ/g, "") // tatweel
    .replace(/[ى]/g, "ي") // ى -> ي
    .replace(/[ة]/g, "ه") // ة -> ه
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // ٠-٩
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // ۰-۹
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens that carry no meaning on their own (never enough to match by themselves). */
const STOPWORDS = new Set([
  "the",
  "of",
  "and",
  "a",
  "an",
  "in",
  "to",
  "for",
  "el",
  "al",
  "la",
  "de",
  "من",
  "في",
  "ال",
]);

export type SearchDoc = {
  src: SearchSource;
  title: string; // normalised
  stem: string; // normalised title without a trailing "(n)" number
  tokens: string[];
  compact: string; // title without spaces
  category: string[]; // normalised category + parent names (and Arabic names)
  categoryTokens: string[];
  aliases: string[]; // normalised tags (admin-managed aliases such as "CR7", "رونالدو")
  views: number;
  order: number; // original position, keeps the sort deterministic
};

export function buildDoc(src: SearchSource, order: number): SearchDoc {
  const title = normalizeText(src.title);
  const stem = title.replace(/\s+\d+$/, "");
  const tokens = title.split(" ").filter(Boolean);
  const category = [src.category_name, src.category_name_ar, src.parent_name, src.parent_name_ar]
    .filter((x): x is string => !!x)
    .map(normalizeText)
    .filter(Boolean);
  const categoryTokens = Array.from(new Set(category.flatMap((c) => c.split(" "))));
  const aliases = (src.tags ?? []).map(normalizeText).filter(Boolean);
  return {
    src,
    title,
    stem,
    tokens,
    compact: title.replace(/ /g, ""),
    category,
    categoryTokens,
    aliases,
    views: Number(src.views_count ?? 0) || 0,
    order,
  };
}

export function buildIndex(rows: SearchSource[]): SearchDoc[] {
  return rows.map((r, i) => buildDoc(r, i));
}

/** Damerau-Levenshtein distance with an early exit once it exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2.splice(0, prev2.length, ...prev);
    prev = cur;
  }
  return prev[b.length];
}

/** How far a token may be from a catalogue word and still count as a typo. */
export function typoBudget(token: string): number {
  if (token.length < 4 || /^\d+$/.test(token)) return 0;
  return token.length >= 8 ? 2 : 1;
}

/** Tier scores. Anything fuzzy or partial stays strictly below every exact tier. */
export const TIER = {
  EXACT_TITLE: 1000,
  EXACT_STEM: 950,
  TITLE_PREFIX: 900,
  TITLE_PHRASE: 800,
  TITLE_ALL_TOKENS: 700,
  COMPACT: 650,
  ALIAS: 600,
  CATEGORY_EXACT: 520,
  CATEGORY_PHRASE: 500,
  CATEGORY_TOKENS: 480,
  DECOMPOUND: 450,
  PARTIAL: 300,
  FUZZY: 250,
} as const;

/** Is `q` (token list, last one may be a typed prefix) matched word-by-word at the start of `t`? */
function startsWithTokens(t: string[], q: string[]): boolean {
  if (q.length > t.length) return false;
  for (let i = 0; i < q.length; i += 1) {
    const last = i === q.length - 1;
    if (last ? !t[i].startsWith(q[i]) : t[i] !== q[i]) return false;
  }
  return true;
}

function containsPhrase(t: string[], q: string[]): boolean {
  for (let s = 0; s + q.length <= t.length; s += 1) {
    let ok = true;
    for (let i = 0; i < q.length; i += 1) {
      const last = i === q.length - 1;
      const w = t[s + i];
      if (last ? !w.startsWith(q[i]) : w !== q[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function tokenMatches(token: string, words: string[], isLast: boolean): boolean {
  return words.some((w) => w === token || (isLast && token.length >= 2 && w.startsWith(token)));
}

export type Scored = { doc: SearchDoc; score: number };

function scoreStrict(doc: SearchDoc, qn: string, qt: string[], qc: string): number {
  // title
  if (doc.title === qn) return TIER.EXACT_TITLE;
  if (doc.stem === qn) return TIER.EXACT_STEM;
  if (startsWithTokens(doc.tokens, qt)) return TIER.TITLE_PREFIX;
  if (containsPhrase(doc.tokens, qt)) return TIER.TITLE_PHRASE;
  if (qt.every((t, i) => tokenMatches(t, doc.tokens, i === qt.length - 1)))
    return TIER.TITLE_ALL_TOKENS;
  if (qc.length >= 4 && doc.compact.includes(qc)) return TIER.COMPACT;
  // aliases (tags)
  if (
    doc.aliases.some(
      (a) => a === qn || startsWithTokens(a.split(" "), qt) || containsPhrase(a.split(" "), qt),
    )
  ) {
    return TIER.ALIAS;
  }
  // category / sub-category
  if (doc.category.some((c) => c === qn)) return TIER.CATEGORY_EXACT;
  if (doc.category.some((c) => containsPhrase(c.split(" "), qt))) return TIER.CATEGORY_PHRASE;
  if (qt.every((t, i) => tokenMatches(t, doc.categoryTokens, i === qt.length - 1)))
    return TIER.CATEGORY_TOKENS;
  return 0;
}

/** "spiderman" -> a title/category word ("spider", 4+ chars) is a prefix of the whole query. */
function scoreDecompound(doc: SearchDoc, qt: string[], qc: string): number {
  if (qt.length !== 1 || qc.length < 6) return 0; // only for one run-together word
  const words = [...doc.tokens, ...doc.categoryTokens];
  return words.some((w) => w.length >= 4 && w.length < qc.length && qc.startsWith(w))
    ? TIER.DECOMPOUND
    : 0;
}

/**
 * Some (not all) query words match, ignoring stop-words and very short words. Only allowed
 * when every word that did NOT match is a number, a short filler word (<= 3 letters, e.g. the
 * "man" in "spider man") or a stop-word. A long unmatched word means the visitor asked for
 * something specific the catalogue does not have ("real madrid" must not return a McLaren
 * called "Real Super Car"); typo tolerance handles the near-misses instead.
 */
function scorePartial(doc: SearchDoc, qt: string[]): number {
  if (qt.length < 2) return 0;
  const words = [...doc.tokens, ...doc.categoryTokens, ...doc.aliases.flatMap((a) => a.split(" "))];
  let matched = 0;
  for (let i = 0; i < qt.length; i += 1) {
    const t = qt[i];
    if (t.length < 3 || STOPWORDS.has(t)) continue;
    if (tokenMatches(t, words, i === qt.length - 1)) matched += 1;
    else if (t.length >= 4 && !/^\d+$/.test(t)) return 0;
  }
  return matched > 0 ? TIER.PARTIAL + Math.round((50 * matched) / qt.length) : 0;
}

/** Every word is matched exactly, by prefix, or within the typo budget (at least one by typo). */
function scoreFuzzy(doc: SearchDoc, qt: string[]): number {
  const words = [...doc.tokens, ...doc.categoryTokens];
  let worst = 0;
  let usedTypo = false;
  for (let i = 0; i < qt.length; i += 1) {
    const t = qt[i];
    if (tokenMatches(t, words, i === qt.length - 1)) continue;
    const budget = typoBudget(t);
    if (budget === 0) return 0;
    let best = budget + 1;
    for (const w of words) {
      if (Math.abs(w.length - t.length) > budget) continue;
      const d = editDistance(t, w, budget);
      if (d < best) best = d;
      if (best === 1) break;
    }
    if (best > budget) return 0;
    usedTypo = true;
    worst = Math.max(worst, best);
  }
  return usedTypo ? TIER.FUZZY - 20 * (worst - 1) : 0;
}

/** Order inside a tier: more viewed first, then catalogue order ("SPIDER (1)" before "(2)"). */
function compareScored(a: Scored, b: Scored): number {
  return b.score - a.score || b.doc.views - a.doc.views || a.doc.order - b.doc.order;
}

export function rankDocs(index: SearchDoc[], rawQuery: string, limit: number): Scored[] {
  const qn = normalizeText(rawQuery.slice(0, MAX_QUERY_LENGTH));
  if (qn.length < MIN_QUERY_LENGTH) return [];
  const cap = Math.max(1, Math.min(MAX_RESULTS, Math.floor(limit) || 1));
  const qt = qn.split(" ");
  const qc = qn.replace(/ /g, "");

  const scored: Scored[] = [];
  for (const doc of index) {
    let score = scoreStrict(doc, qn, qt, qc);
    if (!score) score = scoreDecompound(doc, qt, qc);
    if (!score) score = scorePartial(doc, qt);
    if (score) scored.push({ doc, score });
  }

  // Typo tolerance only when the strong tiers found little: it never competes with exact hits.
  const strong = scored.filter((s) => s.score >= TIER.DECOMPOUND).length;
  if (strong < 3) {
    const have = new Set(scored.map((s) => s.doc.src.id));
    for (const doc of index) {
      if (have.has(doc.src.id)) continue;
      const score = scoreFuzzy(doc, qt);
      if (score) scored.push({ doc, score });
    }
  }
  scored.sort(compareScored);
  return scored.slice(0, cap);
}

export function toHit(src: SearchSource): SearchHit {
  return {
    id: src.id,
    title: src.title,
    image_url: src.image_url,
    category_id: src.category_id,
    category_slug: src.category_slug,
    category_name: src.category_name,
    tags: src.tags,
    badge: src.badge,
  };
}

export function searchIndex(index: SearchDoc[], rawQuery: string, limit: number): SearchHit[] {
  return rankDocs(index, rawQuery, limit).map((s) => toHit(s.doc.src));
}
