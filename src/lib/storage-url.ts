import { supabase } from "@/integrations/supabase/client";
import type { Variant } from "@/lib/image-pipeline";

// 10 years — buckets are private (workspace blocks public),
// so we store long-lived signed URLs in the DB.
export const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10;

// Inline SVG placeholder shown when an image fails to load.
export const IMAGE_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1a1a1a"/>
          <stop offset="100%" stop-color="#2a2a2a"/>
        </linearGradient>
      </defs>
      <rect width="300" height="400" fill="url(#g)"/>
      <rect x="18" y="18" width="264" height="364" fill="none" stroke="#3a3a3a" stroke-width="2"/>
      <circle cx="150" cy="200" r="34" fill="none" stroke="#444" stroke-width="2"/>
      <path d="M120 240 L145 210 L170 235 L200 195 L230 240" fill="none" stroke="#444" stroke-width="2"/>
    </svg>`,
  );

/** Extract the in-bucket object path from a Supabase storage URL. */
export function extractStoragePath(url: string, bucket: string): string | null {
  if (!url) return null;
  const re = new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?]+)`);
  const m = url.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Create a long-lived signed URL for an object already in the bucket. */
export async function signStoragePath(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) {
    throw error ?? new Error("Failed to sign storage URL");
  }
  return data.signedUrl;
}

/** Upload a file and return a signed URL suitable for storing in the DB. */
export async function uploadAndSign(
  bucket: string,
  path: string,
  file: File,
  opts?: { autoOptimize?: { sourceTable: string; sourceId?: string | null } },
): Promise<string> {
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const signed = await signStoragePath(bucket, path);
  if (opts?.autoOptimize && file.type.startsWith("image/")) {
    // Fire-and-forget — never block the upload flow on variant generation.
    void (async () => {
      try {
        const { generateVariantsFor } = await import("@/lib/image-pipeline");
        await generateVariantsFor({
          sourceTable: opts.autoOptimize!.sourceTable,
          sourceId: opts.autoOptimize!.sourceId ?? null,
          originalUrl: signed,
          bucket,
          file,
        });
      } catch {
        /* logged inside pipeline */
      }
    })();
  }
  return signed;
}

// Re-export to keep type reachable for callers.
export type { Variant };

/**
 * Given an existing URL, return a fresh signed URL.
 * No-op if we can't parse a path (e.g. external CDN URL).
 */
export async function ensureSignedUrl(url: string, bucket: string): Promise<string> {
  const path = extractStoragePath(url, bucket);
  if (!path) return url;
  return signStoragePath(bucket, path);
}
