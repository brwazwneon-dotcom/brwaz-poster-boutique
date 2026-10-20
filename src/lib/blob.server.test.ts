import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteStoredImage, isBlobUrl, listImages, putDataUrl } from "./blob.server";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("blob storage helpers", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores an image under up/<folder>/ with the right type and returns the public URL", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://abc.public.blob.vercel-storage.com/up/posters/x.png" }),
    });
    const url = await putDataUrl(ONE_PIXEL_PNG, "posters", "My Poster (1).JPG", 1024 * 1024);
    expect(url).toBe("https://abc.public.blob.vercel-storage.com/up/posters/x.png");
    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toMatch(
      /^https:\/\/blob\.vercel-storage\.com\/up\/posters\/[0-9a-f-]{36}-My_Poster__1_\.png$/,
    );
    expect(init.method).toBe("PUT");
    expect(init.headers["x-content-type"]).toBe("image/png");
    expect(init.headers.authorization).toBe("Bearer test-token");
  });

  it("rejects non-images, bad data and oversize files before any network call", async () => {
    await expect(
      putDataUrl("data:text/html;base64,PGI+aGk8L2I+", "posters", "a.html", 1000),
    ).rejects.toThrow("Only images");
    await expect(putDataUrl("not a data url", "posters", "a.png", 1000)).rejects.toThrow(
      "Invalid image data",
    );
    await expect(putDataUrl(ONE_PIXEL_PNG, "posters", "a.png", 10)).rejects.toThrow("too large");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only deletes files that live in our own store", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await deleteStoredImage("https://res.cloudinary.com/x/image/upload/a.jpg");
    await deleteStoredImage("https://brwazwneon-images.vercel.app/p/a.webp");
    expect(fetchMock).not.toHaveBeenCalled();
    await deleteStoredImage("https://abc.public.blob.vercel-storage.com/up/posters/x.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isBlobUrl("https://abc.public.blob.vercel-storage.com/a.png")).toBe(true);
    expect(isBlobUrl("https://evil.example.com/public.blob.vercel-storage.com")).toBe(false);
  });

  it("lists a prefix page by page", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        blobs: [
          { url: "u", pathname: "up/posters/a.png", size: 5, uploadedAt: "2026-10-21", extra: 1 },
        ],
        cursor: "c1",
        hasMore: true,
      }),
    });
    const r = await listImages("up/posters/", { limit: 50 });
    expect(r).toEqual({
      blobs: [{ url: "u", pathname: "up/posters/a.png", size: 5, uploadedAt: "2026-10-21" }],
      cursor: "c1",
      hasMore: true,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("prefix=up%2Fposters%2F");
  });
});
