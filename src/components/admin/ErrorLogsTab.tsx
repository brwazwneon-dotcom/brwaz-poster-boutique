import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  RefreshCcw,
  Search,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  copyErrorDetails,
  fetchErrorLogs,
  humanizeError,
  levelToSeverity,
  relatedEntity,
  setErrorLogStatus,
  SEVERITY_STYLES,
  STATUS_STYLES,
  type ErrorLog,
  type ErrorSeverity,
  type ErrorStatus,
} from "@/lib/error-logs";
import { runBugDetector } from "@/lib/bug-detector";

const PAGE_SIZE = 25;

export function ErrorLogsTab() {
  const qc = useQueryClient();
  const [severity, setSeverity] = useState<ErrorSeverity | "all">("all");
  const [status, setStatus] = useState<ErrorStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["error-logs", { severity, status, search, page }],
    queryFn: () =>
      fetchErrorLogs({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        severity,
        status,
        search: search.trim() || undefined,
      }),
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];
  const total = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const counts = useCounts();

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await runBugDetector();
      toast.success(`تم الفحص. ${res.created} مشكلة جديدة.`);
      qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
      qc.invalidateQueries({ queryKey: ["admin-notif-summary"] });
      qc.invalidateQueries({ queryKey: ["error-logs"] });
    } catch (e) {
      toast.error("فشل الفحص: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setScanning(false);
    }
  };

  const changeStatus = async (id: string, s: ErrorStatus) => {
    try {
      await setErrorLogStatus(id, s);
      toast.success(s === "resolved" ? "تم الحل" : "تم التحديث");
      refetch();
      qc.invalidateQueries({ queryKey: ["admin-notif-summary"] });
    } catch (e) {
      toast.error("فشل التحديث");
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Critical Errors"
          value={counts.critical}
          tone="red"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="High"
          value={counts.high}
          tone="orange"
        />
        <StatCard icon={<Bug className="h-4 w-4" />} label="Open" value={counts.open} tone="blue" />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Resolved (24h)"
          value={counts.resolved24h}
          tone="green"
        />
      </div>

      {/* Filters */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="ابحث في الأخطاء…"
              className="w-full rounded-sm border border-border bg-background ps-8 pe-3 py-2 text-sm"
            />
          </div>
          <select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as ErrorSeverity | "all");
              setPage(0);
            }}
            className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ErrorStatus | "all");
              setPage(0);
            }}
            className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            type="button"
            disabled={scanning}
            onClick={runScan}
            className="ms-auto inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" /> {scanning ? "Scanning…" : "Run Bug Scan"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-md border border-border bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 text-green-400" />
            <div className="text-sm">لا توجد أخطاء مطابقة. الموقع يعمل بشكل جيد.</div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((log) => (
              <ErrorLogRow
                key={log.id}
                log={log}
                open={openId === log.id}
                onToggle={() => setOpenId((c) => (c === log.id ? null : log.id))}
                onChangeStatus={changeStatus}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            صفحة {page + 1} من {pages} — إجمالي {total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs disabled:opacity-40 hover:bg-accent"
            >
              <ChevronRight className="h-3.5 w-3.5 rtl:hidden" />
              <ChevronLeft className="h-3.5 w-3.5 ltr:hidden" />
              السابق
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs disabled:opacity-40 hover:bg-accent"
            >
              التالي
              <ChevronLeft className="h-3.5 w-3.5 rtl:hidden" />
              <ChevronRight className="h-3.5 w-3.5 ltr:hidden" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function useCounts() {
  const { data } = useQuery({
    queryKey: ["error-logs-counts"],
    queryFn: async () => {
      const [critical, high, open, resolved24h] = await Promise.all([
        fetchErrorLogs({ severity: "critical", status: "all", limit: 1 }),
        fetchErrorLogs({ severity: "high", status: "all", limit: 1 }),
        fetchErrorLogs({ severity: "all", status: "open", limit: 1 }),
        fetchErrorLogs({ severity: "all", status: "resolved", limit: 1 }),
      ]);
      return {
        critical: critical.count,
        high: high.count,
        open: open.count,
        resolved24h: resolved24h.count,
      };
    },
    refetchInterval: 60_000,
  });
  return data ?? { critical: 0, high: 0, open: 0, resolved24h: 0 };
}

function ErrorLogRow({
  log,
  open,
  onToggle,
  onChangeStatus,
}: {
  log: ErrorLog;
  open: boolean;
  onToggle: () => void;
  onChangeStatus: (id: string, s: ErrorStatus) => void;
}) {
  const sev = levelToSeverity(log.level);
  const sevStyle = SEVERITY_STYLES[sev];
  const statusStyle = STATUS_STYLES[log.status] ?? STATUS_STYLES.open;
  const { title, description } = humanizeError(log);
  const related = relatedEntity(log);
  const time = new Date(log.created_at);

  return (
    <li className={cn("px-4 py-3", log.status === "resolved" && "opacity-60")}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", sevStyle.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className={cn("rounded border px-1.5 py-0.5 font-semibold", sevStyle.badge)}>
                  {sevStyle.label}
                </span>
                <span
                  className={cn("rounded border px-1.5 py-0.5 font-semibold", statusStyle.badge)}
                >
                  {statusStyle.label}
                </span>
                {log.category && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-muted-foreground">
                    {log.category}
                  </span>
                )}
                {log.url && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-muted-foreground truncate max-w-[220px]">
                    {new URL(log.url, window.location.origin).pathname}
                  </span>
                )}
                <span className="text-muted-foreground">{time.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {related && (
                <a
                  href={related.link}
                  className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
                >
                  <ExternalLink className="h-3 w-3" />
                  {related.type === "order" ? "الأوردر" : "العميل"}
                </a>
              )}
              <button
                type="button"
                onClick={onToggle}
                className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
              >
                {open ? "إخفاء" : "التفاصيل"}
              </button>
              <button
                type="button"
                onClick={() => {
                  copyErrorDetails(log);
                  toast.success("تم النسخ");
                }}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
              >
                <Copy className="h-3 w-3" /> نسخ
              </button>
              {log.status !== "resolved" && (
                <button
                  type="button"
                  onClick={() => onChangeStatus(log.id, "resolved")}
                  className="inline-flex items-center gap-1 rounded-sm bg-green-500/20 border border-green-500/40 px-2 py-1 text-[10px] uppercase tracking-widest text-green-300 hover:bg-green-500/30"
                >
                  <CheckCircle2 className="h-3 w-3" /> حل
                </button>
              )}
              {log.status === "open" && (
                <button
                  type="button"
                  onClick={() => onChangeStatus(log.id, "in_progress")}
                  className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
                >
                  قيد المعالجة
                </button>
              )}
            </div>
          </div>

          {open && (
            <details
              open
              className="mt-3 rounded-sm border border-border bg-background/50 p-3 text-xs"
            >
              <summary className="cursor-pointer select-none text-[10px] uppercase tracking-widest text-muted-foreground">
                Technical Details
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Message
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px]">
                    {log.message}
                  </div>
                </div>
                {log.stack && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Stack
                    </div>
                    <pre className="mt-0.5 max-h-64 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] leading-relaxed">
                      {log.stack}
                    </pre>
                  </div>
                )}
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Metadata
                    </div>
                    <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] leading-relaxed">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                  <div>Source: {log.source}</div>
                  <div>Level: {log.level}</div>
                  {log.visitor_id && <div>Visitor: {log.visitor_id.slice(0, 12)}</div>}
                  {log.user_agent && <div className="truncate">UA: {log.user_agent}</div>}
                </div>
              </div>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "red" | "orange" | "blue" | "green";
}) {
  const tones: Record<typeof tone, string> = {
    red: "border-red-500/30 bg-red-500/5 text-red-300",
    orange: "border-orange-500/30 bg-orange-500/5 text-orange-300",
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-300",
    green: "border-green-500/30 bg-green-500/5 text-green-300",
  };
  return (
    <div className={cn("rounded-md border p-3", tones[tone])}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest opacity-80">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
