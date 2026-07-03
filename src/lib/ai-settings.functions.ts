import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type MaybeRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
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
    const { GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL, getGeminiKey } = await import("@/lib/gemini.server");
    return {
      provider: "gemini",
      configured: Boolean(getGeminiKey()),
      model: GEMINI_TEXT_MODEL,
      imageModel: GEMINI_IMAGE_MODEL,
    };
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
    const { geminiGenerate, extractText, GEMINI_TEXT_MODEL, getGeminiKey } = await import(
      "@/lib/gemini.server"
    );
    if (!getGeminiKey()) return { ok: false, latencyMs: 0, error: "GEMINI_API_KEY is not configured" };
    const started = Date.now();
    try {
      const res = await geminiGenerate(
        GEMINI_TEXT_MODEL,
        {
          contents: [
            { role: "user", parts: [{ text: 'Reply with the single word: OK' }] },
          ],
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
    const { geminiGenerate, extractText, GEMINI_TEXT_MODEL, getGeminiKey } = await import(
      "@/lib/gemini.server"
    );
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