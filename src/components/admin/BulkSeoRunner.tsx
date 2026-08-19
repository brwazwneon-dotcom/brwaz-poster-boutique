import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  X,
  Pause,
  Play,
  StopCircle,
  RefreshCw,
  Loader2,
  Check,
  AlertTriangle,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { readPerfFlagsSync } from "@/lib/performance-flags";

type PosterRow = {
  id: string;
  title: string | null;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  tags: string[] | null;
  hashtags: string[] | null;
  alt_text: string | null;
  image_url: string | null;
};

type Field =
  "title" | "description" | "seo_title" | "seo_description" | "tags" | "hashtags" | "alt_text";

type Options = {
  mode: "missing" | "regenerate";
  fields: Record<Field, boolean>;
};

type RunItem = {
  poster: PosterRow;
  status: "queued" | "running" | "ok" | "failed" | "skipped" | "needs_review";
  updated?: string[];
  error?: string;
  provider?: string;
};

const ALL_FIELDS: Field[] = [
  "title",
  "description",
  "seo_title",
  "seo_description",
  "tags",
  "hashtags",
  "alt_text",
];
const FIELD_LABEL: Record<Field, string> = {
  title: "Title",
  description: "Description",
  seo_title: "SEO title",
  seo_description: "SEO description",
  tags: "Tags",
  hashtags: "Hashtags",
  alt_text: "Alt text",
};

export function BulkSeoRunner({
  open,
  subcategoryId,
  subcategoryName,
  onClose,
}: {
  open: boolean;
  subcategoryId: string;
  subcategoryName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [posters, setPosters] = useState<PosterRow[]>([]);
  const [options, setOptions] = useState<Options>({
    mode: "missing",
    fields: {
      title: true,
      description: true,
      seo_title: true,
      seo_description: true,
      tags: true,
      hashtags: true,
      alt_text: true,
    },
  });
  const [phase, setPhase] = useState<"configure" | "running" | "done">("configure");
  const [items, setItems] = useState<RunItem[]>([]);
  const [paused, setPaused] = useState(false);
  const stopRef = useRef(false);
  const pauseRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,description,seo_title,seo_description,tags,hashtags,alt_text,image_url")
        .eq("category_id", subcategoryId)
        .eq("hidden", false)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setPosters((data ?? []) as PosterRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, subcategoryId]);

  const enabledFields = useMemo(
    () => ALL_FIELDS.filter((f) => options.fields[f]),
    [options.fields],
  );

  const start = async () => {
    if (readPerfFlagsSync().pause_heavy_jobs) {
      toast.error("Heavy jobs موقوفة من Stability tab. فعّل 'Resume Heavy Jobs' أولًا.");
      return;
    }
    if (!posters.length) {
      toast.error("No posters in this subcategory");
      return;
    }
    if (!enabledFields.length) {
      toast.error("Pick at least one field");
      return;
    }
    stopRef.current = false;
    pauseRef.current = false;
    setPaused(false);
    const queued: RunItem[] = posters.map((p) => ({ poster: p, status: "queued" }));
    setItems(queued);
    setPhase("running");
    await runList(queued, [...Array(queued.length).keys()]);
  };

  const runList = async (list: RunItem[], indices: number[]) => {
    for (const idx of indices) {
      if (stopRef.current) break;
      while (pauseRef.current && !stopRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (stopRef.current) break;
      list = [...list];
      list[idx] = { ...list[idx], status: "running" };
      setItems([...list]);
      const result = await processPoster(list[idx].poster, options);
      list[idx] = {
        ...list[idx],
        status: result.status,
        updated: result.updated,
        error: result.error,
        provider: result.provider,
      };
      setItems([...list]);
      // Rate-limit-friendly pacing: ~1.2s between requests.
      await new Promise((r) => setTimeout(r, 1200));
    }
    setPhase("done");
  };

  const retryFailed = async () => {
    const idxs = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.status === "failed")
      .map(({ i }) => i);
    if (!idxs.length) return;
    stopRef.current = false;
    setPhase("running");
    for (const i of idxs) items[i] = { ...items[i], status: "queued" };
    setItems([...items]);
    await runList(items, idxs);
  };

  const close = () => {
    stopRef.current = true;
    setPhase("configure");
    setItems([]);
    setPosters([]);
    onClose();
  };

  const totals = useMemo(() => {
    return {
      total: items.length,
      done: items.filter((i) => ["ok", "failed", "skipped", "needs_review"].includes(i.status))
        .length,
      ok: items.filter((i) => i.status === "ok").length,
      failed: items.filter((i) => i.status === "failed").length,
      skipped: items.filter((i) => i.status === "skipped").length,
      review: items.filter((i) => i.status === "needs_review").length,
    };
  }, [items]);

  const currentProvider = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].provider) return items[i].provider!;
    }
    return null;
  }, [items]);

  const providerCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      if (!it.provider) continue;
      map.set(it.provider, (map.get(it.provider) ?? 0) + 1);
    }
    return map;
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Bulk AI SEO — {subcategoryName}
          </DialogTitle>
        </DialogHeader>

        {phase === "configure" && (
          <div className="space-y-4 text-sm">
            <div className="rounded-sm border border-border bg-muted/30 p-3">
              <div>
                Posters in this sub category: <b>{loading ? "…" : posters.length}</b>
              </div>
              <div>
                Estimated AI requests: <b>{loading ? "…" : posters.length}</b>
              </div>
              <div className="mt-1 text-xs text-amber-500/90">
                {options.mode === "missing"
                  ? "Existing values will NOT be overwritten. Only empty fields are filled."
                  : "⚠ Regenerate will overwrite existing values for the selected fields."}
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                Mode
              </div>
              <div className="flex gap-2">
                {(["missing", "regenerate"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setOptions((o) => ({ ...o, mode: m }))}
                    className={cn(
                      "rounded-sm border px-3 py-1.5 text-xs uppercase tracking-widest",
                      options.mode === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "missing" ? "Only fill missing" : "Regenerate all"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                Fields
              </div>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {ALL_FIELDS.map((f) => (
                  <label
                    key={f}
                    className="flex items-center gap-2 rounded-sm border border-border px-2 py-1.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={options.fields[f]}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          fields: { ...o.fields, [f]: e.target.checked },
                        }))
                      }
                    />
                    {FIELD_LABEL[f]}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase !== "configure" && (
          <div className="space-y-3 text-sm">
            <div className="rounded-sm border border-border bg-card p-3">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Processing {totals.done} / {totals.total} posters
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: totals.total ? `${(totals.done / totals.total) * 100}%` : "0%" }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                <span className="text-emerald-500">✔ {totals.ok} completed</span>
                <span className="text-amber-500">⚠ {totals.review} needs review</span>
                <span className="text-destructive">✖ {totals.failed} failed</span>
                <span className="text-muted-foreground">↷ {totals.skipped} skipped</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>Current:</span>
                <span className="rounded border border-border px-1.5 py-0.5 font-mono">
                  {currentProvider ?? "waiting…"}
                </span>
                {providerCounts.size > 0 && (
                  <>
                    <span>·</span>
                    {[...providerCounts.entries()].map(([p, n]) => (
                      <span key={p} className="rounded border border-border px-1.5 py-0.5">
                        {p}: {n}
                      </span>
                    ))}
                  </>
                )}
                {[...providerCounts.keys()].some((p) => p.toLowerCase().includes("openrouter")) && (
                  <span className="text-amber-500">
                    ⚠ All Gemini keys were unavailable — using OpenRouter fallback.
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-sm border border-border">
              {items.map((it, i) => (
                <div
                  key={it.poster.id}
                  className={cn(
                    "flex items-center gap-2 border-b border-border p-2 text-xs last:border-b-0",
                    i % 2 && "bg-muted/20",
                  )}
                >
                  <StatusIcon status={it.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{it.poster.title || it.poster.id}</div>
                    {it.error && (
                      <div className="truncate text-[10px] text-destructive">{it.error}</div>
                    )}
                    {it.updated && it.updated.length > 0 && (
                      <div className="truncate text-[10px] text-muted-foreground">
                        Updated: {it.updated.join(", ")}
                      </div>
                    )}
                  </div>
                  {it.provider && (
                    <span className="rounded border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
                      {it.provider}
                    </span>
                  )}
                </div>
              ))}
              {items.length === 0 && (
                <div className="p-4 text-center text-muted-foreground">Waiting…</div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {phase === "configure" && (
            <>
              <button
                onClick={close}
                className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                onClick={start}
                disabled={loading || !posters.length}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" /> Start SEO generation
              </button>
            </>
          )}
          {phase === "running" && (
            <>
              <button
                onClick={() => {
                  pauseRef.current = !pauseRef.current;
                  setPaused(pauseRef.current);
                }}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest"
              >
                {paused ? (
                  <>
                    <Play className="h-3.5 w-3.5" /> Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" /> Pause
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  stopRef.current = true;
                }}
                className="inline-flex items-center gap-1 rounded-sm border border-destructive px-3 py-2 text-xs uppercase tracking-widest text-destructive"
              >
                <StopCircle className="h-3.5 w-3.5" /> Stop
              </button>
            </>
          )}
          {phase === "done" && (
            <>
              <button
                onClick={retryFailed}
                disabled={!totals.failed}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry failed
              </button>
              <button
                onClick={close}
                className="rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground"
              >
                Close
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: RunItem["status"] }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  if (status === "ok") return <Check className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "failed") return <X className="h-3.5 w-3.5 text-destructive" />;
  if (status === "skipped") return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "needs_review") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  return <span className="h-3.5 w-3.5 rounded-full border border-border" />;
}

function isEmpty(v: unknown) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

async function processPoster(
  poster: PosterRow,
  opts: Options,
): Promise<{ status: RunItem["status"]; updated?: string[]; error?: string; provider?: string }> {
  // Which fields should we actually attempt to write?
  const attempt: Field[] = [];
  for (const f of ALL_FIELDS) {
    if (!opts.fields[f]) continue;
    if (opts.mode === "missing" && !isEmpty(poster[f as keyof PosterRow])) continue;
    attempt.push(f);
  }
  if (attempt.length === 0) {
    await logAttempt(poster.id, "skipped", [], null, null);
    return { status: "skipped" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("seo-generator", {
      body: {
        title: poster.title || undefined,
        subject: poster.title || undefined,
        tags: poster.tags || [],
        include_hashtags: attempt.includes("hashtags"),
        include_alt_text: attempt.includes("alt_text"),
      },
    });
    if (error) throw error;
    const gen = (data ?? {}) as Partial<PosterRow> & {
      model?: string;
      provider?: string;
      key?: string;
      hashtags?: string[];
      alt_text?: string;
    };
    // Prefer explicit provider/key labels from the edge function; fall back to model.
    const provider = gen.key ? gen.key : gen.provider ? gen.provider : (gen.model ?? "unknown");

    const patch: Record<string, unknown> = {};
    const updated: string[] = [];
    for (const f of attempt) {
      const val = (gen as Record<string, unknown>)[f];
      if (isEmpty(val)) continue;
      patch[f] = val;
      updated.push(f);
    }
    if (Object.keys(patch).length === 0) {
      await logAttempt(poster.id, "needs_review", [], provider, "AI returned no usable fields");
      return { status: "needs_review", provider, error: "AI returned no usable fields" };
    }
    const { error: upErr } = await supabase
      .from("posters")
      .update(patch as never)
      .eq("id", poster.id);
    if (upErr) throw upErr;
    await logAttempt(poster.id, "ok", updated, provider, null);
    return { status: "ok", updated, provider };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logAttempt(poster.id, "failed", [], null, msg);
    return { status: "failed", error: msg };
  }
}

async function logAttempt(
  posterId: string,
  status: string,
  fields: string[],
  provider: string | null,
  error: string | null,
) {
  try {
    await supabase.from("ai_seo_logs" as never).insert({
      poster_id: posterId,
      status,
      fields_updated: fields,
      provider,
      error,
    } as never);
  } catch {
    /* noop */
  }
}
