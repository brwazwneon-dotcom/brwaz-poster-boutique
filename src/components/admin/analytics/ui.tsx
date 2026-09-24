import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { PeriodInfo } from "@/lib/analytics-center.types";

/* ---------------- formatting (one place, used by every section) ---------------- */

export const fmtNum = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US");

export const fmtEgp = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${Math.round(n).toLocaleString("en-US")} EGP`;

export const fmtPct = (r: number | null | undefined, digits = 1) =>
  r === null || r === undefined ? "—" : `${(r * 100).toFixed(digits)}%`;

const TZ = "Africa/Cairo";
const dayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const fmtDay = (iso: string) => dayFmt.format(new Date(iso));

/** "12 Sep 2026 – 24 Sep 2026" for [start, end) — end is exclusive. */
export function fmtSpan(startIso: string, endIso: string): string {
  const a = fmtDay(startIso);
  const b = fmtDay(new Date(new Date(endIso).getTime() - 1).toISOString());
  return a === b ? a : `${a} – ${b}`;
}

export const periodLabel = (p: PeriodInfo) => fmtSpan(p.start, p.end);
export const previousLabel = (p: PeriodInfo) => fmtSpan(p.prevStart, p.prevEnd);

/* ---------------- data loading ---------------- */

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ data: s.data, error: null, loading: true }));
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({
            data: null,
            error: e instanceof Error ? e.message : "Failed to load",
            loading: false,
          });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/* ---------------- building blocks ---------------- */

export function Delta({
  current,
  previous,
  lowerIsBetter = false,
  format = fmtNum,
}: {
  current: number | null;
  previous: number | null;
  lowerIsBetter?: boolean;
  /** How the previous value is printed ("was …"); match the tile's own formatter. */
  format?: (n: number | null) => string;
}) {
  if (current === null || previous === null) return null;
  if (previous === 0) {
    return current === 0 ? null : (
      <span className="text-xs text-muted-foreground">new · was 0</span>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) {
    return <span className="text-xs text-muted-foreground">flat · was {format(previous)}</span>;
  }
  const up = pct > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span className={`text-xs ${good ? "text-emerald-500" : "text-red-500"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
      <span className="ml-1 text-muted-foreground">was {format(previous)}</span>
    </span>
  );
}

export function Kpi({
  label,
  value,
  sub,
  hint,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-sm border border-border p-4" title={hint}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      {sub ? <div className="mt-1 min-h-4">{sub}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between gap-2 first:mt-0">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </h3>
      {aside}
    </div>
  );
}

export function EmptyState({
  children = "No data available for this period",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function NotConnected({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-dashed border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  return (
    <div
      className={`rounded-sm border px-3 py-2 text-xs ${
        tone === "warn"
          ? "border-amber-500/30 bg-amber-500/10 text-foreground"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      {children}
    </div>
  );
}

export function Limitations({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <details className="mt-6 rounded-sm border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none font-medium text-foreground">
        What this data can and can't tell you
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </details>
  );
}

export function ErrorState({
  message,
  onRetry,
  title = "Couldn't load this report",
}: {
  message: string;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-sm border border-red-500/30 bg-red-500/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{message}</div>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:bg-accent"
      >
        <RefreshCw className="h-3 w-3" /> Retry
      </button>
    </div>
  );
}

/** Wide tables scroll horizontally on phones instead of breaking the layout. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-border">
      <table className="w-full min-w-[560px] text-left text-sm">{children}</table>
    </div>
  );
}

export const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th
    className={`whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground ${
      right ? "text-right" : ""
    }`}
  >
    {children}
  </th>
);

export const Td = ({
  children,
  right,
  muted,
}: {
  children?: ReactNode;
  right?: boolean;
  muted?: boolean;
}) => (
  <td
    className={`px-3 py-2 ${right ? "text-right tabular-nums" : ""} ${
      muted ? "text-muted-foreground" : ""
    }`}
  >
    {children}
  </td>
);

/** Horizontal bar list — cheap, accessible, no chart library needed. */
export function BarList({
  rows,
  unit = "",
}: {
  rows: { key: string; value: number }[];
  unit?: string;
}) {
  if (rows.length === 0) return <EmptyState />;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} className="text-xs">
          <div className="mb-0.5 flex justify-between gap-2">
            <span className="truncate" dir="auto">
              {r.key}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {fmtNum(r.value)}
              {unit}
            </span>
          </div>
          <div className="h-1.5 rounded-sm bg-accent">
            <div
              className="h-1.5 rounded-sm bg-primary/70"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
              role="presentation"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- export (reuses the site's existing xlsx dependency) ---------------- */

export async function downloadRows(
  rows: Record<string, string | number | null>[],
  filename: string,
  format: "csv" | "xlsx",
): Promise<void> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Data");
  XLSX.writeFile(book, `${filename}.${format}`, { bookType: format });
}
