// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const createSignedUrl = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (...a: unknown[]) => createSignedUrl(bucket, ...a),
      }),
    },
  },
}));

import {
  OrderImageAccessError,
  downloadFileName,
  downloadOriginal,
  imageSourceFromStored,
  previewUrl,
} from "./order-images";

beforeEach(() => {
  createSignedUrl.mockReset();
  document.body.innerHTML = "";
});

describe("imageSourceFromStored", () => {
  it("treats a bare path as a custom-design upload (with catalogue fallback)", () => {
    expect(imageSourceFromStored("a1b2/photo.png")).toEqual({
      kind: "storage",
      candidates: [
        { bucket: "custom-designs", path: "a1b2/photo.png" },
        { bucket: "posters", path: "a1b2/photo.png" },
      ],
    });
  });
  it("recognises stored signed URLs of our buckets", () => {
    const u = "https://x.supabase.co/storage/v1/object/sign/posters-originals/cat/p.jpg?token=abc";
    expect(imageSourceFromStored(u)).toEqual({
      kind: "storage",
      candidates: [{ bucket: "posters-originals", path: "cat/p.jpg" }],
    });
  });
  it("leaves foreign URLs alone and rejects blob/data/empty values", () => {
    expect(imageSourceFromStored("https://cdn.example/x.jpg")).toEqual({
      kind: "external",
      url: "https://cdn.example/x.jpg",
    });
    expect(imageSourceFromStored("blob:http://localhost/1")).toBeNull();
    expect(imageSourceFromStored("data:image/png;base64,AAA")).toBeNull();
    expect(imageSourceFromStored("")).toBeNull();
    expect(imageSourceFromStored(null)).toBeNull();
  });
});

describe("downloadFileName", () => {
  it("keeps the real extension (the old code forced .jpg)", () => {
    expect(
      downloadFileName({
        orderNumber: "BRW-12",
        index: 2,
        title: "My Photo!",
        sourceName: "u/IMG_1.PNG",
      }),
    ).toBe("BRW-12-2-My-Photo.png");
    expect(downloadFileName({ orderNumber: null, index: 1, title: null, sourceName: "u/x" })).toBe(
      "order-1-image.jpg",
    );
  });
  it("supports Arabic titles", () => {
    expect(
      downloadFileName({
        orderNumber: "A1",
        index: 1,
        title: "بوستر ليفربول",
        sourceName: "a.webp",
      }),
    ).toBe("A1-1-بوستر-ليفربول.webp");
  });
});

describe("8. download", () => {
  it("mints a fresh short-lived attachment URL for the ORIGINAL file and clicks it", async () => {
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://s.test/signed?download=1" },
      error: null,
    });
    const clicks: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicks.push(`${this.href}|${this.download}`);
    };
    const src = imageSourceFromStored("uuid-1/original-photo.jpg")!;
    const name = await downloadOriginal(src, { orderNumber: "BRW-1", index: 1, title: "Photo" });
    HTMLAnchorElement.prototype.click = orig;

    expect(name).toBe("BRW-1-1-Photo.jpg");
    const [bucket, path, ttl, opts] = createSignedUrl.mock.calls[0];
    expect(bucket).toBe("custom-designs");
    expect(path).toBe("uuid-1/original-photo.jpg"); // the stored original, not a thumbnail
    expect(ttl).toBeLessThanOrEqual(300); // short-lived, created at click time
    expect(opts.download).toBe("BRW-1-1-Photo.jpg");
    expect(opts.transform).toBeUndefined(); // never a resized rendition
    expect(clicks).toEqual(["https://s.test/signed?download=1|BRW-1-1-Photo.jpg"]);
    expect(document.querySelector("a")).toBeNull(); // cleaned up, no blob: URLs involved
    expect(clicks[0].startsWith("blob:")).toBe(false);
  });

  it("20. an unauthorised user gets an error and no download is triggered", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await expect(
      downloadOriginal(imageSourceFromStored("uuid-1/x.jpg")!, {
        orderNumber: "A",
        index: 1,
        title: "t",
      }),
    ).rejects.toBeInstanceOf(OrderImageAccessError);
    expect(spy).not.toHaveBeenCalled();
    // both candidate buckets were tried, nothing leaked
    expect(createSignedUrl.mock.calls.map((c) => c[0])).toEqual(["custom-designs", "posters"]);
    spy.mockRestore();
  });
});

describe("9. preview", () => {
  it("uses an optimised rendition and keeps the original as fallback", async () => {
    createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: "https://s.test/full" }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: "https://s.test/resized" }, error: null });
    const r = await previewUrl(imageSourceFromStored("u/p.jpg")!);
    expect(r).toEqual({ url: "https://s.test/resized", full: "https://s.test/full" });
    expect(createSignedUrl.mock.calls[1][3].transform.width).toBe(1600);
  });
  it("falls back to the original when resizing is unavailable", async () => {
    createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: "https://s.test/full" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "transformations disabled" } });
    const r = await previewUrl(imageSourceFromStored("u/p.jpg")!);
    expect(r.url).toBe("https://s.test/full");
  });
});

describe("storage security (static check of the migrations)", () => {
  const dir = join(__dirname, "../../supabase/migrations");
  const sql = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");

  it("custom-designs and payment-screenshots can only be READ by admins", () => {
    const selects = sql.match(/CREATE POLICY[^;]+FOR SELECT[^;]+;/gi) ?? [];
    for (const bucket of ["custom-designs", "payment-screenshots"]) {
      const forBucket = selects.filter((s) => s.includes(`'${bucket}'`));
      for (const p of forBucket) {
        expect(p).toMatch(/has_role\(auth\.uid\(\), 'admin'/);
        expect(p).not.toMatch(/TO anon|TO public/i);
      }
    }
  });
  it("anonymous customers may only INSERT into custom-designs", () => {
    const anon = (sql.match(/CREATE POLICY[^;]+ON storage\.objects[^;]+;/gi) ?? []).filter(
      (p) => p.includes("'custom-designs'") && /TO anon/i.test(p),
    );
    expect(anon.length).toBeGreaterThan(0);
    for (const p of anon) expect(p).toMatch(/FOR INSERT/i);
  });
});
