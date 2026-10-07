/**
 * Resolving, previewing and downloading the images attached to an order.
 *
 * - Stored values (`orders.poster_image`, `order_posters.poster_image`) are
 *   either a permanent storage path ("<uuid>/<file>", custom-designs bucket)
 *   or a stored URL for catalogue posters. Neither is a temporary browser URL.
 * - Signed URLs are minted on demand, per click, from the admin's own session.
 *   Storage RLS only lets admins read the private buckets, so a non-admin
 *   cannot obtain a URL (see order-images.test.ts). Nothing long-lived is
 *   created here, and no URL survives a page reload — it is rebuilt each time.
 */
import { supabase } from "@/integrations/supabase/client";
import { extractStoragePath } from "@/lib/storage-url";

export type StorageRef = { bucket: string; path: string };
export type ImageSource =
  { kind: "storage"; candidates: StorageRef[] } | { kind: "external"; url: string };

/** Buckets that may hold an order image, best (original) quality first. */
const URL_BUCKETS = ["custom-designs", "posters-originals", "posters"] as const;

export function imageSourceFromStored(val: string | null | undefined): ImageSource | null {
  const v = (val ?? "").trim();
  if (!v || v.startsWith("blob:")) return null;
  if (/^https?:\/\//i.test(v)) {
    for (const bucket of URL_BUCKETS) {
      const path = extractStoragePath(v, bucket);
      if (path) return { kind: "storage", candidates: [{ bucket, path }] };
    }
    return { kind: "external", url: v };
  }
  if (v.startsWith("data:")) return null;
  // Bare storage path. Customer uploads live in custom-designs; fall back to
  // the catalogue bucket for older rows.
  return {
    kind: "storage",
    candidates: [
      { bucket: "custom-designs", path: v },
      { bucket: "posters", path: v },
    ],
  };
}

export class OrderImageAccessError extends Error {
  constructor(message = "Not authorized to access this image") {
    super(message);
    this.name = "OrderImageAccessError";
  }
}

type SignOpts = {
  ttl: number;
  download?: string | boolean;
  transform?: { width: number; quality?: number };
};

async function signFirst(
  src: ImageSource,
  opts: SignOpts,
): Promise<{ url: string; ref?: StorageRef }> {
  if (src.kind === "external") return { url: src.url };
  let lastErr: unknown = null;
  for (const ref of src.candidates) {
    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, opts.ttl, {
        download: opts.download,
        transform: opts.transform
          ? {
              width: opts.transform.width,
              quality: opts.transform.quality ?? 80,
              resize: "contain",
            }
          : undefined,
      });
    if (!error && data?.signedUrl) return { url: data.signedUrl, ref };
    lastErr = error;
  }
  throw new OrderImageAccessError(
    lastErr instanceof Error ? lastErr.message : "Could not sign image URL",
  );
}

const SHORT_TTL = 60 * 60; // 1 h: enough for a review session, never "forever"

/** Small URL for thumbnails (server-side resized when image transforms exist). */
export async function thumbnailUrl(src: ImageSource): Promise<{ url: string; full: string }> {
  const full = await signFirst(src, { ttl: SHORT_TTL });
  if (src.kind === "external") return { url: full.url, full: full.url };
  try {
    const t = await signFirst(
      { kind: "storage", candidates: [full.ref!] },
      {
        ttl: SHORT_TTL,
        transform: { width: 480, quality: 70 },
      },
    );
    return { url: t.url, full: full.url };
  } catch {
    return { url: full.url, full: full.url };
  }
}

/**
 * URL for the lightbox: an optimized (≤1600 px) rendition when the storage
 * layer can resize, otherwise the original. `full` is always the original.
 */
export async function previewUrl(src: ImageSource): Promise<{ url: string; full: string }> {
  const full = await signFirst(src, { ttl: SHORT_TTL });
  if (src.kind === "external") return { url: full.url, full: full.url };
  try {
    const t = await signFirst(
      { kind: "storage", candidates: [full.ref!] },
      {
        ttl: SHORT_TTL,
        transform: { width: 1600, quality: 85 },
      },
    );
    return { url: t.url, full: full.url };
  } catch {
    return { url: full.url, full: full.url };
  }
}

export function extensionOf(pathOrUrl: string, fallback = "jpg"): string {
  const clean = pathOrUrl.split("?")[0].split("#")[0];
  const m = clean.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : fallback;
}

export function downloadFileName(opts: {
  orderNumber: string | null | undefined;
  index: number;
  title: string | null | undefined;
  sourceName: string;
}): string {
  const slug =
    (opts.title ?? "image")
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image";
  const ref = (opts.orderNumber ?? "order").replace(/[^A-Za-z0-9_-]/g, "");
  return `${ref}-${opts.index}-${slug}.${extensionOf(opts.sourceName)}`;
}

/**
 * Download the ORIGINAL stored file (never the thumbnail, never a blob URL).
 * A fresh short-lived signed URL carrying `Content-Disposition: attachment`
 * is minted at click time, so this keeps working after reloads and re-login.
 */
export async function downloadOriginal(
  src: ImageSource,
  name: { orderNumber: string | null | undefined; index: number; title: string | null | undefined },
): Promise<string> {
  const sourceName = src.kind === "storage" ? src.candidates[0].path : src.url;
  const filename = downloadFileName({ ...name, sourceName });
  const { url } = await signFirst(src, { ttl: 120, download: filename });
  if (src.kind === "external") {
    // Cross-origin URLs ignore the `download` attribute, so fetch the bytes.
    try {
      const blob = await (await fetch(url)).blob();
      const blobUrl = URL.createObjectURL(blob);
      triggerDownload(blobUrl, filename);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
      return filename;
    } catch {
      window.open(url, "_blank", "noopener");
      return filename;
    }
  }
  triggerDownload(url, filename);
  return filename;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
