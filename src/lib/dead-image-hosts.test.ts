import { describe, expect, it } from "vitest";
import { isDeadImageUrl } from "./dead-image-hosts";
import { parsePhotoPrintingMediaConfig } from "./use-settings";

const DEAD = "https://res.cloudinary.com/abc/image/upload/v1/posters/x.jpg";
const LIVE = "https://brwazwneon-images.vercel.app/p/x-1000.webp";

describe("isDeadImageUrl", () => {
  it("flags the disabled Cloudinary account only", () => {
    expect(isDeadImageUrl(DEAD)).toBe(true);
    expect(isDeadImageUrl(LIVE)).toBe(false);
    expect(isDeadImageUrl("")).toBe(false);
    expect(isDeadImageUrl(null)).toBe(false);
  });
});

describe("photo printing media for the storefront", () => {
  const raw = {
    banners: [
      { id: "a", desktopImageUrl: DEAD, mobileImageUrl: "" },
      { id: "b", desktopImageUrl: DEAD, mobileImageUrl: LIVE },
    ],
    images: [
      { id: "i1", imageUrl: DEAD },
      { id: "i2", imageUrl: LIVE },
    ],
    materialsImage: { imageUrl: DEAD, altText: "x" },
  };

  it("drops dead pictures for customers", () => {
    const c = parsePhotoPrintingMediaConfig(raw, { forStorefront: true });
    expect(c.banners.map((b) => b.id)).toEqual(["b"]);
    expect(c.banners[0].desktopImageUrl).toBe("");
    expect(c.images.map((i) => i.id)).toEqual(["i2"]);
    expect(c.materialsImage).toBeNull();
  });

  it("keeps them in the admin so they can be replaced", () => {
    const c = parsePhotoPrintingMediaConfig(raw);
    expect(c.banners).toHaveLength(2);
    expect(c.images).toHaveLength(2);
    expect(c.materialsImage?.imageUrl).toBe(DEAD);
  });
});
