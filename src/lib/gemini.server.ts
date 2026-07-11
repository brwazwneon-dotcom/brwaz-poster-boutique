// Server-only Gemini API helper.
// Reads GEMINI_API_KEY_1..6 (and legacy GEMINI_API_KEY) from environment.
// Implements a strict priority queue: Gemini Key 1 → Key 2 → … → Key 6 →
// OpenRouter (fallback only, for text/JSON). Never import from client code.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
];

export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

export type GeminiKeyStatus = {
  label: string;
  masked: string;
  present: boolean;
  state: "available" | "rate_limited" | "failed" | "disabled" | "unknown";
  lastUsedAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  rateLimitedUntil: number | null;
  disabled: boolean;
  requests: number;
  successes: number;
  failures: number;
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
  disabled: boolean;
  requests: number;
  successes: number;
  failures: number;
};

const RATE_LIMIT_COOLDOWN_MS = 60_000;

/** Records the last provider/key actually used by a successful request. */
let LAST_USED: { provider: "gemini" | "openrouter"; label: string; at: number } | null = null;
export function getLastUsedProvider() {
  return LAST_USED;
}

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
    "GEMINI_API_KEY_6",
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
        disabled: false,
        requests: 0,
        successes: 0,
        failures: 0,
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
      disabled: false,
      requests: 0,
      successes: 0,
      failures: 0,
    });
  }
  KEYS = out;
  return KEYS;
}

function availableKeys(): KeyEntry[] {
  const now = Date.now();
  return loadKeys().filter((k) => {
    if (k.disabled) return false;
    if (k.rateLimitedUntil && k.rateLimitedUntil > now) return false;
    return true;
  });
}

/** Legacy — returns true if at least one Gemini key is configured. */
export function getGeminiKey(): string | null {
  const keys = loadKeys();
  return keys.length > 0 ? keys[0].value : null;
}

export function hasOpenRouterFallback(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function findKey(label: string): KeyEntry | undefined {
  return loadKeys().find((k) => k.label === label);
}

export function disableGeminiKey(label: string): boolean {
  const k = findKey(label);
  if (!k) return false;
  k.disabled = true;
  return true;
}

export function enableGeminiKey(label: string): boolean {
  const k = findKey(label);
  if (!k) return false;
  k.disabled = false;
  k.state = "available";
  k.rateLimitedUntil = null;
  return true;
}

export function resetGeminiKeyCooldown(label: string): boolean {
  const k = findKey(label);
  if (!k) return false;
  k.rateLimitedUntil = null;
  if (k.state === "rate_limited") k.state = "available";
  return true;
}

export function getGeminiKeysStatus(): GeminiKeyStatus[] {
  const labels = [
    "GEMINI_API_KEY_1",
    "GEMINI_API_KEY_2",
    "GEMINI_API_KEY_3",
    "GEMINI_API_KEY_4",
    "GEMINI_API_KEY_5",
    "GEMINI_API_KEY_6",
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
        disabled: false,
        requests: 0,
        successes: 0,
        failures: 0,
      };
    }
    const state: GeminiKeyStatus["state"] = k.disabled
      ? "disabled"
      : k.rateLimitedUntil && k.rateLimitedUntil > now
      ? "rate_limited"
      : k.state;
    return {
      label: k.label,
      masked: k.masked,
      present: true,
      state,
      lastUsedAt: k.lastUsedAt,
      lastErrorAt: k.lastErrorAt,
      lastError: k.lastError,
      rateLimitedUntil: k.rateLimitedUntil,
      disabled: k.disabled,
      requests: k.requests,
      successes: k.successes,
      failures: k.failures,
    };
  });
  // Append any legacy GEMINI_API_KEY if present and not already listed
  const legacy = byLabel.get("GEMINI_API_KEY");
  if (legacy) {
    rows.push({
      label: legacy.label,
      masked: legacy.masked,
      present: true,
      state: legacy.disabled
        ? "disabled"
        : legacy.rateLimitedUntil && legacy.rateLimitedUntil > now
        ? "rate_limited"
        : legacy.state,
      lastUsedAt: legacy.lastUsedAt,
      lastErrorAt: legacy.lastErrorAt,
      lastError: legacy.lastError,
      rateLimitedUntil: legacy.rateLimitedUntil,
      disabled: legacy.disabled,
      requests: legacy.requests,
      successes: legacy.successes,
      failures: legacy.failures,
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
        key.requests += 1;
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
            key.failures += 1;
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
            key.failures += 1;
            throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
          }
          // 4xx (not 429): validation / invalid prompt — do NOT rotate
          allQuota = false;
          key.state = "failed";
          key.lastErrorAt = Date.now();
          key.lastError = `${res.status}: ${txt.slice(0, 120)}`;
          key.failures += 1;
          throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
        }
        key.state = "available";
        key.lastError = null;
        key.successes += 1;
        LAST_USED = { provider: "gemini", label: key.label, at: Date.now() };
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

/**
 * Test a single Gemini key with a minimal prompt. Returns latency + ok flag
 * and updates the key's counters/state accordingly.
 */
export async function testGeminiKey(
  label: string,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const k = findKey(label);
  if (!k) return { ok: false, latencyMs: 0, error: "not configured" };
  const started = Date.now();
  const url = `${GEMINI_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(k.value)}`;
  try {
    k.lastUsedAt = Date.now();
    k.requests += 1;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
        generationConfig: { temperature: 0 },
      }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      k.failures += 1;
      k.lastErrorAt = Date.now();
      k.lastError = `${res.status}: ${txt.slice(0, 120)}`;
      if (isQuotaError(res.status, txt)) {
        k.state = "rate_limited";
        k.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      } else {
        k.state = "failed";
      }
      return { ok: false, latencyMs, error: `${res.status}: ${txt.slice(0, 120)}` };
    }
    k.state = "available";
    k.lastError = null;
    k.successes += 1;
    return { ok: true, latencyMs };
  } catch (e) {
    k.failures += 1;
    k.state = "failed";
    k.lastErrorAt = Date.now();
    k.lastError = e instanceof Error ? e.message : String(e);
    return { ok: false, latencyMs: Date.now() - started, error: k.lastError };
  }
}

/**
 * Priority-queue text/JSON generation: Gemini Keys 1→6 first, then OpenRouter
 * as final fallback. Returns the generated text and metadata about which
 * provider/key served the request.
 */
export async function generateTextPriority(opts: {
  system?: string;
  user: string;
  json?: boolean;
  temperature?: number;
}): Promise<{ content: string; provider: "gemini" | "openrouter"; key: string }> {
  // 1) Try Gemini keys in strict priority order (handled by geminiGenerate).
  const geminiAvailable = availableKeys().length > 0;
  if (geminiAvailable) {
    try {
      const body: GeminiRequest = {
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.4,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      };
      if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
      const res = await geminiGenerate(GEMINI_TEXT_MODEL, body, { maxRetries: 1 });
      const content = extractText(res);
      const used = LAST_USED?.provider === "gemini" ? LAST_USED.label : "gemini";
      return { content, provider: "gemini", key: used };
    } catch (e) {
      // Fall through to OpenRouter only if all Gemini keys are unavailable.
      const stillAvailable = availableKeys().length > 0;
      if (stillAvailable) {
        // A non-quota error on the first available key — do not fall back.
        throw e;
      }
    }
  }

  // 2) OpenRouter fallback (only when every Gemini key is rate-limited/disabled).
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!orKey) {
    throw new Error(
      "All Gemini keys are unavailable and OpenRouter fallback is not configured.",
    );
  }
  let lastErr: unknown = null;
  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${orKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://brwazwneon.lovable.app",
          "X-Title": "BRWAZWNEON AI",
        },
        body: JSON.stringify({
          model,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          temperature: opts.temperature ?? 0.4,
          messages: [
            ...(opts.system ? [{ role: "system", content: opts.system }] : []),
            { role: "user", content: opts.user },
          ],
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        lastErr = new Error(`OpenRouter ${res.status} on ${model}: ${txt.slice(0, 200)}`);
        continue;
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data?.choices?.[0]?.message?.content ?? "";
      if (!content) {
        lastErr = new Error(`Empty content from OpenRouter:${model}`);
        continue;
      }
      LAST_USED = { provider: "openrouter", label: model, at: Date.now() };
      return { content, provider: "openrouter", key: model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("OpenRouter fallback failed");
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