import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  RefreshCw,
  HardDrive,
  AlertTriangle,
  CheckCircle2,
  PlayCircle,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useImageStats } from "@/lib/image-variants";
import { generateVariantsFor } from "@/lib/image-pipeline";
import { cn } from "@/lib/utils";

type NeedsRow = { id: string; title: string | null; image_url: string };

function formatBytes(n: number) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function ImageControlCenter() {
  const qc = useQueryClient();
  const stats = useImageStats();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(
    null,
  );

  const { data: needs = [], refetch: refetchNeeds } = useQuery({
    queryKey: ["admin-posters-needing-variants"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_posters_needing_variants", { _limit: 50 });
      if (error) throw error;
      return (data ?? []) as NeedsRow[];
    },
  });

  async function optimizeAll() {
    if (running) return;
    setRunning(true);
    setProgress({ done: 0, total: needs.length, failed: 0 });
    let done = 0;
    let failed = 0;
    try {
      for (const row of needs) {
        const res = await generateVariantsFor({
          sourceTable: "posters",
          sourceId: row.id,
          originalUrl: row.image_url,
        });
        if (res.done > 0) done += 1;
        else failed += 1;
        setProgress({ done: done + failed, total: needs.length, failed });
      }
      toast.success(`Processed ${done} images (${failed} failed)`);
      qc.invalidateQueries({ queryKey: ["admin-image-stats"] });
      refetchNeeds();
    } catch (e) {
      toast.error("Batch failed: " + (e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const s = stats.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <ImageIcon className="h-5 w-5" /> Image Control Center
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة النسخ المحسّنة لصور الموقع (Thumbnail / Preview / Large). الصور الأصلية للطباعة تظل
          محفوظة كما هي.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<ImageIcon className="h-4 w-4" />}
          label="Total posters"
          value={s?.posters_total ?? 0}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="With thumbnails"
          value={s?.posters_with_thumb ?? 0}
          tone="good"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Missing thumbnails"
          value={s?.posters_missing_thumb ?? 0}
          tone={(s?.posters_missing_thumb ?? 0) > 0 ? "warning" : "good"}
        />
        <StatCard
          icon={<HardDrive className="h-4 w-4" />}
          label="Optimized variants"
          value={s?.variants_done ?? 0}
        />
        <StatCard
          icon={<HardDrive className="h-4 w-4" />}
          label="Storage used"
          value={formatBytes(s?.variants_bytes ?? 0)}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Heavy variants (>1.5MB)"
          value={s?.heavy_variants ?? 0}
          tone={(s?.heavy_variants ?? 0) > 0 ? "warning" : "good"}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Failed"
          value={s?.variants_failed ?? 0}
          tone={(s?.variants_failed ?? 0) > 0 ? "critical" : "good"}
        />
        <StatCard
          icon={<Loader2 className="h-4 w-4" />}
          label="Pending"
          value={s?.variants_pending ?? 0}
        />
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <div className="font-semibold text-amber-300">🔒 Preserve Original Quality: ON</div>
        <div className="mt-1 text-xs text-amber-200/80">
          الصور الأصلية <strong>لن تُضغط ولن تُحذف</strong> أبدًا. النسخ المحسّنة تُنشأ للعرض فقط.
          هذا الإعداد مقفول من مالك المتجر لضمان جودة الطباعة.
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Optimize Existing Images</div>
            <div className="text-xs text-muted-foreground">
              {needs.length > 0
                ? `${needs.length} صورة تحتاج إلى إنشاء نسخ محسّنة`
                : "جميع الصور محسّنة ✓"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchNeeds()}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
            <button
              onClick={optimizeAll}
              disabled={running || needs.length === 0}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {running ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <PlayCircle className="h-3 w-3" />
              )}
              {running ? "Processing…" : "Optimize Now"}
            </button>
          </div>
        </div>

        {progress && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span>
                Processing {progress.done} / {progress.total} — Failed: {progress.failed}
              </span>
              <span>
                {progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {needs.length > 0 && !running && (
          <div className="mt-4 max-h-64 overflow-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="p-2 text-start">صورة</th>
                  <th className="p-2 text-start">العنوان</th>
                </tr>
              </thead>
              <tbody>
                {needs.slice(0, 20).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2">
                      <img src={r.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                    </td>
                    <td className="p-2 truncate">{r.title ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-[10px] text-muted-foreground">
        Thumbnails: 400px · Medium: 900px · Large: 1600px · Format: WebP (fallback JPEG) · Quality:
        82–90.
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "good" | "warning" | "critical" | "neutral";
}) {
  const styles = {
    good: "border-green-500/30 bg-green-500/5 text-green-300",
    warning: "border-amber-500/30 bg-amber-500/5 text-amber-300",
    critical: "border-red-500/30 bg-red-500/5 text-red-300",
    neutral: "border-border bg-card",
  }[tone];
  return (
    <div className={cn("rounded-md border p-3", styles)}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest opacity-80">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
