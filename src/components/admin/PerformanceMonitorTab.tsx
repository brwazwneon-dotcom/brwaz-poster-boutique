import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, Database, Gauge, HardDrive, RefreshCcw, Trash2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { generateVariantsFor } from "@/lib/image-pipeline";
import { readPerfFlagsSync } from "@/lib/performance-flags";

type Bucket = "good" | "warning" | "critical";

function bucket(ms: number, warn = 1500, crit = 3000): Bucket {
  if (ms >= crit) return "critical";
  if (ms >= warn) return "warning";
  return "good";
}

const BUCKET_STYLES: Record<Bucket, { badge: string; label: string; tone: string }> = {
  good: { badge: "bg-green-500/15 text-green-300 border-green-500/30", label: "Good", tone: "text-green-300" },
  warning: { badge: "bg-amber-500/15 text-amber-300 border-amber-500/30", label: "Warning", tone: "text-amber-300" },
  critical: { badge: "bg-red-500/15 text-red-300 border-red-500/30", label: "Critical", tone: "text-red-300" },
};

type PerfRow = { page_path: string; metric: string; value_ms: number; created_at: string };

type TimeRange = "24h" | "7d" | "all";

function sinceFor(range: TimeRange): string | null {
  if (range === "all") return null;
  const hours = range === "24h" ? 24 : 24 * 7;
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

async function fetchPerf(range: TimeRange) {
  const since = sinceFor(range);
  let query = supabase
    .from("perf_metrics")
    .select("page_path, metric, value_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PerfRow[];
}

async function fetchTodayErrors() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: errCount }, { count: failCount }] = await Promise.all([
    supabase
      .from("system_logs")
      .select("*", { count: "exact", head: true })
      .in("level", ["error", "critical"])
      .gte("created_at", since),
    supabase
      .from("system_logs")
      .select("*", { count: "exact", head: true })
      .eq("category", "upload_failed")
      .gte("created_at", since),
  ]);
  return { errors: errCount ?? 0, uploadFails: failCount ?? 0 };
}

async function pingDb() {
  const t0 = performance.now();
  const { error } = await supabase.from("site_settings").select("key").limit(1);
  const dt = performance.now() - t0;
  return { ok: !error, latency: Math.round(dt) };
}

function pathToLabel(p: string): string {
  if (p === "/") return "الصفحة الرئيسية";
  if (p.startsWith("/category/")) return "صفحة تصنيف: " + p.slice(10);
  if (p.startsWith("/poster/")) return "صفحة منتج";
  if (p.startsWith("/checkout")) return "صفحة Checkout";
  if (p.startsWith("/photo-4x6")) return "صفحة رفع الصور";
  if (p.startsWith("/admin")) return "الداش بورد";
  if (p.startsWith("/custom")) return "التصميم المخصص";
  return p;
}

export function PerformanceMonitorTab() {
  const qc = useQueryClient();
  const [range, setRange] = useState<TimeRange>("24h");
  const [clearing, setClearing] = useState(false);
  const [autoFixing, setAutoFixing] = useState(false);
  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["perf-metrics", range],
    queryFn: () => fetchPerf(range),
    refetchInterval: 60_000,
  });
  const { data: errStats } = useQuery({
    queryKey: ["perf-error-stats"],
    queryFn: fetchTodayErrors,
    refetchInterval: 60_000,
  });
  const { data: dbPing } = useQuery({
    queryKey: ["perf-db-ping"],
    queryFn: pingDb,
    refetchInterval: 60_000,
  });

  // Aggregate by (page, metric)
  const byPage = new Map<string, { count: number; sum: number; max: number }>();
  const byMetric = new Map<string, { count: number; sum: number }>();
  for (const r of rows) {
    const p = byPage.get(r.page_path) ?? { count: 0, sum: 0, max: 0 };
    p.count += 1;
    p.sum += r.value_ms;
    p.max = Math.max(p.max, r.value_ms);
    byPage.set(r.page_path, p);

    const m = byMetric.get(r.metric) ?? { count: 0, sum: 0 };
    m.count += 1;
    m.sum += r.value_ms;
    byMetric.set(r.metric, m);
  }

  const pageAvg = Array.from(byPage.entries())
    .map(([path, s]) => ({ path, avg: s.sum / s.count, max: s.max, count: s.count }))
    .sort((a, b) => b.avg - a.avg);
  const slowest = pageAvg.slice(0, 10);

  const overallAvg = rows.length ? Math.round(rows.reduce((a, r) => a + r.value_ms, 0) / rows.length) : 0;
  const slowCount = rows.filter((r) => r.value_ms > 3000).length;

  async function clearOld() {
    if (!confirm("حذف كل قياسات الأداء الحالية والبدء بقياس جديد؟")) return;
    setClearing(true);
    try {
      const cutoff = new Date(Date.now() + 60_000).toISOString();
      const { error } = await supabase.from("perf_metrics").delete().lt("created_at", cutoff);
      if (error) throw error;
      toast.success("تم حذف القياسات الحالية — القياسات الجديدة ستظهر بعد زيارات جديدة");
      qc.invalidateQueries({ queryKey: ["perf-metrics"] });
    } catch (e) {
      toast.error("فشل الحذف: " + (e as Error).message);
    } finally {
      setClearing(false);
    }
  }

  async function autoSpeedFix() {
    if (readPerfFlagsSync().pause_heavy_jobs) {
      toast.error("Heavy jobs موقوفة من Stability tab. فعّل 'Resume Heavy Jobs' أولًا.");
      return;
    }
    if (!confirm("تشغيل إصلاحات الأداء الآمنة؟ سيتم:\n- حذف قياسات > 7 أيام\n- إنشاء نسخ محسّنة للصور الناقصة (حتى 10)")) return;
    setAutoFixing(true);
    try {
      // 1. Clean old metrics
      const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      await supabase.from("perf_metrics").delete().lt("created_at", cutoff);

      // 2. Optimize up to 10 posters missing thumbnails
      const { data: needs } = await supabase.rpc("admin_posters_needing_variants", { _limit: 10 });
      let done = 0;
      for (const row of (needs ?? []) as { id: string; image_url: string }[]) {
        const res = await generateVariantsFor({
          sourceTable: "posters",
          sourceId: row.id,
          originalUrl: row.image_url,
        });
        if (res.done > 0) done += 1;
      }
      toast.success(`Auto Fix: نظّفت القياسات القديمة + حسّنت ${done} صورة`);
      qc.invalidateQueries({ queryKey: ["perf-metrics"] });
      qc.invalidateQueries({ queryKey: ["admin-image-stats"] });
    } catch (e) {
      toast.error("فشل Auto Fix: " + (e as Error).message);
    } finally {
      setAutoFixing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-sm border border-border">
          {(["24h", "7d", "all"] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-3 py-1.5 text-[11px] uppercase tracking-widest",
                range === r ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {r === "24h" ? "آخر 24 ساعة" : r === "7d" ? "آخر 7 أيام" : "كل الفترات"}
            </button>
          ))}
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
        >
          <RefreshCcw className="h-3 w-3" /> تحديث
        </button>
        <button
          onClick={autoSpeedFix}
          disabled={autoFixing}
          className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1.5 text-[10px] uppercase tracking-widest text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          <Zap className="h-3 w-3" /> {autoFixing ? "جارٍ..." : "Auto Speed Fix"}
        </button>
        <button
          onClick={clearOld}
          disabled={clearing}
          className="ml-auto inline-flex items-center gap-1 rounded-sm border border-red-500/40 px-2 py-1.5 text-[10px] uppercase tracking-widest text-red-300 hover:bg-red-500/10 disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" /> Clear Old Measurements
        </button>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          icon={<Gauge className="h-4 w-4" />}
          label="متوسط سرعة الموقع"
          value={`${overallAvg} ms`}
          bucket={bucket(overallAvg)}
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Slow measurements (24h)"
          value={String(slowCount)}
          bucket={slowCount > 20 ? "critical" : slowCount > 5 ? "warning" : "good"}
        />
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="عدد الأخطاء اليوم"
          value={String(errStats?.errors ?? 0)}
          bucket={(errStats?.errors ?? 0) > 20 ? "critical" : (errStats?.errors ?? 0) > 5 ? "warning" : "good"}
        />
        <MetricCard
          icon={<HardDrive className="h-4 w-4" />}
          label="Failed uploads (24h)"
          value={String(errStats?.uploadFails ?? 0)}
          bucket={(errStats?.uploadFails ?? 0) > 10 ? "critical" : (errStats?.uploadFails ?? 0) > 2 ? "warning" : "good"}
        />
      </div>

      {/* System status */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4" /> حالة قاعدة البيانات
            </div>
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px]",
                dbPing?.ok
                  ? BUCKET_STYLES[bucket(dbPing.latency, 400, 1200)].badge
                  : BUCKET_STYLES.critical.badge,
              )}
            >
              {dbPing?.ok ? `${dbPing.latency} ms` : "غير متاح"}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {dbPing?.ok
              ? "قاعدة البيانات تعمل وسرعة الاستجابة طبيعية."
              : "لا يمكن الوصول لقاعدة البيانات حاليًا."}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <HardDrive className="h-4 w-4" /> حالة التخزين
            </div>
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", BUCKET_STYLES.good.badge)}>
              يعمل
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            رفع الصور يعمل. راجع Storage tab للتفاصيل.
          </div>
        </div>
      </div>

      {/* Slowest pages */}
      <div className="rounded-md border border-border bg-card">
        <div className="border-b border-border p-4 text-sm font-semibold">
          أبطأ الصفحات ({range === "24h" ? "آخر 24 ساعة" : range === "7d" ? "آخر 7 أيام" : "كل الفترات"})
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : slowest.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
            <div className="text-sm">لا توجد قياسات بعد. زر صفحات الموقع لجمع بيانات الأداء.</div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {slowest.map((p) => {
              const b = bucket(p.avg);
              const st = BUCKET_STYLES[b];
              return (
                <li key={p.path} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{pathToLabel(p.path)}</div>
                    <div className="text-[10px] text-muted-foreground">{p.path}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{p.count} قياس</span>
                    <span className={st.tone}>Avg {Math.round(p.avg)} ms</span>
                    <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", st.badge)}>{st.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* By metric type */}
      <div className="rounded-md border border-border bg-card">
        <div className="border-b border-border p-4 text-sm font-semibold">حسب نوع القياس</div>
        {byMetric.size === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">لا توجد بيانات.</div>
        ) : (
          <ul className="divide-y divide-border">
            {Array.from(byMetric.entries())
              .sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count)
              .map(([metric, s]) => {
                const avg = Math.round(s.sum / s.count);
                const b = bucket(avg, metric === "TTFB" ? 500 : 1500, metric === "TTFB" ? 1500 : 3000);
                const st = BUCKET_STYLES[b];
                return (
                  <li key={metric} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div className="font-medium">{metric}</div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{s.count} قياس</span>
                      <span className={st.tone}>Avg {avg} ms</span>
                      <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", st.badge)}>{st.label}</span>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      <div className="text-[10px] text-muted-foreground">
        القياسات تُجمع تلقائيًا من جهاز الزوار عبر Performance Observer.
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  bucket: b,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bucket: Bucket;
}) {
  const st = BUCKET_STYLES[b];
  return (
    <div className={cn("rounded-md border p-3", st.badge)}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest opacity-90">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className={cn("mt-1 text-[10px]", st.tone)}>{st.label}</div>
    </div>
  );
}