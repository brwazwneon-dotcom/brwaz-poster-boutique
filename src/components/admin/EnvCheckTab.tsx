import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  RefreshCw,
  Download,
} from "lucide-react";
import { getEnvSecurityReport, type EnvReport, type CheckSeverity } from "@/lib/env-check.functions";
import { cn } from "@/lib/utils";

function collectClientEnvKeys(): string[] {
  try {
    const e: any = (import.meta as any).env ?? {};
    return Object.keys(e).filter((k) => k.startsWith("VITE_"));
  } catch {
    return [];
  }
}

function sevIcon(s: CheckSeverity) {
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function sevBadge(s: CheckSeverity) {
  return (
    <span
      className={cn(
        "rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-widest border",
        s === "ok" && "border-emerald-500/40 text-emerald-500",
        s === "warn" && "border-amber-500/40 text-amber-500",
        s === "crit" && "border-red-500/40 text-red-500",
      )}
    >
      {s === "ok" ? "Pass" : s === "warn" ? "Warn" : "Critical"}
    </span>
  );
}

export function EnvCheckTab() {
  const run = useServerFn(getEnvSecurityReport);
  const [report, setReport] = useState<EnvReport | null>(null);
  const [loading, setLoading] = useState(false);

  const grouped = useMemo(() => {
    if (!report) return [] as Array<{ category: string; items: EnvReport["checks"] }>;
    const map = new Map<string, EnvReport["checks"]>();
    for (const c of report.checks) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }, [report]);

  const runScan = async () => {
    setLoading(true);
    try {
      const r = await run({ data: { clientEnvKeys: collectClientEnvKeys() } });
      setReport(r);
      if (r.counts.crit > 0) toast.error(`${r.counts.crit} critical issue(s) found`);
      else if (r.counts.warn > 0) toast.warning(`${r.counts.warn} warning(s)`);
      else toast.success("All checks passed");
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!report) return;
    const lines: string[] = [];
    lines.push("BRWAZWNEON — Production Security Report");
    lines.push(`Generated: ${new Date(report.generatedAt).toLocaleString()}`);
    lines.push(`Score: ${report.score}/100`);
    lines.push(
      `Pass: ${report.counts.ok}  Warn: ${report.counts.warn}  Critical: ${report.counts.crit}`,
    );
    lines.push("");
    for (const g of grouped) {
      lines.push(`## ${g.category}`);
      for (const c of g.items) {
        lines.push(`[${c.severity.toUpperCase()}] ${c.name} — ${c.message}`);
        if (c.detail) lines.push(`   ↳ ${c.detail}`);
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-display text-3xl flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Production Environment Checker
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Verifies server secrets are configured, and that no private keys are exposed to the browser.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runScan}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {loading ? "Scanning…" : "Run Scan"}
          </button>
          <button
            onClick={download}
            disabled={!report}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Report
          </button>
        </div>
      </div>

      {!report && (
        <div className="rounded-sm border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Click <strong>Run Scan</strong> to audit environment variables and secret exposure.
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-sm border border-border p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Score</div>
              <div className="text-3xl font-bold mt-1">{report.score}/100</div>
            </div>
            <div className="rounded-sm border border-emerald-500/30 p-4">
              <div className="text-xs uppercase tracking-widest text-emerald-500">Passed</div>
              <div className="text-3xl font-bold mt-1">{report.counts.ok}</div>
            </div>
            <div className="rounded-sm border border-amber-500/30 p-4">
              <div className="text-xs uppercase tracking-widest text-amber-500">Warnings</div>
              <div className="text-3xl font-bold mt-1">{report.counts.warn}</div>
            </div>
            <div className="rounded-sm border border-red-500/30 p-4">
              <div className="text-xs uppercase tracking-widest text-red-500">Critical</div>
              <div className="text-3xl font-bold mt-1">{report.counts.crit}</div>
            </div>
          </div>

          {report.serverEnv.leakedToClient.length > 0 && (
            <div className="rounded-sm border border-red-500/50 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 font-semibold text-red-500">
                <XCircle className="h-4 w-4" /> Secret leak detected
              </div>
              <ul className="mt-2 text-sm list-disc pl-5">
                {report.serverEnv.leakedToClient.map((k) => (
                  <li key={k}><code>{k}</code></li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.category} className="rounded-sm border border-border">
                <div className="border-b border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground">
                  {g.category}
                </div>
                <div className="divide-y divide-border">
                  {g.items.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5">{sevIcon(c.severity)}</div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.message}</div>
                          {c.detail && (
                            <div className="text-xs text-amber-500 mt-1">{c.detail}</div>
                          )}
                        </div>
                      </div>
                      {sevBadge(c.severity)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}