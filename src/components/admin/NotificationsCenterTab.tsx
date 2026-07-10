import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2, ExternalLink, Filter, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  deleteNotification,
  fetchNotifications,
  markAllRead,
  markRead,
  markResolved,
  PRIORITY_STYLES,
  timeAgo,
  TYPE_LABEL,
  type AdminNotification,
} from "@/lib/notifications-center";
import { supabase } from "@/integrations/supabase/client";

type SummaryCards = {
  unread_total: number;
  critical_open: number;
  high_open: number;
  new_orders_today: number;
  errors_24h: number;
  low_quality_24h: number;
  upload_failures_24h: number;
};

export function NotificationsCenterTab() {
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-notif-list", { unreadOnly, type, priority, search }],
    queryFn: () => fetchNotifications({ limit: 200, unreadOnly, type, priority, search }),
  });

  const { data: summary } = useQuery({
    queryKey: ["admin-notif-summary"],
    queryFn: async (): Promise<SummaryCards> => {
      const { data } = await supabase.rpc("admin_notifications_summary" as never);
      return (data as unknown as SummaryCards) ?? {
        unread_total: 0,
        critical_open: 0,
        high_open: 0,
        new_orders_today: 0,
        errors_24h: 0,
        low_quality_24h: 0,
        upload_failures_24h: 0,
      };
    },
    refetchInterval: 30_000,
  });

  const typeOptions = useMemo(() => {
    const set = new Set(items.map((i) => i.type));
    return ["all", ...Array.from(set)];
  }, [items]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
    qc.invalidateQueries({ queryKey: ["admin-notif-unread"] });
    qc.invalidateQueries({ queryKey: ["admin-notif-recent"] });
    qc.invalidateQueries({ queryKey: ["admin-notif-summary"] });
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <SummaryCard label="Unread" value={summary?.unread_total ?? 0} tone="blue" />
        <SummaryCard label="Critical" value={summary?.critical_open ?? 0} tone="red" />
        <SummaryCard label="High" value={summary?.high_open ?? 0} tone="orange" />
        <SummaryCard label="Orders today" value={summary?.new_orders_today ?? 0} tone="green" />
        <SummaryCard label="Errors 24h" value={summary?.errors_24h ?? 0} tone="red" />
        <SummaryCard label="Low-quality 24h" value={summary?.low_quality_24h ?? 0} tone="amber" />
        <SummaryCard label="Upload fails 24h" value={summary?.upload_failures_24h ?? 0} tone="amber" />
      </div>

      {/* Filters */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications…"
              className="w-full rounded-sm border border-border bg-background ps-8 pe-3 py-2 text-sm"
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "All types" : TYPE_LABEL[t] ?? t}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
          <button
            type="button"
            onClick={async () => {
              await markAllRead();
              invalidateAll();
              toast.success("All marked as read");
            }}
            className="ms-auto inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-md border border-border bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
            <Bell className="h-8 w-8" />
            <div className="text-sm">No notifications match these filters.</div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                onChange={invalidateAll}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "red" | "orange" | "green" | "amber";
}) {
  const tones: Record<typeof tone, string> = {
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-300",
    red: "border-red-500/30 bg-red-500/5 text-red-300",
    orange: "border-orange-500/30 bg-orange-500/5 text-orange-300",
    green: "border-green-500/30 bg-green-500/5 text-green-300",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-300",
  };
  return (
    <div className={cn("rounded-md border p-3", tones[tone])}>
      <div className="text-[10px] uppercase tracking-widest opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function NotificationRow({ n, onChange }: { n: AdminNotification; onChange: () => void }) {
  const st = PRIORITY_STYLES[n.priority] ?? PRIORITY_STYLES.medium;
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", !n.read_at && "bg-accent/20")}>
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", st.dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{n.title}</div>
            {n.body && <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
              <span className={cn("rounded px-1.5 py-0.5 font-semibold", st.badge)}>{st.label}</span>
              <span className="rounded bg-accent px-1.5 py-0.5 text-muted-foreground">
                {TYPE_LABEL[n.type] ?? n.type}
              </span>
              <span className="text-muted-foreground">{timeAgo(n.created_at)} ago</span>
              {n.read_at && <span className="text-muted-foreground">• Read</span>}
              {n.resolved_at && <span className="text-green-400">• Resolved</span>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {n.link && (
              <a
                href={n.link}
                onClick={async (e) => {
                  if (!n.read_at) {
                    e.preventDefault();
                    await markRead([n.id]);
                    onChange();
                    window.location.href = n.link!;
                  }
                }}
                className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[10px] font-semibold uppercase text-primary-foreground"
              >
                Open <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {!n.read_at && (
              <button
                type="button"
                onClick={async () => {
                  await markRead([n.id]);
                  onChange();
                }}
                className="rounded-sm border border-border p-1.5 hover:bg-accent"
                title="Mark read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </button>
            )}
            {!n.resolved_at && (
              <button
                type="button"
                onClick={async () => {
                  await markResolved(n.id);
                  onChange();
                }}
                className="rounded-sm border border-border px-2 py-1 text-[10px] font-semibold uppercase hover:bg-accent"
                title="Mark resolved"
              >
                Resolve
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Delete this notification?")) return;
                await deleteNotification(n.id);
                onChange();
              }}
              className="rounded-sm border border-border p-1.5 text-red-400 hover:bg-red-500/10"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

// Silence unused import warning for Filter (kept for future group-by feature)
void Filter;