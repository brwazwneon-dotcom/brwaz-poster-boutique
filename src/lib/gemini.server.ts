// Server-only Gemini API helper.
// Reads GEMINI_API_KEY from environment. Never import from client code.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

export function getGeminiKey(): string | null {
  return process.env.GEMINI_API_KEY || null;
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
  const key = getGeminiKey();
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const backoffs = [5_000, 10_000, 20_000];
  const maxRetries = Math.min(opts.maxRetries ?? backoffs.length, backoffs.length);

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < maxRetries) {
          await delay(backoffs[attempt]);
          continue;
        }
        const txt = await res.text().catch(() => "");
        throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
      }
      return (await res.json()) as GeminiResponse;
    } catch (e) {
      lastErr = e;
      // Network error — retry with backoff
      if (attempt < maxRetries) {
        await delay(backoffs[attempt]);
        continue;
      }
      throw e instanceof Error ? e : new Error(String(lastErr));
    }
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