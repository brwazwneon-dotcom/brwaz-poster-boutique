import { describe, expect, it } from "vitest";
import { aliasTerm, expandSearchText, matchCategories } from "./search-aliases";

const cat = (name: string, slug: string, parent: string | null = null) => ({
  id: slug,
  name,
  slug,
  parent_id: parent,
});
const CATS = [
  cat("MARVEL", "marvel"),
  cat("SPIDER MAN", "spider-man", "marvel"),
  cat("BATMAN", "batman", "marvel"),
  cat("MESSI", "messi", "football"),
  cat("Football", "football"),
  cat("SUPER CARS", "super-cars"),
  cat("FERRARI", "ferrari", "super-cars"),
];

describe("Arabic spellings", () => {
  it("maps Arabic names to the English search text", () => {
    expect(aliasTerm("سبايدر مان")).toBe("spider");
    expect(aliasTerm("سبايدرمان")).toBe("spider");
    expect(aliasTerm("الاهلي")).toBe("al ahly");
    expect(aliasTerm("ميسي")).toBe("messi");
    expect(expandSearchText("فيراري")).toBe("ferrari");
  });
  it("keeps other text as typed and ignores very short input", () => {
    expect(expandSearchText("spiderman")).toBe("spider");
    expect(expandSearchText("hello")).toBe("hello");
    expect(aliasTerm("س")).toBeNull();
  });
});

describe("matchCategories", () => {
  it("finds the sub-collection by English or Arabic, with or without spaces", () => {
    expect(matchCategories("spiderman", CATS)[0]?.slug).toBe("spider-man");
    expect(matchCategories("spider man", CATS)[0]?.slug).toBe("spider-man");
    expect(matchCategories("Spider-Man", CATS)[0]?.slug).toBe("spider-man");
    expect(matchCategories("سبايدر مان", CATS)[0]?.slug).toBe("spider-man");
    expect(matchCategories("ميسي", CATS)[0]?.slug).toBe("messi");
  });
  it("prefers an exact name and a sub-collection over its parent", () => {
    expect(matchCategories("football", CATS)[0]?.slug).toBe("football");
    expect(matchCategories("cars", CATS).map((c) => c.slug)).toContain("super-cars");
  });
  it("returns nothing for unrelated or too-short text, and skips hidden ones", () => {
    expect(matchCategories("zz", CATS)).toEqual([]);
    expect(matchCategories("banana", CATS)).toEqual([]);
    expect(matchCategories("batman", [{ ...cat("BATMAN", "batman"), hidden: true }])).toEqual([]);
  });
});
