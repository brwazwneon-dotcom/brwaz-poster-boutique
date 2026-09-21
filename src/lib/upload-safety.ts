// Helpers that keep admin image uploads from failing on their own.
//
// Uploads go through server functions, and the hosting platform rejects any
// request body above ~4.5 MB. An image goes over the wire as a base64 data
// URL (one third bigger than the file), so a file above ~3 MB fails with a
// "payload too large" error before our own code even runs. Big originals
// (e.g. a 3543×4724 PNG) hit this, and so did the largest resized variants.

/** Largest raw file we send in one request (≈ 4 MB once base64-encoded). */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Retries a flaky call (network hiccup, rate limit, cold start) with a short back-off. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt * attempt));
      }
    }
  }
  throw lastError;
}

/** Runs `fn` over `items` with at most `limit` in flight at a time, keeping order. */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Returns `file` unchanged when it is small enough, otherwise a JPEG copy at
 * the same pixel size and the highest quality that fits (shrinking the pixel
 * size only as a last resort). Used for the archival "original" upload.
 */
export async function fitImageForUpload(
  file: File,
  maxBytes: number = MAX_UPLOAD_BYTES,
): Promise<File> {
  if (file.size <= maxBytes || !file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  const base = file.name.replace(/\.[^.]+$/, "");
  try {
    for (const scale of [1, 0.85, 0.7, 0.55]) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.92, 0.85, 0.78, 0.7]) {
        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
        );
        if (blob && blob.size <= maxBytes) {
          return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
        }
      }
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error("Image is too large to upload even after compression");
}
