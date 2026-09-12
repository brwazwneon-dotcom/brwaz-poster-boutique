import { createServerFn } from "@tanstack/react-start";
import { put, list, del } from "@vercel/blob";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";

// Replaces the old Supabase Storage upload (src/lib/storage-url.ts's
// uploadAndSign, bucket "posters") with Vercel Blob — same role (public
// object storage for poster images), different backend. Client sends the
// already-optimized image as a data: URL (same convention already used
// by photo-ai.functions.ts for photo enhancement), so this function
// never needs a separate multipart/form-data route.
export const uploadPosterImage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { dataUrl: string; filename: string })
  .handler(async ({ data }) => {
    const match = /^data:([^;]+);base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Invalid image data");
    const [, mime, base64] = match;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > 12 * 1024 * 1024) {
      throw new Error("Image too large (max 12MB after optimization)");
    }
    const safeName = data.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `posters/${crypto.randomUUID()}-${safeName}`;
    const blob = await put(path, buffer, {
      access: "public",
      contentType: mime,
      addRandomSuffix: false,
    });
    return { url: blob.url };
  });

// Public — customer-submitted order photos (4x6 printing, photo printing,
// custom design). No admin auth: checkout is anonymous, same as the old
// Supabase Storage buckets these replace ("photo-4x6", "customer-photos",
// "custom-designs" all allowed public inserts). Kept to a stricter size
// cap than the admin upload since these are unmoderated at upload time.
export const uploadCustomerPhoto = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { dataUrl: string; filename: string; folder: string })
  .handler(async ({ data }) => {
    const match = /^data:([^;]+);base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Invalid image data");
    const [, mime, base64] = match;
    if (!mime.startsWith("image/")) throw new Error("Only images are allowed");
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error("Image too large (max 10MB)");
    }
    const folder = /^[a-z0-9_-]+$/i.test(data.folder) ? data.folder : "customer-uploads";
    const safeName = data.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
    const blob = await put(path, buffer, {
      access: "public",
      contentType: mime,
      addRandomSuffix: false,
    });
    return { url: blob.url };
  });

// Media Library — lists every uploaded blob directly from Vercel Blob
// storage (not derived from `posters`), so it also surfaces orphaned
// uploads (drafts abandoned mid-upload, replaced images) that no product
// currently references.
export const listMediaLibraryAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { cursor?: string } | undefined) ?? {})
  .handler(async ({ data }) => {
    const result = await list({ prefix: "posters/", limit: 100, cursor: data.cursor });
    return {
      blobs: result.blobs.map((b) => ({
        url: b.url,
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt.toISOString(),
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });

export const deleteMediaAssetAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { url: string }).url)
  .handler(async ({ data: url }) => {
    await del(url);
    return { ok: true };
  });
