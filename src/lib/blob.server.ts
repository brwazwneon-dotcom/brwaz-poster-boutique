// Image uploads (admin poster images and customers' photos) are stored in the shop's Vercel Blob store through its
// plain HTTP API (no SDK). Server-only: the token never reaches the browser.
//
// Why this and not Cloudinary: the Cloudinary account was disabled for exceeding its free limits (2026-10-20), so every
// upload and every stored image there is unreachable. The Blob store is free on the Hobby plan, needs no card, and the
// files are public, long-cached URLs on *.public.blob.vercel-storage.com.
//
// New files go under the "up/" prefix. The older poster files that already sit in the store (prefix "posters/") are
// deliberately left out of the Media Library so nobody deletes those backup copies by accident.

const API = "https://blob.vercel-storage.com";
const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/i;

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("Image storage is not configured (BLOB_READ_WRITE_TOKEN)");
  return { authorization: `Bearer ${token}`, "x-api-version": "7", ...extra };
}

export function isBlobUrl(url: string): boolean {
  try {
    return BLOB_HOST.test(new URL(url).host);
  } catch {
    return false;
  }
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/heic": "heic",
};

/** Stores one image and returns its public URL. `pathname` must not start with a slash. */
export async function putImage(
  pathname: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const res = await fetch(`${API}/${pathname.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    headers: authHeaders({
      "x-content-type": contentType,
      "x-add-random-suffix": "0",
      "x-cache-control-max-age": "31536000",
    }),
    body: bytes as unknown as BodyInit,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Image storage rejected the upload (${res.status})`);
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new Error("Image storage returned no URL");
  return json.url;
}

/** Decodes a data: URL (as sent by the browser) and stores it; the file extension follows the real image type. */
export async function putDataUrl(
  dataUrl: string,
  folder: string,
  filename: string,
  maxBytes: number,
): Promise<string> {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data");
  const mime = match[1].toLowerCase();
  if (!mime.startsWith("image/")) throw new Error("Only images are allowed");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > maxBytes)
    throw new Error(`Image too large (max ${Math.round(maxBytes / 1048576)}MB)`);
  const ext = EXT_BY_MIME[mime] ?? "img";
  const safeName =
    filename
      .replace(/[^a-zA-Z0-9.\-_]/g, "_")
      .replace(/\.[^.]+$/, "")
      .slice(0, 80) || "image";
  return putImage(`up/${folder}/${crypto.randomUUID()}-${safeName}.${ext}`, bytes, mime);
}

export type StoredImage = { url: string; pathname: string; size: number; uploadedAt: string };

export async function listImages(
  prefix: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<{ blobs: StoredImage[]; cursor?: string; hasMore: boolean }> {
  const q = new URLSearchParams({ prefix, limit: String(opts.limit ?? 100) });
  if (opts.cursor) q.set("cursor", opts.cursor);
  const res = await fetch(`${API}?${q}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Image storage list failed (${res.status})`);
  const json = (await res.json()) as {
    blobs?: StoredImage[];
    cursor?: string;
    hasMore?: boolean;
  };
  return {
    blobs: (json.blobs ?? []).map((b) => ({
      url: b.url,
      pathname: b.pathname,
      size: b.size,
      uploadedAt: b.uploadedAt,
    })),
    cursor: json.cursor,
    hasMore: Boolean(json.hasMore),
  };
}

/** Deletes a stored image by URL. Only files in our own store are touched; any other URL is ignored. */
export async function deleteStoredImage(url: string): Promise<void> {
  if (!isBlobUrl(url)) return;
  await fetch(`${API}/delete`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ urls: [url] }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => undefined);
}
