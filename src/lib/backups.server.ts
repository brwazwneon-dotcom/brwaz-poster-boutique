// Server-only helpers for the backup system.
// Handles snapshotting, AES-256-GCM encryption, and storage upload.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const BACKUP_TABLES = [
  "categories",
  "posters",
  "poster_images",
  "orders",
  "photo_orders",
  "custom_design_orders",
  "reviews",
  "best_sellers",
  "sets",
  "highlights",
  "hero_banners",
  "slider_images",
  "site_settings",
  "before_after",
  "wishlists",
  "user_roles",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type SnapshotPayload = {
  meta: {
    version: 1;
    created_at: string;
    project: string;
    tables: BackupTable[];
  };
  data: Record<BackupTable, unknown[]>;
  storage_manifest: Record<string, { file_count: number; total_bytes: number }>;
};

function getAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server not configured for backups");
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function buildSnapshot(): Promise<SnapshotPayload> {
  const admin = getAdmin();
  const data = {} as Record<BackupTable, unknown[]>;
  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = [];
    const pageSize = 1000;
    let from = 0;
    // paginate to safely cover large tables
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: page, error } = await admin
        .from(table)
        .select("*")
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Snapshot failed on ${table}: ${error.message}`);
      if (!page || page.length === 0) break;
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    data[table] = rows;
  }

  // Manifest of upload buckets (counts + total bytes; not the files themselves)
  const manifest: Record<string, { file_count: number; total_bytes: number }> = {};
  const buckets = [
    "posters",
    "posters-originals",
    "customer-photos",
    "custom-designs",
    "payment-screenshots",
    "slider",
    "categories",
    "reviews",
  ];
  for (const b of buckets) {
    try {
      // storage.objects aggregate — we use the RPC below via authenticated fn.
      // Here, count via SDK listing is unreliable for nested folders, so we
      // record a best-effort top-level count; the RPC path fills in exact data.
      const { data: files } = await admin.storage.from(b).list("", { limit: 1000 });
      manifest[b] = {
        file_count: files?.length ?? 0,
        total_bytes:
          files?.reduce(
            (a, f) => a + Number((f as { metadata?: { size?: number } }).metadata?.size ?? 0),
            0,
          ) ?? 0,
      };
    } catch {
      manifest[b] = { file_count: 0, total_bytes: 0 };
    }
  }

  return {
    meta: {
      version: 1,
      created_at: new Date().toISOString(),
      project: "BRWAZWNEON",
      tables: [...BACKUP_TABLES],
    },
    data,
    storage_manifest: manifest,
  };
}

// ----- Encryption (AES-256-GCM using Web Crypto) -----

async function deriveKey(): Promise<CryptoKey> {
  const secret = process.env.BACKUP_ENCRYPTION_KEY;
  if (!secret) throw new Error("BACKUP_ENCRYPTION_KEY not configured");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function encryptJson(payload: unknown): Promise<{ blob: Uint8Array; checksum: string }> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  const checksumBuf = await crypto.subtle.digest("SHA-256", plaintext);
  const checksum = toBase64(new Uint8Array(checksumBuf));
  // Envelope: JSON with version, iv, ciphertext
  const envelope = JSON.stringify({
    v: 1,
    alg: "AES-256-GCM",
    iv: toBase64(iv),
    ct: toBase64(cipher),
  });
  return { blob: new TextEncoder().encode(envelope), checksum };
}

export async function decryptJson<T = unknown>(blob: ArrayBuffer): Promise<T> {
  const text = new TextDecoder().decode(blob);
  const parsed = JSON.parse(text) as { iv: string; ct: string };
  const key = await deriveKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(parsed.iv) },
    key,
    fromBase64(parsed.ct),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export async function uploadBackupBlob(
  path: string,
  blob: Uint8Array,
): Promise<void> {
  const admin = getAdmin();
  const { error } = await admin.storage
    .from("backups")
    .upload(path, blob, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (error) throw new Error(error.message);
}

export async function deleteBackupBlob(path: string): Promise<void> {
  const admin = getAdmin();
  await admin.storage.from("backups").remove([path]);
}

export async function downloadBackupBlob(path: string): Promise<ArrayBuffer> {
  const admin = getAdmin();
  const { data, error } = await admin.storage.from("backups").download(path);
  if (error || !data) throw new Error(error?.message || "Download failed");
  return await data.arrayBuffer();
}

export async function signBackupUrl(path: string, ttl = 600): Promise<string> {
  const admin = getAdmin();
  const { data, error } = await admin.storage
    .from("backups")
    .createSignedUrl(path, ttl, { download: true });
  if (error || !data?.signedUrl) throw new Error(error?.message || "Sign failed");
  return data.signedUrl;
}