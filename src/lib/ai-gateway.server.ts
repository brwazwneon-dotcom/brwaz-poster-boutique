import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Was: Lovable AI Gateway (removed 2026-09-12, Lovable decoupling pass).
// The admin assistant needs a model with reliable tool/function-calling
// support (see src/routes/api/admin-assistant.ts's `tool()` definitions),
// so it's routed through OpenRouter — the same non-Lovable AI provider this
// codebase already relies on elsewhere (supabase/functions/seo-generator)
// via OPENROUTER_API_KEY. gpt-4o-mini is used specifically because it has
// solid tool-calling support on OpenRouter; the free-tier models used for
// SEO generation (llama/qwen) are not reliable enough for agentic tool use.
export function createAdminAssistantGateway() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://brwazwneon.com",
      "X-Title": "BRWAZWNEON Admin Assistant",
    },
  });
}
