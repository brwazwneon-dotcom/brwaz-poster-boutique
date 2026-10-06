import { createServerFn } from "@tanstack/react-start";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";
import type { BackupSettings, DisplayState } from "@/lib/backup-center.core";

// Every function here is admin-only (middleware verifies the admin session
// cookie on the server; hiding the tab is not the protection). None of them
// returns a credential, a connection string, or an environment value.

export type BackupRunView = {
  id: string;
  kind: "database" | "source" | "metadata" | string;
  status: string;
  state: DisplayState;
  version: string | null;
  reference: string | null;
  sizeBytes: number | null;
  verification: string;
  restoreTest: string;
  step: string | null;
  createdAt: string;
  completedAt: string | null;
  triggeredBy: string | null;
  error: string | null;
  /** Check results only (labels + pass/fail); never row contents. */
  checks: Array<{ id: string; label: string; ok: boolean; detail?: string }>;
  restoredCounts: Record<string, number> | null;
  restoreReason: string | null;
  note: string | null;
};

export type BackupCenterState =
  | {
      ok: true;
      integrations: { neon: boolean; github: boolean; cron: boolean };
      settings: BackupSettings;
      production: {
        repo: string;
        commit: string | null;
        branch: string | null;
        deploymentId: string | null;
        buildId: string | null;
      };
      runs: BackupRunView[];
      inFlight: boolean;
    }
  | { ok: false; reason: "migration_missing" | "error"; message: string };

type Server = typeof import("@/lib/backup-center.server");

async function server(): Promise<Server> {
  return import("@/lib/backup-center.server");
}

function toView(
  r: Awaited<ReturnType<Server["listRuns"]>>[number],
  displayState: (r: { status: string; verification: string; restore_test: string }) => DisplayState,
): BackupRunView {
  const s = (r.summary ?? {}) as {
    restore?: unknown;
    backupChecks?: unknown[];
    checks?: unknown[];
    note?: unknown;
  };
  const restore = (s.restore ?? null) as {
    checks?: unknown[];
    restoredCounts?: Record<string, number>;
    reason?: string | null;
  } | null;
  const checks = [
    ...((s.backupChecks as unknown[]) ?? []),
    ...((restore?.checks as unknown[]) ?? []),
    ...((s.checks as unknown[]) ?? []),
  ];
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    state: displayState(r),
    version: r.version,
    reference: r.reference,
    sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
    verification: r.verification,
    restoreTest: r.restore_test,
    step: r.step,
    createdAt: new Date(r.created_at).toISOString(),
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    triggeredBy: r.triggered_by,
    error: r.error,
    checks: checks as BackupRunView["checks"],
    restoredCounts: restore?.restoredCounts ?? null,
    restoreReason: restore?.reason ?? null,
    note: typeof s.note === "string" ? s.note : null,
  };
}

export const getBackupCenterAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async (): Promise<BackupCenterState> => {
    const s = await server();
    const core = await import("@/lib/backup-center.core");
    try {
      const [runs, settings] = await Promise.all([s.listRuns(30), s.loadSettings()]);
      const views = runs.map((r) => toView(r, core.displayState));
      return {
        ok: true,
        integrations: s.integrationStatus(),
        settings,
        production: s.productionSourceInfo(),
        runs: views,
        inFlight: views.some((v) => v.state === "running"),
      };
    } catch (e) {
      if (s.isMissingTable(e)) {
        return {
          ok: false,
          reason: "migration_missing",
          message: "Backup history is not set up yet: database migration 027 has not been applied.",
        };
      }
      return { ok: false, reason: "error", message: "Could not load the Backup Center." };
    }
  });

export type ActionResult = { ok: true; started: string[] } | { ok: false; message: string };

/** Starts a backup. `full` = recovery snapshot + source reference + database backup. */
export const createBackupAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => {
    const kind = (data as { kind?: string } | undefined)?.kind;
    if (kind !== "full" && kind !== "database" && kind !== "source" && kind !== "metadata") {
      throw new Error("Invalid backup type");
    }
    return { kind };
  })
  .handler(async ({ data }): Promise<ActionResult> => {
    const s = await server();
    const started: string[] = [];
    try {
      if (data.kind === "full" || data.kind === "metadata") {
        await s.recordMetadataBackup("admin");
        started.push("recovery snapshot");
      }
      if (data.kind === "full" || data.kind === "source") {
        await s.recordSourceBackup("admin");
        started.push("source reference");
      }
      if (data.kind === "full" || data.kind === "database") {
        const r = await s.startDatabaseBackup("admin");
        if (!r.ok) {
          // A full backup still records the parts that worked and says why the database part didn't.
          return data.kind === "database"
            ? { ok: false, message: r.message }
            : { ok: true, started: [...started, `database backup skipped: ${r.message}`] };
        }
        started.push("database backup");
      }
      return { ok: true, started };
    } catch (e) {
      const missing = s.isMissingTable(e);
      return {
        ok: false,
        message: missing
          ? "Backup history is not set up yet: database migration 027 has not been applied."
          : "The backup could not be started.",
      };
    }
  });

export const testBackupAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => {
    const id = (data as { runId?: string } | undefined)?.runId;
    if (id !== undefined && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid backup id");
    return { runId: id ?? null };
  })
  .handler(async ({ data }): Promise<ActionResult> => {
    const s = await server();
    const r = await s.startRestoreTest(data.runId, "admin");
    return r.ok ? { ok: true, started: ["restore test"] } : { ok: false, message: r.message };
  });

/** Polled by the admin page while something is running: advances one step. */
export const advanceBackupsAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    const s = await server();
    try {
      return await s.advanceRuns();
    } catch {
      return { advanced: 0 };
    }
  });

export const saveBackupSettingsAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Partial<BackupSettings>)
  .handler(async ({ data }) => {
    const s = await server();
    return { ok: true as const, settings: await s.saveSettings(data) };
  });

/** The recovery snapshot (JSON, no secrets) for download. */
export const downloadRecoverySnapshotAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => {
    const id = (data as { runId?: string }).runId;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid backup id");
    return { runId: id };
  })
  .handler(async ({ data }) => {
    const s = await server();
    const out = await s.getRecoveryMetadata(data.runId);
    return out ?? { json: "", checksum: "" };
  });
