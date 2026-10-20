import { createServerFn } from "@tanstack/react-start";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";
import { deleteStoredImage, listImages, putDataUrl } from "@/lib/blob.server";

// Public object storage for uploaded images: the shop's Vercel Blob store (see blob.server.ts). It replaced Cloudinary,
// whose account was disabled for exceeding its free limits (2026-10-20). The client sends the already-optimized image
// as a data: URL (same convention as photo-ai.functions.ts), so no multipart/form-data route is needed.
export const uploadPosterImage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { dataUrl: string; filename: string })
  .handler(async ({ data }) => {
    const url = await putDataUrl(data.dataUrl, "posters", data.filename, 10 * 1024 * 1024);
    return { url };
  });

// Public: customer-submitted order photos (4x6 printing, photo printing, custom design). No admin auth, because
// checkout is anonymous. Images only, with the same 10 MB cap as the admin upload.
export const uploadCustomerPhoto = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { dataUrl: string; filename: string; folder: string })
  .handler(async ({ data }) => {
    const folder = /^[a-z0-9_-]+$/i.test(data.folder) ? data.folder : "customer-uploads";
    const url = await putDataUrl(data.dataUrl, folder, data.filename, 10 * 1024 * 1024);
    return { url };
  });

// Media Library: lists the images uploaded from the admin (prefix up/posters/), so it also surfaces orphaned uploads
// that no product references. The older backup copies in the store (prefix posters/) are not listed on purpose.
export const listMediaLibraryAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { cursor?: string } | undefined) ?? {})
  .handler(async ({ data }) => {
    const result = await listImages("up/posters/", { cursor: data.cursor, limit: 100 });
    return { blobs: result.blobs, cursor: result.cursor, hasMore: result.hasMore };
  });

export const deleteMediaAssetAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { url: string }).url)
  .handler(async ({ data: url }) => {
    await deleteStoredImage(url);
    return { ok: true };
  });

// Recovers the real image URL for a custom-design order item whose `orders.poster_image` isn't a usable URL (the
// custom-design checkout stores a client-side dedup key "<uuid>/<filename>" instead of the upload result). Looks the
// uploaded file up read-only by the filename/size the order DID keep. Never writes anything.
export const resolveCustomDesignImageAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { filename: string; fileSize?: number | null })
  .handler(async ({ data }) => {
    const safeName = data.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/\.[^.]+$/, "");
    if (!safeName) return { url: null as string | null };
    try {
      const result = await listImages("up/custom-designs/", { limit: 200 });
      const candidates = result.blobs.filter((r) => r.pathname.includes(safeName));
      // Showing the WRONG customer's photo is worse than the placeholder: only resolve when the size also agrees or
      // the filename alone was unambiguous.
      const bySize =
        data.fileSize != null ? candidates.find((r) => r.size === data.fileSize) : undefined;
      const match = bySize ?? (candidates.length === 1 ? candidates[0] : undefined);
      return { url: match?.url ?? null };
    } catch {
      return { url: null as string | null };
    }
  });
