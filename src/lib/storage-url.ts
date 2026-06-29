import { supabase } from "@/integrations/supabase/client";

// 10 years — buckets are private (workspace blocks public),
// so we store long-lived signed URLs in the DB.
export const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10;

// Inline SVG placeholder shown when an image fails to load.
export const IMAGE_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
      <rect width="300" height="400" fill="#111"/>
      <text x="50%" y="50%" fill="#666" font-family="sans-serif" font-size="14"
        text-anchor="middle" dominant-baseline="middle">Image unavailable</text>
    </svg>`,
  );

/** Extract the in-bucket object path from a Supabase storage URL. */
export function extractStoragePath(url: string, bucket: string): string | null {
  if (!url) return null;
  const re = new RegExp(
    `/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?]+)`,
  );
  const m = url.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Create a long-lived signed URL for an object already in the bucket. */
export async function signStoragePath(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL);
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
): Promise<string> {
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  return signStoragePath(bucket, path);
}

/**
 * Given an existing URL, return a fresh signed URL.
 * No-op if we can't parse a path (e.g. external CDN URL).
 */
export async function ensureSignedUrl(
  url: string,
  bucket: string,
): Promise<string> {
  const path = extractStoragePath(url, bucket);
  if (!path) return url;
  return signStoragePath(bucket, path);
}