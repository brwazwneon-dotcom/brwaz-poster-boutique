// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupCenterState, BackupRunView } from "@/lib/backup-center.functions";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({
  state: vi.fn(),
  create: vi.fn(),
  test: vi.fn(),
  advance: vi.fn(),
  save: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/backup-center.functions", () => ({
  getBackupCenterAdmin: fns.state,
  createBackupAdmin: fns.create,
  testBackupAdmin: fns.test,
  advanceBackupsAdmin: fns.advance,
  saveBackupSettingsAdmin: fns.save,
  downloadRecoverySnapshotAdmin: fns.download,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BackupCenterTab } from "./BackupCenterTab";

const settings = {
  enabled: false,
  frequency: "daily" as const,
  retentionKeep: 7,
  weeklyVerify: true,
};
const run = (o: Partial<BackupRunView>): BackupRunView => ({
  id: "11111111-1111-1111-1111-111111111111",
  kind: "database",
  status: "completed",
  state: "verified",
  version: "br-1",
  reference: "brw-backup-20261006-030000",
  sizeBytes: 52_428_800,
  verification: "verified",
  restoreTest: "not_tested",
  step: null,
  createdAt: "2026-10-06T03:00:00.000Z",
  completedAt: "2026-10-06T03:01:00.000Z",
  triggeredBy: "admin",
  error: null,
  checks: [],
  restoredCounts: null,
  restoreReason: null,
  note: null,
  ...o,
});
const ok = (o: Partial<Extract<BackupCenterState, { ok: true }>> = {}): BackupCenterState => ({
  ok: true,
  integrations: { neon: true, github: false, cron: false },
  settings,
  production: {
    repo: "o/r",
    commit: "bd78ddc611ac91125ef43895ca3532a7fb3fefcf",
    branch: "fix/order-item-images",
    deploymentId: "dpl_1",
    buildId: "b",
  },
  runs: [],
  inFlight: false,
  ...o,
});

let root: Root | null = null;
let container: HTMLElement;
async function mount(ui: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(ui);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
const button = (label: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as
    HTMLButtonElement | undefined;

beforeEach(() => Object.values(fns).forEach((f) => f.mockReset()));
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
});

describe("Backup Center tab", () => {
  it("without Neon keys it says why and disables the database actions (never pretends)", async () => {
    fns.state.mockResolvedValue(ok({ integrations: { neon: false, github: false, cron: false } }));
    await mount(<BackupCenterTab />);
    expect(container.textContent).toContain("Database backups are not connected yet");
    expect(container.textContent).toContain("NEON_API_KEY");
    expect(button("Backup database")?.disabled).toBe(true);
    expect(button("Test latest backup")?.disabled).toBe(true);
    expect(button("Backup source")?.disabled).toBe(false);
    expect(container.textContent).toContain("No backups yet.");
  });

  it("history shows real states and only says Verified / passed when the data says so", async () => {
    fns.state.mockResolvedValue(
      ok({
        runs: [
          run({
            id: "a1111111-1111-1111-1111-111111111111",
            state: "restore_passed",
            restoreTest: "passed",
            checks: [{ id: "tables", label: "Required tables present", ok: true }],
          }),
          run({
            id: "b1111111-1111-1111-1111-111111111111",
            state: "completed",
            verification: "not_verified",
            reference: "brw-backup-old",
          }),
          run({
            id: "c1111111-1111-1111-1111-111111111111",
            state: "restore_failed",
            restoreTest: "failed",
            restoreReason: "One or more checks failed",
            checks: [
              { id: "data", label: "Critical data present", ok: false, detail: "empty: posters" },
            ],
          }),
          run({
            id: "d1111111-1111-1111-1111-111111111111",
            kind: "source",
            state: "completed",
            verification: "not_verified",
            version: "bd78ddc611ac",
            reference: "backup-2026-10-06-bd78ddc",
            note: "Add a read-only GITHUB_TOKEN to verify the tag on GitHub.",
          }),
        ],
      }),
    );
    await mount(<BackupCenterTab />);
    const t = container.textContent ?? "";
    expect(t).toContain("Restore test passed");
    expect(t).toContain("Restore test failed");
    expect(t).toContain("Completed");
    expect(t).toContain("50 MB");
    expect(t).toContain("brw-backup-20261006-030000");
    // an unverified source reference is shown as not verified
    expect(t).toMatch(/Source backup[\s\S]*Not verified/);
    // details expose check results and the failure reason
    await act(async () => {
      [...container.querySelectorAll("button")]
        .filter((b) => b.textContent?.includes("Details"))[2]
        .click();
    });
    expect(container.textContent).toContain("empty: posters");
    expect(container.textContent).toContain("Restore failed. Reason: One or more checks failed");
  });

  it("Create full backup calls the server once and refreshes", async () => {
    fns.state.mockResolvedValue(ok());
    fns.create.mockResolvedValue({
      ok: true,
      started: ["recovery snapshot", "source reference", "database backup"],
    });
    await mount(<BackupCenterTab />);
    await act(async () => {
      button("Create full backup")!.click();
    });
    expect(fns.create).toHaveBeenCalledWith({ data: { kind: "full" } });
    expect(fns.state.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("shows live progress while a test runs and polls the server to advance it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fns.state.mockResolvedValue(
        ok({
          inFlight: true,
          runs: [run({ state: "running", restoreTest: "running", step: "test_wait" })],
        }),
      );
      fns.advance.mockResolvedValue({ advanced: 1 });
      await mount(<BackupCenterTab />);
      expect(container.querySelector("[role=status]")?.textContent).toContain("Testing backup");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4500);
      });
      expect(fns.advance).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains a missing migration", async () => {
    fns.state.mockResolvedValue({
      ok: false,
      reason: "migration_missing",
      message: "Backup history is not set up yet: database migration 027 has not been applied.",
    });
    await mount(<BackupCenterTab />);
    expect(container.querySelector("[role=alert]")?.textContent).toContain("migration 027");
  });

  it("does nothing while hidden", async () => {
    await mount(<BackupCenterTab active={false} />);
    expect(fns.state).not.toHaveBeenCalled();
  });
});
