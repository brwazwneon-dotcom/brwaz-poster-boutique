import { createServerFn } from "@tanstack/react-start";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";
import { cloudinary, deleteCloudinaryAsset } from "@/lib/cloudinary.server";

// Public object storage for poster images. Was Vercel Blob (before that,
// Supabase Storage — src/lib/storage-url.ts's uploadAndSign) until the
// Vercel Blob store's Hobby-plan billing went inactive and started 403ing
// every image on the storefront with no way to pay it off on Hobby. Now
// Cloudinary, whose free plan needs no card on file. Client sends the
// already-optimized image as a data: URL (same convention already used by
// photo-ai.functions.ts), so this never needs a multipart/form-data route
// — Cloudinary's upload API accepts a data: URI directly as `file`.
export const uploadPosterImage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { dataUrl: string; filename: string })
  .handler(async ({ data }) => {
    const match = /^data:([^;]+);base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Invalid image data");
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error("Image too large (max 10MB after optimization)");
    }
    const safeName = data.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/\.[^.]+$/, "");
    const publicId = `posters/${crypto.randomUUID()}-${safeName}`;
    const result = await cloudinary.uploader.upload(data.dataUrl, {
      public_id: publicId,
      resource_type: "image",
      overwrite: false,
    });
    return { url: result.secure_url };
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
    const safeName = data.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/\.[^.]+$/, "");
    const publicId = `${folder}/${crypto.randomUUID()}-${safeName}`;
    const result = await cloudinary.uploader.upload(data.dataUrl, {
      public_id: publicId,
      resource_type: "image",
      overwrite: false,
    });
    return { url: result.secure_url };
  });

// Media Library — lists uploaded assets directly from Cloudinary (not
// derived from `posters`), so it also surfaces orphaned uploads (drafts
// abandoned mid-upload, replaced images) that no product currently
// references.
export const listMediaLibraryAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { cursor?: string } | undefined) ?? {})
  .handler(async ({ data }) => {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: "posters/",
      max_results: 100,
      next_cursor: data.cursor,
    });
    return {
      blobs: result.resources.map(
        (r: { secure_url: string; public_id: string; bytes: number; created_at: string }) => ({
          url: r.secure_url,
          pathname: r.public_id,
          size: r.bytes,
          uploadedAt: r.created_at,
        }),
      ),
      cursor: result.next_cursor as string | undefined,
      hasMore: Boolean(result.next_cursor),
    };
  });

export const deleteMediaAssetAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { url: string }).url)
  .handler(async ({ data: url }) => {
    await deleteCloudinaryAsset(url);
    return { ok: true };
  });
