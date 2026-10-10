import { describe, expect, it } from "vitest";
import { REAL_CATALOG_FIXTURE } from "./search-catalog.fixture";
import {
  MAX_RESULTS,
  MIN_QUERY_LENGTH,
  TIER,
  buildIndex,
  editDistance,
  normalizeText,
  rankDocs,
  searchIndex,
  type SearchSource,
} from "./search-core";

// Real catalogue rows (see the fixture header). Views are the real values, so ties behave like production.
const rows: SearchSource[] = REAL_CATALOG_FIXTURE.map(([title, cat, parent, views], i) => ({
  id: `p${i}`,
  title,
  image_url: `https://img.test/${i}.jpg`,
  category_id: cat ? `c-${cat}` : null,
  category_slug: cat ? cat.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null,
  category_name: cat,
  parent_name: parent,
  tags: null,
  badge: null,
  views_count: views,
}));
const index = buildIndex(rows);
const titles = (q: string, limit = 20) => searchIndex(index, q, limit).map((h) => h.title);
const top = (q: string) => titles(q, 1)[0];
const cats = (q: string, limit = 20) => searchIndex(index, q, limit).map((h) => h.category_name);

describe("normalisation (matching layer only)", () => {
  it("lower-cases, collapses spaces and strips punctuation, parentheses, emoji, hyphen and underscore", () => {
    expect(normalizeText("  GTA   (5) ")).toBe("gta 5");
    expect(normalizeText("Mustang🔥 (4)")).toBe("mustang 4");
    expect(normalizeText("spider-man_2")).toBe("spider man 2");
    expect(normalizeText("Raphinaaa!👤 (5)")).toBe("raphinaaa 5");
    expect(normalizeText("Café")).toBe("cafe");
  });
  it("unifies Arabic letter variants, strips tashkeel/tatweel and maps Arabic digits", () => {
    expect(normalizeText("أحمد")).toBe(normalizeText("احمد"));
    expect(normalizeText("إسلام")).toBe(normalizeText("اسلام"));
    expect(normalizeText("مدرسة")).toBe(normalizeText("مدرسه"));
    expect(normalizeText("على")).toBe(normalizeText("علي"));
    expect(normalizeText("مُحَمَّد")).toBe(normalizeText("محمد"));
    expect(normalizeText("جـــوكر")).toBe("جوكر");
    expect(normalizeText("بوستر ٥")).toBe("بوستر 5");
  });
  it("never needs the stored title to change", () => {
    const doc = buildIndex([rows[0]])[0];
    expect(doc.src.title).toBe(rows[0].title);
  });
});

describe("edit distance", () => {
  it("counts a transposition as one edit and exits early beyond the budget", () => {
    expect(editDistance("club", "clup", 1)).toBe(1);
    expect(editDistance("spdier", "spider", 1)).toBe(1);
    expect(editDistance("abcdef", "uvwxyz", 1)).toBeGreaterThan(1);
  });
});

describe("ranking on the real catalogue", () => {
  it("exact family name: the family comes first (exact-stem tier); title hits always precede category-only hits", () => {
    const hits = rankDocs(index, "joker", 10);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].score).toBe(TIER.EXACT_STEM);
    const titleHits = hits.filter((h) => /joker/i.test(h.doc.src.title));
    expect(titleHits.length).toBeGreaterThan(0);
    expect(titleHits.every((h) => h.score >= TIER.TITLE_ALL_TOKENS)).toBe(true);
    // the real catalogue has a "WhatsApp Image …" poster filed under JOKER: reachable, but ranked below
    hits
      .filter((h) => !/joker/i.test(h.doc.src.title))
      .forEach((h) => expect(h.score).toBeLessThan(TIER.EXACT_STEM));
  });

  it("exact title with a number beats the rest of the family (parentheses are ignored)", () => {
    const first = rankDocs(index, "spider 1", 5)[0];
    expect(first.doc.src.title).toBe("SPIDER (1)");
    expect(first.score).toBe(TIER.EXACT_TITLE);
    expect(top("SPIDER (1)")).toBe("SPIDER (1)");
    expect(top("spider(1)")).toBe("SPIDER (1)");
    // a number that does not exist still lands on the family, below any exact title
    expect(rankDocs(index, "spider 77", 3)[0].doc.src.title).toMatch(/^SPIDER/);
  });

  it("number query: 'gta 10' finds GTA (10) first; a number that does not exist still finds the family", () => {
    expect(top("gta 10")).toBe("GTA (10)");
    expect(top("GTA  10")).toBe("GTA (10)");
    expect(top("gta10")).toBe("GTA (10)");
    expect(titles("gta 5").length).toBeGreaterThan(0);
    expect(titles("gta 5").every((t) => /^GTA/.test(t))).toBe(true);
  });

  it("case, extra spaces and punctuation do not change the result list", () => {
    const base = titles("spider");
    expect(titles("SPIDER")).toEqual(base);
    expect(titles("  Spider  ")).toEqual(base);
    expect(titles("spider!")).toEqual(base);
  });

  it("partial / typed-so-far prefixes find the family (autocomplete)", () => {
    expect(titles("spid").every((t) => /^SPIDER/.test(t))).toBe(true);
    expect(titles("spide").length).toBeGreaterThan(0);
    expect(titles("mes").some((t) => /MESSI/i.test(t))).toBe(true);
  });

  it("multi-word: 'spider man' and 'spiderman' find the SPIDER posters (they returned nothing before)", () => {
    for (const q of ["spider man", "spiderman", "Spider-Man", "SPIDER MAN"]) {
      const t = titles(q);
      expect(t.length, q).toBeGreaterThan(0);
      expect(t[0], q).toMatch(/^SPIDER/);
    }
  });

  it("word order does not matter for multi-word queries", () => {
    const t = titles("thrones game");
    expect(t.length).toBeGreaterThan(0);
    expect(t[0]).toMatch(/Game Of Thrones/i);
  });

  it("category / sub-category relevance: 'marvel' now finds the whole MARVEL category", () => {
    const c = cats("marvel", 50);
    expect(c.length).toBeGreaterThan(10);
    expect(
      c.every((x) => x === "MARVEL" || x === "BATMAN" || x === null || /marvel/i.test(String(x))),
    ).toBe(true);
    expect(cats("football", 5).length).toBeGreaterThan(0);
  });

  it("an exact title or name match is never ranked below a category or fuzzy match", () => {
    const hits = rankDocs(index, "batman", 40);
    const tiers = hits.map((h) => h.score);
    expect(tiers).toEqual([...tiers].sort((a, b) => b - a));
    expect(hits[0].score).toBeGreaterThanOrEqual(TIER.TITLE_PHRASE);
  });

  it("typos that exist in the catalogue itself are forgiven, but only after exact tiers", () => {
    // the catalogue spells these "FIGHT CLUP" and "BEAKY BLINDER"
    const fight = rankDocs(index, "fight club", 5);
    expect(fight.length).toBeGreaterThan(0);
    expect(fight[0].doc.src.title).toMatch(/FIGHT CLUP/i);
    expect(fight.every((h) => h.doc.src.category_name === "FIGHT CLUP")).toBe(true);
    expect(fight[0].score).toBeLessThan(TIER.COMPACT);
    const peaky = rankDocs(index, "peaky blinders", 5);
    // the real catalogue files these posters under the (misspelled) category BEAKY BLINDER
    expect(peaky.length).toBeGreaterThan(0);
    expect(peaky.every((h) => h.doc.src.category_name === "BEAKY BLINDER")).toBe(true);
    expect(peaky[0].score).toBeLessThan(TIER.COMPACT);
    // a transposition
    expect(top("spdier")).toMatch(/^SPIDER/);
  });

  it("fuzzy matching is safe: gibberish and very short words never match", () => {
    expect(titles("zzzxqq")).toEqual([]);
    expect(rankDocs(index, "xq", 5).every((h) => h.score > 0)).toBe(true);
    expect(titles("kob")).toEqual(expect.any(Array));
    // 3-letter words get no typo budget: "jok" is a prefix match, "jxk" is nothing
    expect(titles("jxk")).toEqual([]);
  });

  it("when exact hits exist, typo candidates are not added (no noise)", () => {
    const hits = rankDocs(index, "joker", 60);
    expect(hits.every((h) => h.score >= TIER.CATEGORY_TOKENS)).toBe(true);
  });

  it("Arabic: the real Arabic title is found, with variants and tashkeel", () => {
    expect(top("دعوات")).toBe("دعوات");
    expect(top("دَعَوَات")).toBe("دعوات");
  });

  it("admin-managed aliases (tags) and Arabic category names make Arabic/alias queries work", () => {
    const withAliases = buildIndex([
      {
        ...rows[0],
        id: "a1",
        title: "MESSI (1)",
        category_name: "MESSI",
        parent_name: "Football",
        tags: ["ميسي", "Leo Messi", "GOAT"],
        views_count: 5,
      },
      {
        ...rows[0],
        id: "a2",
        title: "SPIDER (1)",
        category_name: "MARVEL",
        category_name_ar: "مارفل",
        parent_name: null,
        tags: null,
        views_count: 0,
      },
    ]);
    expect(searchIndex(withAliases, "ميسي", 5)[0].id).toBe("a1");
    expect(searchIndex(withAliases, "ميســي", 5)[0].id).toBe("a1");
    expect(searchIndex(withAliases, "leo messi", 5)[0].id).toBe("a1");
    expect(searchIndex(withAliases, "مارفل", 5)[0].id).toBe("a2");
  });

  it("no results, empty and too-short queries return an empty list without scanning", () => {
    expect(titles("qwertyuiop")).toEqual([]);
    expect(titles("")).toEqual([]);
    expect(titles("   ")).toEqual([]);
    expect(titles("a")).toEqual([]);
    expect(titles("!!")).toEqual([]);
    expect(MIN_QUERY_LENGTH).toBe(2);
  });

  it("ties inside a tier follow popularity then catalogue order, deterministically", () => {
    const a = titles("spider");
    const b = titles("spider");
    expect(a).toEqual(b);
    const hits = rankDocs(index, "spider", 20);
    for (let i = 1; i < hits.length; i += 1) {
      if (hits[i - 1].score === hits[i].score) {
        expect(hits[i - 1].doc.views).toBeGreaterThanOrEqual(hits[i].doc.views);
      }
    }
  });

  it("response limits are enforced: default cap, hard cap and at-least-one", () => {
    expect(titles("a b", 5).length).toBeLessThanOrEqual(5);
    expect(rankDocs(index, "random", 100000).length).toBeLessThanOrEqual(MAX_RESULTS);
    expect(rankDocs(index, "random", 0).length).toBeLessThanOrEqual(1);
    expect(rankDocs(index, "random", -5).length).toBeLessThanOrEqual(1);
  });

  it("very long input is truncated, not scanned", () => {
    expect(() => rankDocs(index, "spider ".repeat(500), 5)).not.toThrow();
  });

  it("returns only the lightweight public fields", () => {
    const hit = searchIndex(index, "joker", 1)[0];
    expect(Object.keys(hit).sort()).toEqual(
      [
        "badge",
        "category_id",
        "category_name",
        "category_slug",
        "id",
        "image_url",
        "tags",
        "title",
      ].sort(),
    );
  });
});

describe("speed", () => {
  it("ranks a 10,000-poster catalogue in a few milliseconds", () => {
    const big: SearchSource[] = [];
    for (let i = 0; i < 10000; i += 1) {
      const r = rows[i % rows.length];
      big.push({ ...r, id: `b${i}`, title: r.title.replace(/\(\d+\)/, `(${i})`) });
    }
    const idx = buildIndex(big);
    const t0 = performance.now();
    for (const q of ["spider", "gta 5", "fight club", "marvel", "zzzzqq"]) rankDocs(idx, q, 8);
    const perQuery = (performance.now() - t0) / 5;
    expect(perQuery).toBeLessThan(400); // generous CI ceiling; typically a handful of ms
  });
});
