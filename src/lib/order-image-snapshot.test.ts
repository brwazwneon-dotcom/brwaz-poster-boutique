import { describe, expect, it } from "vitest";
import {
  chooseOrderImage,
  isUsableOrderImage,
  posterIdsNeedingImage,
} from "./order-image-snapshot";

const ID = "123e4567-e89b-12d3-a456-426614174000";

describe("order image snapshot", () => {
  it("keeps a usable image the browser sent", () => {
    expect(chooseOrderImage("https://res.cloudinary.com/x/a.jpg", "https://cat/b.jpg")).toBe(
      "https://res.cloudinary.com/x/a.jpg",
    );
  });
  it("falls back to the catalog image for empty / relative / dead values", () => {
    for (const bad of [
      "",
      "/img/a.jpg",
      "data:image/png;base64,AAA",
      "https://x.blob.vercel-storage.com/a.jpg",
      null,
      undefined,
    ]) {
      expect(chooseOrderImage(bad, "https://cat/b.jpg")).toBe("https://cat/b.jpg");
    }
  });
  it("keeps what was sent when there is no catalog image either", () => {
    expect(chooseOrderImage("", null)).toBe("");
    expect(chooseOrderImage("/img/a.jpg", undefined)).toBe("/img/a.jpg");
  });
  it("only looks up posters whose image is unusable and whose id is a uuid", () => {
    const ids = posterIdsNeedingImage([
      { selected_poster: ID, poster_image: "" },
      { selected_poster: ID, poster_image: "/x.jpg" },
      { selected_poster: "custom-abc-0", poster_image: "" },
      { selected_poster: null, poster_image: "" },
      { selected_poster: "223e4567-e89b-12d3-a456-426614174000", poster_image: "https://ok/a.jpg" },
    ]);
    expect(ids).toEqual([ID]);
  });
  it("recognises usable urls", () => {
    expect(isUsableOrderImage("https://a/b.jpg")).toBe(true);
    expect(isUsableOrderImage("http://a/b.jpg")).toBe(true);
    expect(isUsableOrderImage(5)).toBe(false);
  });
});
