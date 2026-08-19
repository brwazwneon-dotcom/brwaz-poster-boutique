import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllRead,
  markRead,
  PRIORITY_STYLES,
  timeAgo,
  type AdminNotification,
} from "@/lib/notifications-center";

export function NotificationBell({ onOpenCenter }: { onOpenCenter?: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { data: unread = 0 } = useQuery({
    queryKey: ["admin-notif-unread"],
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["admin-notif-recent"],
    queryFn: () => fetchNotifications({ limit: 20 }),
    enabled: open,
  });

  // Realtime: refetch and toast on any change.
  useEffect(() => {
    const channel = supabase
      .channel("admin_notifications_bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const n = payload.new as AdminNotification;
          qc.invalidateQueries({ queryKey: ["admin-notif-unread"] });
          qc.invalidateQueries({ queryKey: ["admin-notif-recent"] });
          qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
          if (n.priority === "critical" || n.priority === "high") {
            toast(n.title, {
              description: n.body ?? undefined,
              duration: 8000,
              action: n.link
                ? {
                    label: "Open",
                    onClick: () => {
                      window.location.href = n.link!;
                    },
                  }
                : undefined,
            });
            try {
              const audio = new Audio(
                "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
              );
              audio.volume = 0.3;
              void audio.play().catch(() => {});
            } catch {
              /* noop */
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "admin_notifications" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin-notif-unread"] });
          qc.invalidateQueries({ queryKey: ["admin-notif-recent"] });
          qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const badge = useMemo(() => (unread > 99 ? "99+" : String(unread)), [unread]);

  const openItem = async (n: AdminNotification) => {
    if (!n.read_at) await markRead([n.id]);
    qc.invalidateQueries({ queryKey: ["admin-notif-unread"] });
    qc.invalidateQueries({ queryKey: ["admin-notif-recent"] });
    if (n.link) window.location.href = n.link;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -end-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-[360px] max-w-[92vw] rounded-md border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">Notifications</div>
            <button
              type="button"
              onClick={async () => {
                await markAllRead();
                qc.invalidateQueries({ queryKey: ["admin-notif-unread"] });
                qc.invalidateQueries({ queryKey: ["admin-notif-recent"] });
                qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                No notifications yet.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => {
                  const st = PRIORITY_STYLES[n.priority] ?? PRIORITY_STYLES.medium;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/50",
                          !n.read_at && "bg-accent/20",
                        )}
                      >
                        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", st.dot)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="truncate text-sm font-medium">{n.title}</div>
                            <div className="shrink-0 text-[10px] text-muted-foreground">
                              {timeAgo(n.created_at)}
                            </div>
                          </div>
                          {n.body && (
                            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {n.body}
                            </div>
                          )}
                          {n.link && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                              Open <ExternalLink className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {onOpenCenter && (
            <div className="border-t border-border px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenCenter();
                }}
                className="w-full rounded-sm bg-primary py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
