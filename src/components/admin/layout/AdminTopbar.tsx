import { useState } from "react";
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

export function AdminTopbar({
  activeTab,
  onOpenCommandPalette,
  onSignOut,
}: {
  activeTab: Tab;
  onOpenCommandPalette: () => void;
  onSignOut: () => void;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const found = findNavItem(activeTab);

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
                <BreadcrumbLink href="#" onClick={(e) => e.preventDefault()} className="cursor-default">
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

      <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="relative rounded-sm border border-border p-1.5 text-muted-foreground transition hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            Not connected yet — no live event feed is wired up.
          </div>
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
