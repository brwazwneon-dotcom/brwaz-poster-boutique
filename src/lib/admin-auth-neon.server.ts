import { sql } from "@/lib/neon.server";

// Minimal, dependency-free admin auth for a single-admin business site.
// Password hashing: PBKDF2 via Web Crypto (portable across Node and
// Cloudflare Workers — no native bindings like bcrypt would need).
// Session: a signed, expiring token in an httpOnly cookie (HMAC-SHA256,
// also via Web Crypto) — no session table, nothing to garbage-collect.

const PBKDF2_ITERATIONS = 210_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");
  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = fromBase64Url(parts[2]);
  const expected = fromBase64Url(parts[3]);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
      key,
      256,
    ),
  );
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(sig));
}

export async function createSessionToken(adminId: string): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ id: adminId, exp: Date.now() + SESSION_TTL_MS })),
  );
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string | undefined): Promise<{ id: string } | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expectedSig = await hmac(payload);
  if (sig !== expectedSig) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { id: string; exp: number };
    if (Date.now() > data.exp) return null;
    return { id: data.id };
  } catch {
    return null;
  }
}

export async function findAdminByEmail(email: string): Promise<{ id: string; password_hash: string } | null> {
  const rows = await sql()`
    select id, password_hash from admin_users where email = ${email.toLowerCase().trim()} limit 1
  `;
  return (rows[0] as { id: string; password_hash: string }) ?? null;
}

export async function touchAdminLogin(id: string): Promise<void> {
  await sql()`update admin_users set last_login_at = now() where id = ${id}`;
}
