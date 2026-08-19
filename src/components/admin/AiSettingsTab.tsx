import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Zap,
  ShieldCheck,
  Power,
  RotateCcw,
  Play,
} from "lucide-react";
import {
  getAiSettingsStatus,
  testAiConnection,
  generateTestProductData,
  getGeminiKeys,
  testAllGeminiKeys,
  getOpenRouterStatus,
  setGeminiKeyState,
  testOneGeminiKey,
  type AiTestResult,
  type AiTestProduct,
  type GeminiKeyStatusRow,
  type GeminiKeyTest,
} from "@/lib/ai-settings.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  AI_THRESHOLD_KEY,
  AI_THRESHOLD_DEFAULT,
  AI_THRESHOLD_MIN,
  AI_THRESHOLD_MAX,
  useAiAutoApproveThreshold,
} from "@/lib/ai-review";

export function AiSettingsTab() {
  const statusFn = useServerFn(getAiSettingsStatus);
  const testFn = useServerFn(testAiConnection);
  const sampleFn = useServerFn(generateTestProductData);
  const keysFn = useServerFn(getGeminiKeys);
  const testAllFn = useServerFn(testAllGeminiKeys);
  const openRouterFn = useServerFn(getOpenRouterStatus);
  const setKeyStateFn = useServerFn(setGeminiKeyState);
  const testOneFn = useServerFn(testOneGeminiKey);
  const qc = useQueryClient();
  const savedThreshold = useAiAutoApproveThreshold();
  const [threshold, setThreshold] = useState<number>(savedThreshold);
  const [savingThreshold, setSavingThreshold] = useState(false);
  useEffect(() => {
    setThreshold(savedThreshold);
  }, [savedThreshold]);

  async function saveThreshold(v?: number) {
    const value = Math.max(AI_THRESHOLD_MIN, Math.min(AI_THRESHOLD_MAX, v ?? threshold));
    setSavingThreshold(true);
    try {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: AI_THRESHOLD_KEY, value: value as unknown as never }, { onConflict: "key" });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["ai-auto-approve-threshold"] });
      toast.success(`Auto-approve threshold saved: ${Math.round(value * 100)}%`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingThreshold(false);
    }
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ai-settings-status"],
    queryFn: () => statusFn(),
  });

  const {
    data: keys,
    isLoading: keysLoading,
    refetch: refetchKeys,
  } = useQuery({
    queryKey: ["ai-gemini-keys"],
    queryFn: () => keysFn(),
    refetchInterval: 30_000,
  });

  const { data: openRouter, refetch: refetchOpenRouter } = useQuery({
    queryKey: ["ai-openrouter-status"],
    queryFn: () => openRouterFn(),
    refetchInterval: 60_000,
  });

  const [testingAll, setTestingAll] = useState(false);
  const [keyTests, setKeyTests] = useState<GeminiKeyTest[] | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  async function keyAction(label: string, action: "disable" | "enable" | "reset") {
    setBusyLabel(label);
    try {
      await setKeyStateFn({ data: { label, action } });
      toast.success(
        action === "disable"
          ? `${label} disabled`
          : action === "enable"
            ? `${label} enabled`
            : `${label} cooldown reset`,
      );
      refetchKeys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyLabel(null);
    }
  }

  async function testSingle(label: string) {
    setBusyLabel(label);
    try {
      const r = await testOneFn({ data: { label } });
      if (r.ok) toast.success(`${label} OK · ${r.latencyMs}ms`);
      else toast.error(`${label}: ${r.error ?? "failed"}`);
      refetchKeys();
    } finally {
      setBusyLabel(null);
    }
  }

  async function runTestAll() {
    setTestingAll(true);
    setKeyTests(null);
    try {
      const r = await testAllFn();
      setKeyTests(r);
      const okCount = r.filter((x) => x.ok).length;
      const totalPresent = r.filter((x) => x.present).length;
      if (okCount === totalPresent && totalPresent > 0) {
        toast.success(`All ${okCount} keys OK`);
      } else {
        toast.warning(`${okCount}/${totalPresent} keys OK`);
      }
      refetchKeys();
      refetchOpenRouter();
    } finally {
      setTestingAll(false);
    }
  }

  function fmtTime(ts: number | null) {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString();
  }

  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<AiTestResult | null>(null);
  const [gen, setGen] = useState<AiTestProduct | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  const connected = !!data?.configured;

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const r = await testFn();
      setTest(r);
      if (r.ok) toast.success(`Gemini responded in ${r.latencyMs}ms`);
      else toast.error(r.error || "Test failed");
      refetch();
    } finally {
      setTesting(false);
    }
  }

  async function runSample() {
    setGenLoading(true);
    setGen(null);
    try {
      const r = await sampleFn();
      setGen(r);
      if (!r.ok) toast.error(r.error || "Generation failed");
    } finally {
      setGenLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">AI Settings</h2>
        <p className="text-sm text-muted-foreground">
          All AI features run through your own Google Gemini API key stored server-side. No Lovable
          credits are used for AI generation.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Provider</div>
            <div className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Google Gemini
            </div>
          </div>
          <div>
            {isLoading ? (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking…
              </span>
            ) : connected ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" /> Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-1 text-sm font-medium">
                <XCircle className="h-4 w-4" /> Not Connected
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Text / Vision model</div>
            <div className="font-mono">{data?.model ?? "—"}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Image model</div>
            <div className="font-mono">{data?.imageModel ?? "—"}</div>
          </div>
        </div>

        <div className="rounded border p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground mb-1">API key</div>
          Priority queue: <code className="font-mono">GEMINI_API_KEY_1</code> →{" "}
          <code className="font-mono">…</code> →{" "}
          <code className="font-mono">GEMINI_API_KEY_10</code> →{" "}
          <code className="font-mono">OPENROUTER_API_KEY</code> (fallback only). Keys are never
          exposed to the browser. On 429 / quota-exceeded the key cools down for 60 minutes and the
          next one is used automatically.
        </div>

        <div className="rounded border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <div className="text-sm font-semibold">API Priority Queue</div>
              <div className="text-xs text-muted-foreground">
                Requests try keys 1 → 6 in order. OpenRouter is used only when every Gemini key is
                rate-limited, disabled, or failed.
              </div>
            </div>
            <button
              onClick={runTestAll}
              disabled={testingAll}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {testingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              Test All Gemini Keys
            </button>
          </div>
          <div className="grid gap-2">
            {(keys ?? []).map((k: GeminiKeyStatusRow) => {
              const test = keyTests?.find((t) => t.label === k.label);
              const state = test ? (test.ok ? "available" : "failed") : k.state;
              const stateStyles = !k.present
                ? "bg-muted text-muted-foreground"
                : state === "available"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : state === "rate_limited"
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : state === "disabled"
                      ? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                      : state === "failed"
                        ? "bg-red-500/10 text-red-600 dark:text-red-400"
                        : "bg-muted text-muted-foreground";
              const stateLabel = !k.present
                ? "Not configured"
                : state === "available"
                  ? "Available"
                  : state === "rate_limited"
                    ? "Rate limited"
                    : state === "disabled"
                      ? "Disabled"
                      : state === "failed"
                        ? "Failed"
                        : "Unknown";
              const busy = busyLabel === k.label;
              return (
                <div
                  key={k.label}
                  className="flex flex-wrap items-center gap-3 rounded border px-3 py-2 text-sm"
                >
                  <div className="font-mono text-xs">{k.label}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {k.present ? k.masked : "—"}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stateStyles}`}
                  >
                    {stateLabel}
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span title="Requests / OK / Failed">
                      {k.requests}/{k.successes}/{k.failures}
                    </span>
                    <span>Last: {fmtTime(k.lastUsedAt)}</span>
                    {test && (
                      <span className={test.ok ? "text-emerald-600" : "text-red-600"}>
                        {test.ok ? `${test.latencyMs}ms` : test.error}
                      </span>
                    )}
                    {k.present && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => testSingle(k.label)}
                          disabled={busy}
                          title="Test key"
                          className="rounded border px-1.5 py-0.5 hover:bg-muted disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => keyAction(k.label, "reset")}
                          disabled={busy}
                          title="Reset cooldown"
                          className="rounded border px-1.5 py-0.5 hover:bg-muted disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                        {k.disabled ? (
                          <button
                            onClick={() => keyAction(k.label, "enable")}
                            disabled={busy}
                            title="Enable key"
                            className="rounded border px-1.5 py-0.5 text-emerald-600 hover:bg-muted disabled:opacity-50"
                          >
                            <Power className="h-3 w-3" />
                          </button>
                        ) : (
                          <button
                            onClick={() => keyAction(k.label, "disable")}
                            disabled={busy}
                            title="Disable key"
                            className="rounded border px-1.5 py-0.5 text-red-600 hover:bg-muted disabled:opacity-50"
                          >
                            <Power className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* OpenRouter fallback row */}
            <div className="flex flex-wrap items-center gap-3 rounded border border-dashed px-3 py-2 text-sm">
              <div className="font-mono text-xs">OPENROUTER_API_KEY</div>
              <div className="font-mono text-xs text-muted-foreground">
                {openRouter?.present ? "configured" : "—"}
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  !openRouter?.present
                    ? "bg-muted text-muted-foreground"
                    : openRouter.lastUsedAt
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {!openRouter?.present
                  ? "Not configured"
                  : openRouter.lastUsedAt
                    ? "Fallback active"
                    : "Standby (not used)"}
              </span>
              <div className="ml-auto text-xs text-muted-foreground">
                Last fallback use: {fmtTime(openRouter?.lastUsedAt ?? null)}
              </div>
            </div>
            {!keysLoading && (keys?.length ?? 0) === 0 && (
              <div className="text-xs text-muted-foreground">
                No Gemini keys detected. Add GEMINI_API_KEY_1 … GEMINI_API_KEY_10 in Secrets.
              </div>
            )}
          </div>
        </div>

        {!connected && (
          <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
            GEMINI_API_KEY is not configured. All AI features will show "AI temporarily unavailable"
            until it is added.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={runTest}
            disabled={testing || !connected}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Test Connection
          </button>
          <button
            onClick={runSample}
            disabled={genLoading || !connected}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {genLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Test Product Data
          </button>
        </div>

        {test && (
          <div
            className={`rounded border p-3 text-sm ${test.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}
          >
            {test.ok ? (
              <div>
                <div className="font-medium text-emerald-600 dark:text-emerald-400">
                  Success — {test.latencyMs}ms
                </div>
                <div className="text-muted-foreground mt-1">
                  Model reply: <span className="font-mono">{test.sample || "(empty)"}</span>
                </div>
              </div>
            ) : (
              <div className="text-red-600 dark:text-red-400">{test.error}</div>
            )}
          </div>
        )}

        {gen && (
          <div
            className={`rounded border p-3 text-sm ${gen.ok ? "" : "border-red-500/30 bg-red-500/5"}`}
          >
            {gen.ok ? (
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-muted-foreground">Title</div>
                  <div className="font-medium">{gen.title}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Description</div>
                  <div>{gen.description}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Tags</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {gen.tags?.map((t) => (
                      <span key={t} className="rounded bg-muted px-2 py-0.5 text-xs">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-red-600 dark:text-red-400">{gen.error}</div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div>
            <div className="text-lg font-semibold">AI Auto-Approval Confidence</div>
            <div className="text-xs text-muted-foreground">
              Images at or above this confidence auto-fill title, category, tags & SEO and go
              straight to <span className="font-medium">Ready</span>. Below it, they land in{" "}
              <span className="font-medium">Needs Review</span>.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="range"
            min={Math.round(AI_THRESHOLD_MIN * 100)}
            max={Math.round(AI_THRESHOLD_MAX * 100)}
            step={1}
            value={Math.round(threshold * 100)}
            onChange={(e) => setThreshold(Number(e.target.value) / 100)}
            className="w-full accent-primary"
          />
          <div className="w-16 text-right font-mono text-lg font-semibold">
            {Math.round(threshold * 100)}%
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => saveThreshold()}
            disabled={savingThreshold || threshold === savedThreshold}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {savingThreshold ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Save Threshold
          </button>
          <button
            onClick={() => {
              setThreshold(AI_THRESHOLD_DEFAULT);
              void saveThreshold(AI_THRESHOLD_DEFAULT);
            }}
            disabled={savingThreshold}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Reset to {Math.round(AI_THRESHOLD_DEFAULT * 100)}%
          </button>
        </div>

        <div className="text-xs text-muted-foreground">
          Range: {Math.round(AI_THRESHOLD_MIN * 100)}% – {Math.round(AI_THRESHOLD_MAX * 100)}%.
          Default: {Math.round(AI_THRESHOLD_DEFAULT * 100)}%. Clear posters (comics, anime,
          football, cars, movies) still get title and tags generated even when category confidence
          is low.
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-5 text-sm space-y-2">
        <div className="font-semibold">Where Gemini is used</div>
        <ul className="list-disc list-inside text-muted-foreground space-y-1">
          <li>AI Poster Upload — title, description, SEO, tags, category detection</li>
          <li>Bulk AI generation for uploaded posters</li>
          <li>4×6 Photo enhancement suite (sharpen, colors, "wear a suit", etc.)</li>
        </ul>
        <div className="text-xs text-muted-foreground pt-2">
          On rate limits, requests automatically retry with 5s → 10s → 20s backoff. If Gemini
          remains unavailable, the UI shows "AI temporarily unavailable" — no fallback to Lovable AI
          Gateway is attempted.
        </div>
      </div>
    </div>
  );
}
