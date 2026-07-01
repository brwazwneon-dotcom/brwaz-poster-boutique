import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createBackupServer,
  deleteBackupServer,
  getBackupDownloadUrl,
  restoreBackupServer,
  emergencyRestoreServer,
  pruneBackupsServer,
} from "@/lib/backups.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Download,
  Trash2,
  RefreshCw,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type BackupRow = {
  id: string;
  backup_type: string;
  status: string;
  storage_path: string | null;
  size_bytes: number | null;
  checksum: string | null;
  encryption: string | null;
  triggered_by: string | null;
  created_by_email: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  table_counts: Record<string, number> | null;
};

const SCOPES = [
  { key: "homepage", label: "Homepage & Settings" },
  { key: "settings", label: "Settings Only" },
  { key: "pricing", label: "Pricing Only" },
  { key: "categories", label: "Categories Only" },
  { key: "reviews", label: "Reviews Only" },
  { key: "posters", label: "Posters Only" },
  { key: "orders", label: "Orders Only" },
  { key: "all", label: "Entire Website (all tables)" },
] as const;

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

function statusPill(s: string) {
  const base =
    "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest";
  if (s === "completed")
    return (
      <span className={cn(base, "border-emerald-600/40 bg-emerald-500/10 text-emerald-400")}>
        <CheckCircle2 className="h-3 w-3" /> Completed
      </span>
    );
  if (s === "failed")
    return (
      <span className={cn(base, "border-red-600/40 bg-red-500/10 text-red-400")}>
        <XCircle className="h-3 w-3" /> Failed
      </span>
    );
  if (s === "running")
    return (
      <span className={cn(base, "border-amber-600/40 bg-amber-500/10 text-amber-400")}>
        <Loader2 className="h-3 w-3 animate-spin" /> Running
      </span>
    );
  return (
    <span className={cn(base, "border-border text-muted-foreground")}>
      <Clock className="h-3 w-3" /> {s}
    </span>
  );
}

export function BackupsTab() {
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState<{ id: string } | null>(null);
  const [restoreScope, setRestoreScope] = useState<(typeof SCOPES)[number]["key"]>("homepage");
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [emergency, setEmergency] = useState(false);

  const createFn = useServerFn(createBackupServer);
  const deleteFn = useServerFn(deleteBackupServer);
  const downloadFn = useServerFn(getBackupDownloadUrl);
  const restoreFn = useServerFn(restoreBackupServer);
  const emergencyFn = useServerFn(emergencyRestoreServer);
  const pruneFn = useServerFn(pruneBackupsServer);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase
      .from("backups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data as unknown as BackupRow[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const stats = useMemo(() => {
    const by = { daily: 0, weekly: 0, monthly: 0, manual: 0, safety: 0, failed: 0, total_bytes: 0 };
    for (const r of rows) {
      if (r.status === "failed") by.failed += 1;
      if (r.backup_type in by) (by as Record<string, number>)[r.backup_type] += 1;
      by.total_bytes += r.size_bytes ?? 0;
    }
    return by;
  }, [rows]);

  async function handleCreate() {
    setCreating(true);
    try {
      await createFn({ data: { type: "manual" } });
      toast.success("Backup Completed Successfully");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleDownload(id: string) {
    try {
      const { url } = await downloadFn({ data: { id } });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this backup permanently?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Backup deleted");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleRestore() {
    if (!restoreOpen) return;
    if (restoreConfirm !== "RESTORE") {
      toast.error("Type RESTORE to confirm");
      return;
    }
    setRestoring(true);
    try {
      const res = (await restoreFn({
        data: { id: restoreOpen.id, scope: restoreScope, confirm: "RESTORE" },
      })) as { results: Record<string, { restored: number; error?: string }> };
      const summary = Object.entries(res.results)
        .map(([t, r]) => `${t}: ${r.error ? "err" : r.restored}`)
        .join(", ");
      toast.success(`Restore complete — ${summary}`);
      setRestoreOpen(null);
      setRestoreConfirm("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  async function handleEmergency() {
    if (!confirm("Emergency restore uses the most recent healthy backup and reverts homepage + settings. Continue?"))
      return;
    setEmergency(true);
    try {
      const res = (await emergencyFn()) as { restored_from: string };
      // Chain to a homepage-scope restore
      await restoreFn({
        data: { id: res.restored_from, scope: "homepage", confirm: "RESTORE" },
      });
      toast.success("Emergency restore complete");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Emergency restore failed");
    } finally {
      setEmergency(false);
    }
  }

  async function handlePrune() {
    setPruning(true);
    try {
      const res = (await pruneFn()) as { deleted: number };
      toast.success(`Pruned ${res.deleted} old backup(s)`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Prune failed");
    } finally {
      setPruning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header + primary actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">System</div>
          <h2 className="text-display text-3xl">System Backup</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Encrypted (AES-256-GCM) snapshots of all app data. Scheduled backups run at 3:00 AM
            daily, Sundays weekly, and the 1st of each month. Retention: 30 daily · 12 weekly · 12
            monthly.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Backup Now
          </button>
          <button
            onClick={handleEmergency}
            disabled={emergency}
            className="inline-flex items-center gap-2 rounded-sm border border-red-600/50 bg-red-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-red-300 hover:bg-red-500/20 disabled:opacity-60"
          >
            {emergency ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            Emergency Restore
          </button>
          <button
            onClick={handlePrune}
            disabled={pruning}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent disabled:opacity-60"
          >
            {pruning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Prune Old
          </button>
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Daily", value: stats.daily },
          { label: "Weekly", value: stats.weekly },
          { label: "Monthly", value: stats.monthly },
          { label: "Manual", value: stats.manual },
          { label: "Safety", value: stats.safety },
          { label: "Failed", value: stats.failed },
          { label: "Total Size", value: formatBytes(stats.total_bytes) },
          { label: "Total Backups", value: rows.length },
        ].map((k) => (
          <div key={k.label} className="rounded-sm border border-border bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {k.label}
            </div>
            <div className="mt-1 text-2xl font-semibold">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">Created By</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No backups yet. Click "Create Backup Now" to run the first one.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest">
                    {r.backup_type}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {statusPill(r.status)}
                  {r.error_message && (
                    <div className="mt-1 max-w-xs truncate text-[10px] text-red-400" title={r.error_message}>
                      {r.error_message}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <HardDrive className="h-3 w-3" /> {formatBytes(r.size_bytes)}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.triggered_by ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.created_by_email ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      disabled={r.status !== "completed"}
                      onClick={() => void handleDownload(r.id)}
                      className="rounded-sm border border-border p-1.5 hover:bg-accent disabled:opacity-40"
                      title="Download encrypted backup"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      disabled={r.status !== "completed"}
                      onClick={() => setRestoreOpen({ id: r.id })}
                      className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary hover:bg-primary/20 disabled:opacity-40"
                      title="Restore from this backup"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => void handleDelete(r.id)}
                      className="rounded-sm border border-border p-1.5 text-red-400 hover:bg-red-500/10"
                      title="Delete backup"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Future storage adapters (informational) */}
      <div className="rounded-sm border border-dashed border-border p-4 text-xs text-muted-foreground">
        <div className="mb-1 font-semibold uppercase tracking-widest text-foreground">
          Backup Storage
        </div>
        Cloud Storage (active) · Local Storage (download button) · Google Drive (future) · Amazon S3
        (future) · Cloudflare R2 (future)
      </div>

      {/* Restore modal */}
      {restoreOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-sm border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Restore Backup
                </div>
                <h3 className="text-display text-2xl">Choose scope</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  A safety backup will be created automatically before restore.
                </p>
              </div>
              <button
                onClick={() => {
                  setRestoreOpen(null);
                  setRestoreConfirm("");
                }}
                className="rounded-sm border border-border p-1.5 hover:bg-accent"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {SCOPES.map((s) => (
                <label
                  key={s.key}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-sm border p-3 text-sm",
                    restoreScope === s.key
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={s.key}
                    checked={restoreScope === s.key}
                    onChange={() => setRestoreScope(s.key)}
                  />
                  {s.label}
                </label>
              ))}
            </div>

            <div className="mt-4">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Type <span className="text-foreground">RESTORE</span> to confirm
              </label>
              <input
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
                placeholder="RESTORE"
                className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRestoreOpen(null);
                  setRestoreConfirm("");
                }}
                className="rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                disabled={restoring || restoreConfirm !== "RESTORE"}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {restoring && <Loader2 className="h-4 w-4 animate-spin" />}
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}