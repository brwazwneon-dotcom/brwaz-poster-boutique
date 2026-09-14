import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ExternalLink, LogOut, Search, User } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { findNavItem, type Tab } from "./nav-config";
import { AdminThemeToggle } from "./AdminThemeToggle";
import {
  getOrderNotificationsAdmin,
  markOrderNotificationsSeenAdmin,
} from "@/lib/order-ops.functions";

function timeAgoAr(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "الآن";
  if (s < 3600) return `منذ ${Math.floor(s / 60)} د`;
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} س`;
  return `منذ ${Math.floor(s / 86400)} يوم`;
}

export function AdminTopbar({
  activeTab,
  onOpenCommandPalette,
  onSignOut,
  onOpenOrder,
}: {
  activeTab: Tab;
  onOpenCommandPalette: () => void;
  onSignOut: () => void;
  onOpenOrder?: (orderId: string) => void;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const found = findNavItem(activeTab);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin-order-notifications"],
    queryFn: () => getOrderNotificationsAdmin(),
    refetchInterval: 30_000,
  });
  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const openNotifications = async (open: boolean) => {
    setNotifOpen(open);
    if (open && unreadCount > 0) {
      await markOrderNotificationsSeenAdmin();
      qc.invalidateQueries({ queryKey: ["admin-order-notifications"] });
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumb className="hidden sm:block">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#" onClick={(e) => e.preventDefault()} className="cursor-default">
              Admin
            </BreadcrumbLink>
          </BreadcrumbItem>
          {found && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="cursor-default"
                >
                  {found.group.label}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{found.item.label}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex-1" />

      <button
        onClick={onOpenCommandPalette}
        className="flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Search…</span>
        <kbd className="hidden rounded-sm border border-border bg-background px-1 font-mono text-[10px] md:inline">
          ⌘K
        </kbd>
      </button>

      <a
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground sm:flex"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        View website
      </a>

      <AdminThemeToggle compact />

      <DropdownMenu open={notifOpen} onOpenChange={openNotifications}>
        <DropdownMenuTrigger asChild>
          <button
            className="relative rounded-sm border border-border p-1.5 text-muted-foreground transition hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No orders yet.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setNotifOpen(false);
                    onOpenOrder?.(n.id);
                  }}
                  className="flex w-full flex-col gap-0.5 border-b border-border px-2 py-2 text-left last:border-0 hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">
                      {n.status === "new" ? "🔔 طلب جديد" : "طلب"} #{n.orderNumbers.join(", #")}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {timeAgoAr(n.createdAt)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {n.customerName} ·{" "}
                    {n.itemCount > 1
                      ? `${n.itemCount} براويز: ${n.posterTitles.slice(0, 2).join(", ")}${n.itemCount > 2 ? "…" : ""}`
                      : (n.posterTitles[0] ?? "")}
                  </div>
                  <div className="text-xs font-medium">{n.totalPrice} EGP</div>
                </button>
              ))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-1.5 rounded-sm border border-border p-1.5 text-muted-foreground transition hover:text-foreground"
            aria-label="Admin account"
          >
            <User className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Admin</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
