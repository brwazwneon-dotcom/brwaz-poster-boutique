import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  FlaskConical,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  advanceBackupsAdmin,
  createBackupAdmin,
  downloadRecoverySnapshotAdmin,
  getBackupCenterAdmin,
  saveBackupSettingsAdmin,
  testBackupAdmin,
  type BackupCenterState,
  type BackupRunView,
} from "@/lib/backup-center.functions";
import {
  RETENTION_MAX_KEEP,
  RETENTION_MIN_KEEP,
  type BackupSettings,
  type DisplayState,
} from "@/lib/backup-center.core";
import { cn } from "@/lib/utils";

const POLL_RUNNING_MS = 4000;

const STATE_META: Record<DisplayState, { label: string; tone: string }> = {
  running: { label: "Running", tone: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  completed: { label: "Completed", tone: "border-border bg-muted/40 text-muted-foreground" },
  verified: { label: "Verified", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  verification_failed: {
    label: "Verification failed",
    tone: "border-red-500/40 bg-red-500/10 text-red-300",
  },
  restore_passed: {
    label: "Restore test passed",
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  restore_failed: {
    label: "Restore test failed",
    tone: "border-red-500/40 bg-red-500/10 text-red-300",
  },
  failed: { label: "Failed", tone: "border-red-500/40 bg-red-500/10 text-red-300" },
  expired: { label: "Expired", tone: "border-border bg-muted/40 text-muted-foreground" },
};

const KIND_LABEL: Record<string, string> = {
  database: "Database",
  source: "Source",
  metadata: "Recovery snapshot",
};

const STEP_LABEL: Record<string, string> = {
  branch_creating: "Creating the database backup…",
  branch_wait: "Waiting for the backup to be ready…",
  test_create_child: "Testing backup… creating an isolated copy",
  test_creating: "Testing backup… creating an isolated copy",
  test_wait: "Testing backup… checking the isolated copy",
  test_cleanup: "Cleaning up the temporary copy…",
};

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function when(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function StatePill({ state }: { state: DisplayState }) {
  const m = STATE_META[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
        m.tone,
      )}
    >
      {state === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
      {m.label}
    </span>
  );
}

function Summary({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Database;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <h3 className="text-xs font-semibold uppercase tracking-widest">{title}</h3>
      </div>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right text-foreground">{v}</dd>
    </div>
  );
}

function CheckList({ run }: { run: BackupRunView }) {
  if (run.checks.length === 0 && !run.error && !run.restoreReason && !run.note) {
    return <p className="text-sm text-muted-foreground">No checks recorded for this entry.</p>;
  }
  return (
    <div className="space-y-2 text-sm">
      {run.checks.length > 0 && (
        <ul className="space-y-1">
          {run.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              )}
              <span>
                {c.label}
                {c.detail ? <span className="text-muted-foreground"> — {c.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {run.restoredCounts && (
        <p className="text-xs text-muted-foreground">
          Restored copy (counts only):{" "}
          {Object.entries(run.restoredCounts)
            .map(([k, v]) => `${k.replace("_", " ")} ${v}`)
            .join(" · ")}
        </p>
      )}
      {run.restoreReason && (
        <p className="text-red-300">Restore failed. Reason: {run.restoreReason}</p>
      )}
      {run.error && <p className="text-red-300">Reason: {run.error}</p>}
      {run.note && <p className="text-muted-foreground">{run.note}</p>}
    </div>
  );
}

export function BackupCenterTab({ active = true }: { active?: boolean }) {
  const [state, setState] = useState<BackupCenterState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<BackupSettings | null>(null);
  const advancing = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await getBackupCenterAdmin();
      setState(s);
      if (s.ok) setDraft((d) => d ?? s.settings);
      return s;
    } catch {
      setState({ ok: false, reason: "error", message: "Could not load the Backup Center." });
      return null;
    }
  }, []);

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  // While anything is running: advance one step, then re-read — until it finishes.
  const inFlight = state?.ok === true && state.inFlight;
  useEffect(() => {
    if (!active || !inFlight) return;
    const id = window.setInterval(async () => {
      if (advancing.current || document.visibilityState !== "visible") return;
      advancing.current = true;
      try {
        await advanceBackupsAdmin();
        await refresh();
      } finally {
        advancing.current = false;
      }
    }, POLL_RUNNING_MS);
    return () => window.clearInterval(id);
  }, [active, inFlight, refresh]);

  const run = async (
    label: string,
    fn: () => Promise<{ ok: boolean; message?: string; started?: string[] }>,
  ) => {
    setBusy(label);
    try {
      const r = await fn();
      if (r.ok) toast.success(r.started?.length ? `Started: ${r.started.join(", ")}` : "Done");
      else toast.error(r.message ?? "Something went wrong");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const download = async (id: string) => {
    try {
      const out = await downloadRecoverySnapshotAdmin({ data: { runId: id } });
      if (!out.json) return toast.error("Snapshot not found");
      const blob = new Blob([out.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recovery-snapshot-${id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    }
  };

  const saveSettings = async () => {
    if (!draft) return;
    setBusy("settings");
    try {
      const r = await saveBackupSettingsAdmin({ data: draft });
      setDraft(r.settings);
      toast.success("Backup settings saved");
    } catch {
      toast.error("Could not save settings");
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  if (!state) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!state.ok) {
    return (
      <div
        role="alert"
        className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300"
      >
        {state.message}
      </div>
    );
  }

  const runs = state.runs;
  const dbRuns = runs.filter((r) => r.kind === "database");
  const lastDb =
    dbRuns.find((r) => r.status === "completed" || r.status === "running") ?? dbRuns[0] ?? null;
  const lastSource = runs.find((r) => r.kind === "source") ?? null;
  const lastPassed = dbRuns.find((r) => r.restoreTest === "passed") ?? null;
  const lastFailed = dbRuns.find((r) => r.restoreTest === "failed") ?? null;
  const running = runs.find((r) => r.state === "running") ?? null;
  const tested = [...runs].find((r) => r.kind === "database" && r.checks.length > 0) ?? null;
  const neonOk = state.integrations.neon;
  const settings = draft ?? state.settings;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-2xl font-semibold">Backup &amp; Recovery</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Database backups are Neon snapshots, source recovery is backed by Git/GitHub, and a
          recovery snapshot records everything needed to rebuild (names only, never secret values).
          A backup is only called <strong className="text-foreground">Verified</strong> after it was
          actually checked, and a restore test runs in a temporary isolated copy that is deleted
          afterwards. Production is never overwritten.
        </p>
      </div>

      {!neonOk && (
        <div className="flex gap-3 rounded-sm border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Database backups are not connected yet.</strong> Add <code>NEON_API_KEY</code>{" "}
            and <code>NEON_PROJECT_ID</code> to the Vercel environment (Neon console → Account → API
            keys, and Project → Settings), then redeploy. The source reference and recovery snapshot
            work without them.
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Summary title="Database backup" icon={Database}>
          <Line k="Last backup" v={lastDb ? when(lastDb.createdAt) : "None yet"} />
          <Line k="Status" v={lastDb ? <StatePill state={lastDb.state} /> : "—"} />
          <Line
            k="Verified"
            v={
              lastDb
                ? lastDb.verification === "verified"
                  ? "Yes"
                  : lastDb.verification === "failed"
                    ? "Failed"
                    : "Not yet"
                : "—"
            }
          />
          <Line
            k="Next scheduled"
            v={state.settings.enabled ? `${state.settings.frequency}, 03:00 UTC` : "Scheduling off"}
          />
        </Summary>
        <Summary title="Source backup" icon={GitBranch}>
          <Line
            k="Protected commit"
            v={
              <code className="font-mono text-xs">
                {state.production.commit?.slice(0, 7) ?? "unknown"}
              </code>
            }
          />
          <Line k="Branch" v={state.production.branch ?? "—"} />
          <Line k="Last check" v={lastSource ? when(lastSource.createdAt) : "None yet"} />
          <Line
            k="Verified"
            v={
              lastSource
                ? lastSource.verification === "verified"
                  ? `Yes (${lastSource.reference})`
                  : "Not verified"
                : "—"
            }
          />
        </Summary>
        <Summary title="Recovery test" icon={FlaskConical}>
          <Line
            k="Last successful"
            v={lastPassed ? when(lastPassed.completedAt ?? lastPassed.createdAt) : "Never"}
          />
          <Line
            k="Last failure"
            v={lastFailed ? when(lastFailed.completedAt ?? lastFailed.createdAt) : "None"}
          />
          <Line k="Method" v="Isolated temporary copy" />
        </Summary>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!!busy || !!running}
          onClick={() => run("full", () => createBackupAdmin({ data: { kind: "full" } }))}
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy === "full" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Create full backup
        </button>
        <button
          type="button"
          disabled={!!busy || !!running || !neonOk}
          onClick={() => run("database", () => createBackupAdmin({ data: { kind: "database" } }))}
          className="inline-flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-sm hover:bg-muted/40 disabled:opacity-50"
        >
          <Database className="h-4 w-4" /> Backup database
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("source", () => createBackupAdmin({ data: { kind: "source" } }))}
          className="inline-flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-sm hover:bg-muted/40 disabled:opacity-50"
        >
          <GitBranch className="h-4 w-4" /> Backup source
        </button>
        <button
          type="button"
          disabled={!!busy || !!running || !neonOk}
          onClick={() => run("test", () => testBackupAdmin({ data: {} }))}
          className="inline-flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-sm hover:bg-muted/40 disabled:opacity-50"
        >
          <FlaskConical className="h-4 w-4" /> Test latest backup
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void refresh()}
          className="inline-flex h-10 items-center gap-2 rounded-sm border border-border px-4 text-sm hover:bg-muted/40 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh status
        </button>
      </div>

      {running && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-sm border border-sky-500/40 bg-sky-500/10 p-4 text-sm text-sky-200"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{STEP_LABEL[running.step ?? ""] ?? "Working…"}</span>
        </div>
      )}

      {tested && !running && (
        <div className="rounded-sm border border-border bg-card p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Latest database check — {when(tested.completedAt ?? tested.createdAt)}
          </h3>
          <CheckList run={tested} />
        </div>
      )}

      <div className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Backup history
          </h3>
        </div>
        {runs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No backups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Version</th>
                  <th className="px-3 py-2 font-semibold">Size</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Verification</th>
                  <th className="px-3 py-2 font-semibold">Restore test</th>
                  <th className="px-5 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="border-t border-border">
                      <td className="px-5 py-2.5 whitespace-nowrap">{when(r.createdAt)}</td>
                      <td className="px-3 py-2.5">{KIND_LABEL[r.kind] ?? r.kind}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {r.kind === "source" || r.kind === "metadata"
                          ? (r.version?.slice(0, 7) ?? "—")
                          : (r.reference ?? "—")}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{formatBytes(r.sizeBytes)}</td>
                      <td className="px-3 py-2.5">
                        <StatePill state={r.state} />
                      </td>
                      <td className="px-3 py-2.5 capitalize">{r.verification.replace("_", " ")}</td>
                      <td className="px-3 py-2.5 capitalize">
                        {r.kind === "database" ? r.restoreTest.replace("_", " ") : "—"}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {r.kind === "database" && r.status === "completed" && neonOk && (
                            <button
                              type="button"
                              disabled={!!busy || !!running}
                              onClick={() =>
                                run("test-" + r.id, () =>
                                  testBackupAdmin({ data: { runId: r.id } }),
                                )
                              }
                              className="rounded-sm border border-border px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-50"
                            >
                              Test
                            </button>
                          )}
                          {r.kind === "metadata" && (
                            <button
                              type="button"
                              onClick={() => void download(r.id)}
                              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:bg-muted/40"
                            >
                              <Download className="h-3 w-3" /> JSON
                            </button>
                          )}
                          <button
                            type="button"
                            aria-expanded={open === r.id}
                            onClick={() => setOpen(open === r.id ? null : r.id)}
                            className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:bg-muted/40"
                          >
                            {open === r.id ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={8} className="px-5 py-4">
                          <CheckList run={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-sm border border-border bg-card p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Scheduled backups
        </h3>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setDraft({ ...settings, enabled: e.target.checked })}
            />
            Enable scheduled backup
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Frequency</span>
            <select
              value={settings.frequency}
              onChange={(e) =>
                setDraft({ ...settings, frequency: e.target.value as "daily" | "weekly" })
              }
              className="h-9 w-full rounded-sm border border-border bg-background px-2"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">
              Keep last {RETENTION_MIN_KEEP}–{RETENTION_MAX_KEEP} backups
            </span>
            <input
              type="number"
              min={RETENTION_MIN_KEEP}
              max={RETENTION_MAX_KEEP}
              value={settings.retentionKeep}
              onChange={(e) => setDraft({ ...settings, retentionKeep: Number(e.target.value) })}
              className="h-9 w-full rounded-sm border border-border bg-background px-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.weeklyVerify}
              onChange={(e) => setDraft({ ...settings, weeklyVerify: e.target.checked })}
            />
            Weekly restore test
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy === "settings"}
            onClick={() => void saveSettings()}
            className="inline-flex h-9 items-center rounded-sm border border-border px-4 text-sm hover:bg-muted/40 disabled:opacity-60"
          >
            Save settings
          </button>
          <p className="text-xs text-muted-foreground">
            Runs once a day at 03:00 UTC when enabled
            {state.integrations.cron
              ? "."
              : " — also needs CRON_SECRET in the Vercel environment."}{" "}
            Only backups older than your retention number are removed, and never fewer than{" "}
            {RETENTION_MIN_KEEP} are kept.
          </p>
        </div>
      </div>
    </div>
  );
}
