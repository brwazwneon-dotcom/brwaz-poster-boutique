import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, PauseCircle, PlayCircle, ShieldCheck, Zap } from "lucide-react";
import {
  PERFORMANCE_DEFAULTS,
  saveFlags,
  usePerformanceFlags,
  type PerformanceFlags,
} from "@/lib/performance-flags";
import { cn } from "@/lib/utils";

/**
 * Stability & Performance control card. Emergency levers only — no new
 * features. Everything here is a toggle that reduces load, and can be
 * turned back off later.
 */
export function StabilityTab() {
  const server = usePerformanceFlags();
  const qc = useQueryClient();
  const [local, setLocal] = useState<PerformanceFlags>(server);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(server); }, [server]);

  const dirty = JSON.stringify(local) !== JSON.stringify(server);

  async function persist(next: PerformanceFlags, msg?: string) {
    setSaving(true);
    try {
      await saveFlags(next);
      await qc.invalidateQueries({ queryKey: ["performance-flags"] });
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error("فشل الحفظ: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div
        className={cn(
          "rounded-md border p-4",
          server.safe_mode
            ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
            : "border-green-500/30 bg-green-500/5 text-green-200",
        )}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          {server.safe_mode ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          Website stability:{" "}
          {server.safe_mode ? "Safe Mode — عناصر مخفضة لتثبيت الأداء" : "Stable — كل الميزات مفعلة"}
        </div>
        <div className="mt-2 text-xs opacity-80">
          {server.pause_heavy_jobs
            ? "⏸ المهام الثقيلة موقوفة (Bulk SEO / Auto Speed Fix)."
            : "▶ المهام الثقيلة تعمل بشكل طبيعي."}
        </div>
      </div>

      {/* Emergency actions */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          onClick={() => persist({ ...server, emergency_fast_mode: !server.emergency_fast_mode }, server.emergency_fast_mode ? "تم إيقاف Emergency Fast Mode" : "تم تفعيل Emergency Fast Mode")}
          disabled={saving}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md border px-4 py-6 text-sm font-semibold transition md:col-span-2",
            server.emergency_fast_mode
              ? "border-green-500/40 bg-green-500/10 hover:bg-green-500/20"
              : "border-red-500/40 bg-red-500/10 hover:bg-red-500/20",
          )}
        >
          <Zap className="h-5 w-5" />
          {server.emergency_fast_mode ? "Emergency Fast Mode is ON" : "Turn On Emergency Fast Mode"}
        </button>
        <button
          onClick={() => persist({ ...server, safe_mode: !server.safe_mode }, server.safe_mode ? "تم إيقاف Performance Safe Mode" : "تم تفعيل Performance Safe Mode")}
          disabled={saving}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md border px-4 py-6 text-sm font-semibold transition",
            server.safe_mode
              ? "border-green-500/40 bg-green-500/10 hover:bg-green-500/20"
              : "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20",
          )}
        >
          <Zap className="h-5 w-5" />
          {server.safe_mode ? "Turn Off Performance Safe Mode" : "Turn On Performance Safe Mode"}
        </button>
        <button
          onClick={() => persist({ ...server, pause_heavy_jobs: !server.pause_heavy_jobs }, server.pause_heavy_jobs ? "تم استئناف المهام الثقيلة" : "تم إيقاف المهام الثقيلة")}
          disabled={saving}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md border px-4 py-6 text-sm font-semibold transition",
            server.pause_heavy_jobs
              ? "border-green-500/40 bg-green-500/10 hover:bg-green-500/20"
              : "border-red-500/40 bg-red-500/10 hover:bg-red-500/20",
          )}
        >
          {server.pause_heavy_jobs ? <PlayCircle className="h-5 w-5" /> : <PauseCircle className="h-5 w-5" />}
          {server.pause_heavy_jobs ? "Resume Heavy Jobs" : "Pause Heavy Jobs"}
        </button>
      </div>

      {/* Feature toggles */}
      <div className="rounded-md border border-border bg-card">
        <div className="border-b border-border p-4 text-sm font-semibold">
          Feature Toggles — أوقف أي ميزة يبدو أنها تسبب بطء
        </div>
        <div className="divide-y divide-border">
          <Toggle
            label="Emergency Fast Mode"
            hint="أسرع وضع للواجهة: 8 منتجات، thumbnails فقط، إخفاء الأقسام البطيئة وتأجيل السكربتات."
            checked={local.emergency_fast_mode}
            onChange={(v) => setLocal({ ...local, emergency_fast_mode: v })}
          />
          <Toggle
            label="Preloader (شاشة اللوجو السوداء)"
            hint="لو الصفحة تبطئ بعد ظهور اللوجو، اقفلها."
            checked={!local.disable_preloader}
            forced={server.safe_mode}
            onChange={(v) => setLocal({ ...local, disable_preloader: !v })}
          />
          <Toggle
            label="Social Proof popups"
            hint="'شخص اشترى الآن' — تظهر بشكل متكرر."
            checked={!local.disable_social_proof}
            forced={server.safe_mode}
            onChange={(v) => setLocal({ ...local, disable_social_proof: !v })}
          />
          <Toggle
            label="Floating Offer Bubble"
            hint="الفقاعة العائمة أسفل الصفحة."
            checked={!local.disable_floating_offer}
            forced={server.safe_mode}
            onChange={(v) => setLocal({ ...local, disable_floating_offer: !v })}
          />
          <div className="flex items-center justify-between gap-4 p-4">
            <div>
              <div className="text-sm font-medium">أقصى عدد أقسام في الصفحة الرئيسية</div>
              <div className="text-[11px] text-muted-foreground">أقل رقم = تحميل أسرع.</div>
            </div>
            <input
              type="number"
              min={1}
              max={30}
              value={local.max_home_sections}
              onChange={(e) => setLocal({ ...local, max_home_sections: Number(e.target.value) || 1 })}
              className="w-20 rounded-sm border border-border bg-background px-2 py-1 text-right text-sm"
            />
          </div>
          <div className="flex items-center justify-between gap-4 p-4">
            <div>
              <div className="text-sm font-medium">تأخير تحميل Analytics (ms)</div>
              <div className="text-[11px] text-muted-foreground">Meta Pixel / GA4 يتحمّلا بعد هذا الوقت من فتح الصفحة.</div>
            </div>
            <input
              type="number"
              min={0}
              max={30000}
              step={500}
              value={local.analytics_defer_ms}
              onChange={(e) => setLocal({ ...local, analytics_defer_ms: Number(e.target.value) || 0 })}
              className="w-24 rounded-sm border border-border bg-background px-2 py-1 text-right text-sm"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border p-4">
          <button
            onClick={() => setLocal(PERFORMANCE_DEFAULTS)}
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Reset to defaults
          </button>
          <button
            onClick={() => persist(local, "تم حفظ الإعدادات")}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            حفظ التغييرات
          </button>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">
        ملاحظة: تفعيل Safe Mode يفرض إعدادات مخفضة تلقائيًا (Preloader / Social Proof / Floating Offer / أقسام أقل / تأخير Analytics أعلى) بغض النظر عن قيم التوجلز الفردية.
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  forced,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  forced?: boolean;
}) {
  return (
    <label className={cn("flex items-center justify-between gap-4 p-4", forced && "opacity-60")}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
        {forced ? <div className="text-[10px] text-amber-400">Safe Mode يتحكم في هذا الآن</div> : null}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={forced}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-muted transition checked:bg-primary"
      />
    </label>
  );
}