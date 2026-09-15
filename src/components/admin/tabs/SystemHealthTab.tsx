import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getSystemHealthAdmin,
  listErrorLogsAdmin,
  updateErrorLogStatus,
  getGeminiKeysStatusAdmin,
} from "@/lib/db-admin.functions";
import {
  getImageMigrationStatusAdmin,
  setImageMigrationPausedAdmin,
  runImageMigrationBatchAdmin,
  retryFailedImageMigrationAdmin,
  verifyMigratedImagesAdmin,
  listBrokenImagesAdmin,
  bulkRecoverImagesAdmin,
  type MigrationStatusSummary,
  type BrokenImageManifestRow,
} from "@/lib/image-migration.functions";
import { fileToDataUrl } from "./shared";
import { LoadingRows } from "@/components/admin/layout/LoadingState";

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: BrokenImageManifestRow[]): string {
  const headers = [
    "product_id",
    "product_name",
    "category",
    "subcategory",
    "old_image_url",
    "migration_status",
    "required_action",
  ] as const;
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
  return lines.join("\n");
}

function RecoverBrokenImagesSection() {
  const [rows, setRows] = useState<BrokenImageManifestRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Record<string, File>>({});
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async () => setRows(await listBrokenImagesAdmin());
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.product_name.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q) ||
        r.subcategory?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const pickedCount = Object.keys(picked).length;

  const exportManifest = async (format: "csv" | "json") => {
    setExporting(true);
    try {
      const all = rows ?? (await listBrokenImagesAdmin());
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        downloadTextFile(`broken-images-manifest-${stamp}.csv`, toCsv(all), "text/csv");
      } else {
        downloadTextFile(
          `broken-images-manifest-${stamp}.json`,
          JSON.stringify(all, null, 2),
          "application/json",
        );
      }
    } finally {
      setExporting(false);
    }
  };

  const uploadAll = async () => {
    if (pickedCount === 0) return;
    setUploading(true);
    try {
      const byId = new Map(rows?.map((r) => [r.product_id, r]) ?? []);
      const uploads = await Promise.all(
        Object.entries(picked).map(async ([productId, file]) => ({
          productId,
          filename: file.name,
          dataUrl: await fileToDataUrl(file),
          table: byId.get(productId)?.table ?? "posters",
        })),
      );
      const result = await bulkRecoverImagesAdmin({ data: { uploads } });
      if (result.succeeded > 0) toast.success(`${result.succeeded} image(s) recovered`);
      if (result.failed > 0) {
        toast.error(`${result.failed} failed — ${result.errors[0]?.error ?? ""}`);
      }
      setPicked({});
      await load();
    } finally {
      setUploading(false);
    }
  };

  if (!rows) return <LoadingRows count={3} />;

  return (
    <div className="mb-6 rounded-sm border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Recover broken images{" "}
          <span className="text-muted-foreground">({rows.length} need attention)</span>
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => exportManifest("csv")}
            disabled={exporting}
            className="rounded-sm border border-border px-2 py-1 text-xs disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => exportManifest("json")}
            disabled={exporting}
            className="rounded-sm border border-border px-2 py-1 text-xs disabled:opacity-50"
          >
            Export JSON
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No broken images — every product has a working image.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product or category…"
              className="flex-1 rounded-sm border border-border bg-background px-3 py-1.5 text-xs"
            />
            <button
              onClick={uploadAll}
              disabled={uploading || pickedCount === 0}
              className="shrink-0 rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {uploading ? "Uploading…" : `Upload all selected (${pickedCount})`}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-sm border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 border-b border-border bg-card uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Replacement file</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.product_id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{r.product_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.category}
                      {r.subcategory ? ` / ${r.subcategory}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          r.migration_status === "broken_source"
                            ? "text-red-500"
                            : "text-yellow-500"
                        }
                      >
                        {r.migration_status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {picked[r.product_id] ? (
                        <span className="text-emerald-500">{picked[r.product_id].name}</span>
                      ) : (
                        <label className="cursor-pointer text-cyan-500 hover:underline">
                          Choose file
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setPicked((prev) => ({ ...prev, [r.product_id]: file }));
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Pick a replacement file for as many rows as you have originals for, then upload them all
            in one batch — no need to open each product individually.
          </p>
        </>
      )}
    </div>
  );
}

function StorageMigrationSection() {
  const [status, setStatus] = useState<MigrationStatusSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const stopRef = useRef(false);

  const load = async () => setStatus(await getImageMigrationStatusAdmin());
  useEffect(() => {
    load();
  }, []);

  const runLoop = async () => {
    stopRef.current = false;
    setRunning(true);
    try {
      for (;;) {
        if (stopRef.current) break;
        const result = await runImageMigrationBatchAdmin({ data: { batchSize: 8 } });
        await load();
        if (result.paused) {
          setLastBatch("Paused.");
          break;
        }
        if (result.processed === 0) {
          setLastBatch("Nothing left to migrate.");
          break;
        }
        setLastBatch(
          `Batch: ${result.migrated} migrated, ${result.failed} failed, ${result.broken} broken`,
        );
      }
    } finally {
      setRunning(false);
    }
  };

  const pause = async () => {
    stopRef.current = true;
    await setImageMigrationPausedAdmin({ data: { paused: true } });
    await load();
  };

  const resume = async () => {
    await setImageMigrationPausedAdmin({ data: { paused: false } });
    void runLoop();
  };

  const retryFailed = async () => {
    await retryFailedImageMigrationAdmin({ data: {} });
    await load();
    void runLoop();
  };

  const verifyAll = async () => {
    setVerifying(true);
    try {
      for (;;) {
        const result = await verifyMigratedImagesAdmin({ data: { batchSize: 15 } });
        await load();
        if (result.verified + result.reFailed === 0) break;
      }
    } finally {
      setVerifying(false);
    }
  };

  if (!status) return <LoadingRows count={2} />;

  const t = status.total;
  const totalFiles = t.not_applicable + t.pending + t.migrated + t.failed + t.broken_source;
  const tiles = [
    { label: "Total files", value: totalFiles },
    { label: "Migrated", value: t.migrated, cls: "text-green-500" },
    { label: "Pending", value: t.pending, cls: "text-yellow-500" },
    { label: "Failed", value: t.failed, cls: "text-orange-500" },
    { label: "Broken source (unrecoverable)", value: t.broken_source, cls: "text-red-500" },
  ];

  return (
    <div className="mb-6 rounded-sm border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Storage migration — Vercel Blob → Cloudinary</h3>
        {status.paused && (
          <span className="rounded-sm bg-yellow-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-yellow-500">
            Paused
          </span>
        )}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-sm border border-border p-3">
            <div className={`text-xl font-semibold ${tile.cls ?? ""}`}>{tile.value}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {tile.label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={runLoop}
          disabled={running || t.pending === 0}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {running ? "Migrating…" : "Start migration"}
        </button>
        <button
          onClick={pause}
          disabled={!running}
          className="rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Pause
        </button>
        <button
          onClick={resume}
          disabled={running || !status.paused}
          className="rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Resume
        </button>
        <button
          onClick={retryFailed}
          disabled={running || t.failed === 0}
          className="rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Retry failed ({t.failed})
        </button>
        <button
          onClick={verifyAll}
          disabled={verifying || t.migrated === 0}
          className="rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {verifying ? "Verifying…" : "Verify all images"}
        </button>
        <button onClick={load} className="rounded-sm border border-border px-3 py-1.5 text-xs">
          Refresh
        </button>
      </div>
      {lastBatch && <p className="mt-2 text-xs text-muted-foreground">{lastBatch}</p>}
      {t.broken_source > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Broken-source images were confirmed unrecoverable from Vercel Blob (403 even through the
          authenticated storage API) — original files need to be re-uploaded via "Recover broken
          images" below.
        </p>
      )}
      {t.pending > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          "Start migration" only retries items with a known dead source it can fetch from
          automatically — it will report "nothing to migrate" for the rest of Pending, which is
          normal. Every Pending item (including these) is already listed in "Recover broken images"
          below for a manual upload; each one goes live for customers again the moment you upload
          its replacement there.
        </p>
      )}
    </div>
  );
}

type AdminErrorLog = {
  id: string;
  level: string;
  source: string | null;
  category: string | null;
  message: string;
  stack: string | null;
  url: string | null;
  status: string;
  created_at: string;
};

type GeminiKeyStatusRow = {
  label: string;
  masked: string;
  present: boolean;
  state: "available" | "rate_limited" | "failed" | "disabled" | "unknown";
  requests: number;
  successes: number;
  failures: number;
};

const KEY_STATE_COLOR: Record<GeminiKeyStatusRow["state"], string> = {
  available: "text-green-500",
  rate_limited: "text-yellow-500",
  failed: "text-red-500",
  disabled: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

function GeminiKeysStatusSection() {
  const [keys, setKeys] = useState<GeminiKeyStatusRow[] | null>(null);

  const load = async () => setKeys((await getGeminiKeysStatusAdmin()) as GeminiKeyStatusRow[]);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const present = keys?.filter((k) => k.present) ?? [];

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">AI image analysis keys (Gemini)</h3>
        <button onClick={load} className="text-xs text-cyan-500 hover:underline">
          Refresh
        </button>
      </div>
      {keys === null ? (
        <LoadingRows count={2} />
      ) : present.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Gemini API keys configured — bulk upload AI title/SEO generation is disabled.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-card uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Key</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Requests</th>
                <th className="px-3 py-2">Success</th>
                <th className="px-3 py-2">Failures</th>
              </tr>
            </thead>
            <tbody>
              {present.map((k) => (
                <tr key={k.label} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono">
                    {k.label} <span className="text-muted-foreground">{k.masked}</span>
                  </td>
                  <td className={`px-3 py-2 font-medium ${KEY_STATE_COLOR[k.state]}`}>{k.state}</td>
                  <td className="px-3 py-2">{k.requests}</td>
                  <td className="px-3 py-2">{k.successes}</td>
                  <td className="px-3 py-2">{k.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border bg-card p-2 text-[10px] text-muted-foreground">
            Requests automatically rotate to the next key once one is rate-limited or fails — counts
            reset when the server restarts, so treat this as a live snapshot, not full history.
          </p>
        </div>
      )}
    </div>
  );
}

export function SystemHealthTab() {
  const [stats, setStats] = useState<{
    posterCount: number;
    categoryCount: number;
    orderCount: number;
    openErrorCount: number;
  } | null>(null);
  const [logs, setLogs] = useState<AdminErrorLog[] | null>(null);
  const [filter, setFilter] = useState<"open" | "resolved" | "">("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    const [h, l] = await Promise.all([
      getSystemHealthAdmin(),
      listErrorLogsAdmin({ data: filter ? { status: filter } : {} }),
    ]);
    setStats(h);
    setLogs(l as AdminErrorLog[]);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const resolve = async (id: string) => {
    await updateErrorLogStatus({ data: { id, status: "resolved" } });
    load();
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">System health</h2>
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Products", value: stats.posterCount },
            { label: "Categories", value: stats.categoryCount },
            { label: "Orders", value: stats.orderCount },
            { label: "Open errors", value: stats.openErrorCount },
          ].map((s) => (
            <div key={s.label} className="rounded-sm border border-border p-4">
              <div className="text-2xl font-semibold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <StorageMigrationSection />
      <RecoverBrokenImagesSection />

      <GeminiKeysStatusSection />

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Error logs
        </h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "open" | "resolved" | "")}
          className="rounded-sm border border-border bg-background px-3 py-1.5 text-xs"
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="">All</option>
        </select>
      </div>

      {logs === null ? (
        <LoadingRows />
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No errors logged.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-sm border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                        log.level === "critical" || log.level === "error"
                          ? "bg-red-500/15 text-red-500"
                          : "bg-accent text-muted-foreground"
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-xs text-muted-foreground">{log.source ?? "unknown"}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    className="mt-1 text-left text-sm hover:underline"
                  >
                    {log.message}
                  </button>
                  {expanded === log.id && (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {log.url && <div>URL: {log.url}</div>}
                      {log.stack && (
                        <pre className="overflow-x-auto whitespace-pre-wrap">{log.stack}</pre>
                      )}
                    </div>
                  )}
                </div>
                {log.status === "open" && (
                  <button
                    onClick={() => resolve(log.id)}
                    className="shrink-0 text-xs text-cyan-500 hover:underline"
                  >
                    Mark resolved
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
