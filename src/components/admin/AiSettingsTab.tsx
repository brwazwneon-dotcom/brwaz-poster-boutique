import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Sparkles, Zap, ShieldCheck } from "lucide-react";
import {
  getAiSettingsStatus,
  testAiConnection,
  generateTestProductData,
  type AiTestResult,
  type AiTestProduct,
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
        .upsert(
          { key: AI_THRESHOLD_KEY, value: value as unknown as never },
          { onConflict: "key" },
        );
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
          All AI features run through your own Google Gemini API key stored server-side.
          No Lovable credits are used for AI generation.
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
          Stored in server environment as{" "}
          <code className="font-mono">GEMINI_API_KEY</code>. The key is never
          exposed to the browser or written to the database. To rotate or
          replace it, use the project's Secrets panel.
        </div>

        {!connected && (
          <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
            GEMINI_API_KEY is not configured. All AI features will show
            "AI temporarily unavailable" until it is added.
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
            {genLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Test Product Data
          </button>
        </div>

        {test && (
          <div className={`rounded border p-3 text-sm ${test.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
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
          <div className={`rounded border p-3 text-sm ${gen.ok ? "" : "border-red-500/30 bg-red-500/5"}`}>
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
                      <span key={t} className="rounded bg-muted px-2 py-0.5 text-xs">{t}</span>
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

      <div className="rounded-lg border bg-muted/30 p-5 text-sm space-y-2">
        <div className="font-semibold">Where Gemini is used</div>
        <ul className="list-disc list-inside text-muted-foreground space-y-1">
          <li>AI Poster Upload — title, description, SEO, tags, category detection</li>
          <li>Bulk AI generation for uploaded posters</li>
          <li>4×6 Photo enhancement suite (sharpen, colors, "wear a suit", etc.)</li>
        </ul>
        <div className="text-xs text-muted-foreground pt-2">
          On rate limits, requests automatically retry with 5s → 10s → 20s backoff.
          If Gemini remains unavailable, the UI shows "AI temporarily unavailable" —
          no fallback to Lovable AI Gateway is attempted.
        </div>
      </div>
    </div>
  );
}