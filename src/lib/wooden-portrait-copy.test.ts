import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");
const en = JSON.parse(readFileSync(join(root, "src/lib/locales/en.json"), "utf8"));
const ar = JSON.parse(readFileSync(join(root, "src/lib/locales/ar.json"), "utf8"));
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("Wooden Portrait is described as an unframed wood board everywhere", () => {
  it("Arabic names it a portrait, not a frame", () => {
    expect(ar.product.frame_wood).not.toMatch(/برواز/);
    expect(ar.product.frame_wood).toMatch(/بورتريه/);
  });

  it("product info (EN + AR): imported Spanish wood, no frame, two protective layers", () => {
    expect(en.productInfo.woodIntro).toMatch(/imported Spanish wood/);
    expect(en.productInfo.woodIntro).toMatch(/no frame/i);
    expect(en.productInfo.woodIntro).toMatch(/two protective layers/);
    expect(ar.productInfo.woodIntro).toContain("إسباني مستورد");
    expect(ar.productInfo.woodIntro).toContain("بدون فريم");
    expect(ar.productInfo.woodIntro).toContain("طبقتي حماية");
  });

  it("PVC frame copy mentions the acrylic gloss layer and black/white", () => {
    expect(en.productInfo.pvcIntro).toMatch(/acrylic/);
    expect(en.productInfo.pvcIntro).toMatch(/black or white/);
    expect(ar.productInfo.pvcIntro).toContain("أكريليك");
    expect(ar.productInfo.pvcIntro).toContain("الأسود والأبيض");
  });

  it("comparison cards, SEO text and admin hint no longer call it a frame", () => {
    const cmp = read("src/components/FrameComparison.tsx");
    expect(cmp).toContain("Imported Spanish wood board");
    expect(cmp).toContain("No frame, no color options");
    expect(cmp).not.toContain("No glass");
    expect(read("src/routes/category.$slug.tsx")).not.toMatch(/Wooden Portrait frames/);
    expect(read("src/routes/admin.lazy.tsx")).not.toMatch(/wooden frame mockup/);
  });
});
