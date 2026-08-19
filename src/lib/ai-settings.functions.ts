import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type MaybeRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};
async function assertAdmin(supabase: unknown, userId: string) {
  const { data, error } = await (supabase as MaybeRpc).rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

export type AiSettingsStatus = {
  provider: "gemini";
  configured: boolean;
  model: string;
  imageModel: string;
};

export const getAiSettingsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiSettingsStatus> => {
    await assertAdmin(context.supabase, context.userId);
    const { GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL, getGeminiKey } =
      await import("@/lib/gemini.server");
    return {
      provider: "gemini",
      configured: Boolean(getGeminiKey()),
      model: GEMINI_TEXT_MODEL,
      imageModel: GEMINI_IMAGE_MODEL,
    };
  });

export type GeminiKeyStatusRow = {
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

export const getGeminiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GeminiKeyStatusRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { getGeminiKeysStatus } = await import("@/lib/gemini.server");
    return getGeminiKeysStatus();
  });

export type OpenRouterStatus = {
  present: boolean;
  lastUsedAt: number | null;
};

export const getOpenRouterStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpenRouterStatus> => {
    await assertAdmin(context.supabase, context.userId);
    const { hasOpenRouterFallback, getLastUsedProvider } = await import("@/lib/gemini.server");
    const last = getLastUsedProvider();
    return {
      present: hasOpenRouterFallback(),
      lastUsedAt: last?.provider === "openrouter" ? last.at : null,
    };
  });

/** Admin controls: disable, enable, reset-cooldown per Gemini key. */
export const setGeminiKeyState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): { label: string; action: "disable" | "enable" | "reset" } => {
    const d = data as { label?: string; action?: string };
    if (!d?.label || !d?.action) throw new Error("invalid input");
    if (!["disable", "enable", "reset"].includes(d.action)) throw new Error("invalid action");
    return { label: d.label, action: d.action as "disable" | "enable" | "reset" };
  })
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    await assertAdmin(context.supabase, context.userId);
    const { disableGeminiKey, enableGeminiKey, resetGeminiKeyCooldown } =
      await import("@/lib/gemini.server");
    let ok = false;
    if (data.action === "disable") ok = disableGeminiKey(data.label);
    else if (data.action === "enable") ok = enableGeminiKey(data.label);
    else ok = resetGeminiKeyCooldown(data.label);
    return { ok };
  });

export const testOneGeminiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown): { label: string } => {
    const d = data as { label?: string };
    if (!d?.label) throw new Error("invalid input");
    return { label: d.label };
  })
  .handler(
    async ({ context, data }): Promise<{ ok: boolean; latencyMs: number; error?: string }> => {
      await assertAdmin(context.supabase, context.userId);
      const { testGeminiKey } = await import("@/lib/gemini.server");
      return testGeminiKey(data.label);
    },
  );

export type GeminiKeyTest = {
  label: string;
  masked: string;
  present: boolean;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export const testAllGeminiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GeminiKeyTest[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { getGeminiKeysStatus, GEMINI_TEXT_MODEL } = await import("@/lib/gemini.server");
    const rows = getGeminiKeysStatus();
    const out: GeminiKeyTest[] = [];
    for (const row of rows) {
      if (!row.present) {
        out.push({
          label: row.label,
          masked: "",
          present: false,
          ok: false,
          latencyMs: 0,
          error: "not configured",
        });
        continue;
      }
      const key = process.env[row.label];
      if (!key) {
        out.push({
          label: row.label,
          masked: row.masked,
          present: false,
          ok: false,
          latencyMs: 0,
          error: "not configured",
        });
        continue;
      }
      const started = Date.now();
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
            generationConfig: { temperature: 0 },
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          out.push({
            label: row.label,
            masked: row.masked,
            present: true,
            ok: false,
            latencyMs: Date.now() - started,
            error: `${res.status}: ${txt.slice(0, 120)}`,
          });
        } else {
          out.push({
            label: row.label,
            masked: row.masked,
            present: true,
            ok: true,
            latencyMs: Date.now() - started,
          });
        }
      } catch (e) {
        out.push({
          label: row.label,
          masked: row.masked,
          present: true,
          ok: false,
          latencyMs: Date.now() - started,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return out;
  });

export type AiTestResult = {
  ok: boolean;
  latencyMs: number;
  sample?: string;
  error?: string;
};

export const testAiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiTestResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { geminiGenerate, extractText, GEMINI_TEXT_MODEL, getGeminiKey } =
      await import("@/lib/gemini.server");
    if (!getGeminiKey())
      return { ok: false, latencyMs: 0, error: "GEMINI_API_KEY is not configured" };
    const started = Date.now();
    try {
      const res = await geminiGenerate(
        GEMINI_TEXT_MODEL,
        {
          contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
          generationConfig: { temperature: 0 },
        },
        { maxRetries: 0 },
      );
      const txt = extractText(res).trim();
      return { ok: true, latencyMs: Date.now() - started, sample: txt.slice(0, 60) };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

export type AiTestProduct = {
  ok: boolean;
  title?: string;
  description?: string;
  tags?: string[];
  error?: string;
};

export const generateTestProductData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiTestProduct> => {
    await assertAdmin(context.supabase, context.userId);
    const { geminiGenerate, extractText, GEMINI_TEXT_MODEL, getGeminiKey } =
      await import("@/lib/gemini.server");
    if (!getGeminiKey()) return { ok: false, error: "GEMINI_API_KEY is not configured" };
    try {
      const res = await geminiGenerate(
        GEMINI_TEXT_MODEL,
        {
          systemInstruction: {
            parts: [
              {
                text: 'Return JSON only for a fictional premium framed poster of Lionel Messi, shape: {"title":string,"description":string,"tags":string[]}. Tags: 5 short keywords.',
              },
            ],
          },
          contents: [{ role: "user", parts: [{ text: "Generate test product data." }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
        },
        { maxRetries: 1 },
      );
      const content = extractText(res);
      let parsed: { title?: string; description?: string; tags?: string[] } = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      }
      return {
        ok: true,
        title: parsed.title,
        description: parsed.description,
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 10) : [],
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
