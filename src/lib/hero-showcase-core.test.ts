import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildShowcase,
  dayNumber,
  pickDaily,
  shopDay,
  showcaseCandidates,
  showcaseSrcSet,
  smallVariant,
  SHOWCASE_COUNT,
  SHOWCASE_POOL,
  type BestSellerRowLike,
} from "./hero-showcase-core";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Best Sellers rows the way the shop's query returns them: already in its order (pins first, then sales)
const row = (n: number, extra: Partial<NonNullable<BestSellerRowLike["posters"]>> = {}) => ({
  posters: {
    id: uuid(n),
    title: `Poster ${n}`,
    image_url: `https://img.example/p/${uuid(n)}-1000.webp`,
    hidden: false,
    ...extra,
  },
});
const rows = (count: number) => Array.from({ length: count }, (_, i) => row(i + 1));
const ids = (list: Array<{ id: string }>) => list.map((x) => x.id);

describe("the shop's day", () => {
  it("changes at midnight in Cairo, not in UTC", () => {
    // Cairo is UTC+2 in winter: 22:30 UTC on 4 Nov is already 00:30 on 5 Nov there
    expect(shopDay(new Date("2026-11-04T21:30:00Z"))).toBe("2026-11-04");
    expect(shopDay(new Date("2026-11-04T22:30:00Z"))).toBe("2026-11-05");
    expect(shopDay(new Date("2026-11-05T12:00:00Z"))).toBe("2026-11-05");
  });

  it("day numbers step by one across month and year ends", () => {
    expect(dayNumber("2026-11-05") - dayNumber("2026-11-04")).toBe(1);
    expect(dayNumber("2026-12-31") + 1).toBe(dayNumber("2027-01-01"));
    expect(dayNumber("2028-02-28") + 2).toBe(dayNumber("2028-03-01")); // leap year
  });
});

describe("pickDaily: four of the top Best Sellers, a different four each day", () => {
  const top = rows(30);

  it("takes four", () => {
    expect(pickDaily(top, "2026-11-05")).toHaveLength(SHOWCASE_COUNT);
  });

  it("everything chosen is from the top of the list (the pool), never from further down", () => {
    for (let d = 0; d < 40; d++) {
      const day = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10);
      const chosen = pickDaily(top, day);
      const pool = new Set(ids(top.slice(0, SHOWCASE_POOL).map((r) => ({ id: r.posters.id }))));
      for (const r of chosen) expect(pool.has(r.posters.id)).toBe(true);
    }
  });

  it("the same day always gives the same four (a reload, another visitor, another server)", () => {
    const a = pickDaily(top, "2026-11-05");
    const b = pickDaily([...top], "2026-11-05");
    expect(ids(a.map((r) => r.posters))).toEqual(ids(b.map((r) => r.posters)));
  });

  it("the next day gives a different four", () => {
    const today = ids(pickDaily(top, "2026-11-05").map((r) => r.posters));
    const tomorrow = ids(pickDaily(top, "2026-11-06").map((r) => r.posters));
    expect(tomorrow).not.toEqual(today);
    // and with a pool of twelve, consecutive days do not even share a product
    expect(tomorrow.filter((id) => today.includes(id))).toHaveLength(0);
  });

  it("no two days in a row repeat, over a long run, whatever the pool size above four", () => {
    for (const size of [5, 6, 7, 8, 9, 10, 11, 12, 30]) {
      const list = rows(size);
      let previous = ids(pickDaily(list, "2026-01-01").map((r) => r.posters)).join();
      for (let d = 1; d < 60; d++) {
        const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
        const now = ids(pickDaily(list, day).map((r) => r.posters)).join();
        expect(now).not.toBe(previous);
        previous = now;
      }
    }
  });

  it("every product in the pool gets its turn", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 12; d++) {
      const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      for (const r of pickDaily(top, day)) seen.add(r.posters.id);
    }
    expect(seen.size).toBe(SHOWCASE_POOL);
  });

  it("four or fewer to choose from: shows them all, in the shop's order", () => {
    expect(ids(pickDaily(rows(3), "2026-11-05").map((r) => r.posters))).toEqual(
      ids(rows(3).map((r) => r.posters)),
    );
    expect(pickDaily([], "2026-11-05")).toEqual([]);
  });
});

describe("only usable products take part", () => {
  it("skips hidden ones and ones without a real picture", () => {
    const mixed = [
      row(1),
      row(2, { hidden: true }),
      row(3, { image_url: null }),
      row(4, { image_url: "" }),
      row(5, { image_url: "/relative.webp" }),
      { posters: null },
      row(6),
    ];
    expect(ids(showcaseCandidates(mixed))).toEqual([uuid(1), uuid(6)]);
  });

  it("keeps the shop's order (the Best Sellers list is already ranked)", () => {
    expect(ids(showcaseCandidates(rows(5)))).toEqual(rows(5).map((r) => r.posters.id));
  });

  it("carries only id, title and pictures: no sales numbers, nothing about customers", () => {
    const noisy = [
      {
        posters: {
          ...row(1).posters,
          sales_count: 999,
          views_count: 5,
          customer: "Mona",
        } as never,
      },
    ];
    const [item] = showcaseCandidates(noisy);
    expect(Object.keys(item).sort()).toEqual(["id", "image", "small", "title"]);
  });
});

describe("pictures", () => {
  it("builds the 480 sibling of an image-host picture, and nothing for other hosts", () => {
    expect(smallVariant(`https://img.example/p/${uuid(1)}-1000.webp`)).toBe(
      `https://img.example/p/${uuid(1)}-480.webp`,
    );
    expect(smallVariant("https://cdn.example/other/picture.jpg")).toBeNull();
  });

  it("offers a srcset only when both files exist", () => {
    const [withSmall] = showcaseCandidates(rows(1));
    expect(showcaseSrcSet(withSmall)).toContain("480w");
    expect(showcaseSrcSet(withSmall)).toContain("1000w");
    const [other] = showcaseCandidates([row(1, { image_url: "https://cdn.example/x.jpg" })]);
    expect(showcaseSrcSet(other)).toBeUndefined();
  });
});

describe("buildShowcase with a test clock", () => {
  afterEach(() => vi.useRealTimers());

  it("is stable within a shop day and changes with the next one", () => {
    vi.useFakeTimers();
    const list = rows(30);
    vi.setSystemTime(new Date("2026-11-05T06:00:00Z"));
    const morning = buildShowcase(list, new Date());
    vi.setSystemTime(new Date("2026-11-05T17:00:00Z"));
    const evening = buildShowcase(list, new Date());
    expect(ids(evening.items)).toEqual(ids(morning.items));
    expect(evening.day).toBe(morning.day);

    vi.setSystemTime(new Date("2026-11-06T06:00:00Z"));
    const nextDay = buildShowcase(list, new Date());
    expect(nextDay.day).not.toBe(morning.day);
    expect(ids(nextDay.items)).not.toEqual(ids(morning.items));
  });

  it("every chosen product comes from the Best Sellers rows it was given", () => {
    const list = rows(20);
    const given = new Set(list.map((r) => r.posters.id));
    for (let d = 0; d < 20; d++) {
      const { items } = buildShowcase(list, new Date(Date.UTC(2026, 10, 1 + d, 12)));
      for (const item of items) expect(given.has(item.id)).toBe(true);
    }
  });
});

describe("the server function reuses the existing Best Sellers query", () => {
  const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

  it("is built on fetchBestSellersFromDb, with no new query, table or migration", () => {
    const fn = read("lib/db-public.functions.ts");
    const body = fn.slice(fn.indexOf("export const getHeroShowcasePublic"));
    expect(body.slice(0, 400)).toContain(
      "buildShowcase(await fetchBestSellersFromDb(), new Date())",
    );
    const code = read("lib/hero-showcase-core.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/\bsql\b|from posters|order_items|\borders\b/i);
  });

  it("sample data is not used anywhere in the hero path", () => {
    for (const file of [
      "lib/hero-showcase-core.ts",
      "lib/hero-showcase.ts",
      "components/HeroFrameConcept.tsx",
    ]) {
      expect(read(file)).not.toMatch(/sample-reviews|buildSampleReviews|faker/i);
    }
  });
});
