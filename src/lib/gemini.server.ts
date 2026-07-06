// Server-only Gemini API helper.
// Reads GEMINI_API_KEY from environment. Never import from client code.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

export type GeminiKeyStatus = {
  label: string;
  masked: string;
  present: boolean;
  state: "available" | "rate_limited" | "failed" | "unknown";
  lastUsedAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  rateLimitedUntil: number | null;
};

type KeyEntry = {
  label: string;
  value: string;
  masked: string;
  state: "available" | "rate_limited" | "failed" | "unknown";
  lastUsedAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  rateLimitedUntil: number | null;
};

const RATE_LIMIT_COOLDOWN_MS = 60_000;

function mask(value: string): string {
  if (!value) return "";
  const tail = value.slice(-4);
  return `****${tail}`;
}

let KEYS: KeyEntry[] | null = null;

function loadKeys(): KeyEntry[] {
  if (KEYS) return KEYS;
  const labels = [
    "GEMINI_API_KEY_1",
    "GEMINI_API_KEY_2",
    "GEMINI_API_KEY_3",
    "GEMINI_API_KEY_4",
    "GEMINI_API_KEY_5",
  ];
  const seen = new Set<string>();
  const out: KeyEntry[] = [];
  for (const label of labels) {
    const v = process.env[label];
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push({
        label,
        value: v,
        masked: mask(v),
        state: "available",
        lastUsedAt: null,
        lastErrorAt: null,
        lastError: null,
        rateLimitedUntil: null,
      });
    }
  }
  // Backward-compatible fallback
  const legacy = process.env.GEMINI_API_KEY;
  if (legacy && !seen.has(legacy)) {
    out.push({
      label: "GEMINI_API_KEY",
      value: legacy,
      masked: mask(legacy),
      state: "available",
      lastUsedAt: null,
      lastErrorAt: null,
      lastError: null,
      rateLimitedUntil: null,
    });
  }
  KEYS = out;
  return KEYS;
}

function availableKeys(): KeyEntry[] {
  const now = Date.now();
  return loadKeys().filter((k) => {
    if (k.rateLimitedUntil && k.rateLimitedUntil > now) return false;
    return true;
  });
}

/** Legacy — returns true if at least one Gemini key is configured. */
export function getGeminiKey(): string | null {
  const keys = loadKeys();
  return keys.length > 0 ? keys[0].value : null;
}

export function getGeminiKeysStatus(): GeminiKeyStatus[] {
  const labels = [
    "GEMINI_API_KEY_1",
    "GEMINI_API_KEY_2",
    "GEMINI_API_KEY_3",
    "GEMINI_API_KEY_4",
    "GEMINI_API_KEY_5",
  ];
  const loaded = loadKeys();
  const byLabel = new Map(loaded.map((k) => [k.label, k]));
  const now = Date.now();
  const rows: GeminiKeyStatus[] = labels.map((label) => {
    const k = byLabel.get(label);
    if (!k) {
      return {
        label,
        masked: "",
        present: false,
        state: "unknown",
        lastUsedAt: null,
        lastErrorAt: null,
        lastError: null,
        rateLimitedUntil: null,
      };
    }
    const state: GeminiKeyStatus["state"] =
      k.rateLimitedUntil && k.rateLimitedUntil > now ? "rate_limited" : k.state;
    return {
      label: k.label,
      masked: k.masked,
      present: true,
      state,
      lastUsedAt: k.lastUsedAt,
      lastErrorAt: k.lastErrorAt,
      lastError: k.lastError,
      rateLimitedUntil: k.rateLimitedUntil,
    };
  });
  // Append any legacy GEMINI_API_KEY if present and not already listed
  const legacy = byLabel.get("GEMINI_API_KEY");
  if (legacy) {
    rows.push({
      label: legacy.label,
      masked: legacy.masked,
      present: true,
      state:
        legacy.rateLimitedUntil && legacy.rateLimitedUntil > now
          ? "rate_limited"
          : legacy.state,
      lastUsedAt: legacy.lastUsedAt,
      lastErrorAt: legacy.lastErrorAt,
      lastError: legacy.lastError,
      rateLimitedUntil: legacy.rateLimitedUntil,
    });
  }
  return rows;
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type GeminiContent = { role?: "user" | "model"; parts: GeminiPart[] };

export type GeminiRequest = {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig?: {
    temperature?: number;
    topP?: number;
    responseMimeType?: string;
    responseModalities?: string[];
  };
};

export type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isQuotaError(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  const t = bodyText.toLowerCase();
  return (
    t.includes("resource_exhausted") ||
    t.includes("quota") ||
    t.includes("rate limit")
  );
}

/**
 * Fetch an image URL and return { mimeType, base64 } for inlineData.
 * If input is already a data URL, decode it directly.
 */
export async function urlToInlineData(url: string): Promise<{ mimeType: string; data: string }> {
  if (url.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(url);
    if (!match) throw new Error("invalid data url");
    return { mimeType: match[1], data: match[2] };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image failed: ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i]);
  const b64 = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(buf).toString("base64");
  return { mimeType: contentType.split(";")[0].trim(), data: b64 };
}

/**
 * Call the Gemini generateContent endpoint with exponential-backoff retry
 * on 429 / 5xx responses. Retries: 5s, 10s, 20s.
 */
export async function geminiGenerate(
  model: string,
  body: GeminiRequest,
  opts: { maxRetries?: number } = {},
): Promise<GeminiResponse> {
  const keys = availableKeys();
  if (keys.length === 0) {
    if (loadKeys().length === 0) throw new Error("GEMINI_API_KEY missing");
    throw new Error("AI quota is currently full. Please try again later.");
  }
  const backoffs = [5_000, 10_000, 20_000];
  const maxRetries = Math.min(opts.maxRetries ?? backoffs.length, backoffs.length);

  let lastErr: unknown = null;
  let allQuota = true;

  for (const key of keys) {
    let quotaHit = false;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(key.value)}`;
      try {
        key.lastUsedAt = Date.now();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          if (isQuotaError(res.status, txt)) {
            key.state = "rate_limited";
            key.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
            key.lastErrorAt = Date.now();
            key.lastError = `${res.status}: quota/rate limit`;
            quotaHit = true;
            break; // rotate to next key
          }
          if (res.status >= 500 && res.status < 600) {
            if (attempt < maxRetries) {
              await delay(backoffs[attempt]);
              continue;
            }
            allQuota = false;
            key.state = "failed";
            key.lastErrorAt = Date.now();
            key.lastError = `${res.status}: ${txt.slice(0, 120)}`;
            throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
          }
          // 4xx (not 429): validation / invalid prompt — do NOT rotate
          allQuota = false;
          key.state = "failed";
          key.lastErrorAt = Date.now();
          key.lastError = `${res.status}: ${txt.slice(0, 120)}`;
          throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
        }
        key.state = "available";
        key.lastError = null;
        return (await res.json()) as GeminiResponse;
      } catch (e) {
        lastErr = e;
        if (quotaHit) break;
        if (attempt < maxRetries) {
          await delay(backoffs[attempt]);
          continue;
        }
        allQuota = false;
        throw e instanceof Error ? e : new Error(String(lastErr));
      }
    }
    // if quotaHit -> continue outer loop to next key
  }

  if (allQuota) {
    throw new Error("AI quota is currently full. Please try again later.");
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini request failed");
}

/** Extract concatenated text from a Gemini response. */
export function extractText(res: GeminiResponse): string {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

/** Extract first inline image (data URL) from a Gemini response, or null. */
export function extractImageDataUrl(res: GeminiResponse): string | null {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      const mime = p.inlineData.mimeType || "image/png";
      return `data:${mime};base64,${p.inlineData.data}`;
    }
  }
  return null;
}