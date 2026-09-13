import { useMemo, useState } from "react";
import { Search, X, Megaphone } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NAV_GROUPS, MARKETING_NOT_CONNECTED, type Tab } from "./nav-config";

function matches(query: string, label: string, keywords?: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (label.toLowerCase().includes(q)) return true;
  return (keywords ?? []).some((k) => k.toLowerCase().includes(q));
}

export function AdminSidebar({
  activeTab,
  onNavigate,
}: {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
}) {
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return NAV_GROUPS;
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => matches(query, item.label, item.keywords)),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
            <span className="text-display text-xs">BW</span>
          </div>
          <span className="text-display text-sm tracking-wide group-data-[collapsible=icon]:hidden">
            BRWAZWNEON
          </span>
        </div>
        <div className="relative px-0 group-data-[collapsible=icon]:hidden">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            placeholder="Search navigation…"
            className="pl-7"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeTab === item.id}
                      tooltip={item.label}
                      onClick={() => onNavigate(item.id)}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {group.id === "marketing" &&
                  MARKETING_NOT_CONNECTED.map((m) => (
                    <SidebarMenuItem key={m.label}>
                      <SidebarMenuButton
                        disabled
                        tooltip={`${m.label} — not connected yet`}
                        className="opacity-50"
                      >
                        <m.icon />
                        <span>{m.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {filteredGroups.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">No matches.</p>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground group-data-[collapsible=icon]:hidden">
          <Megaphone className="h-3 w-3" />
          <span>Marketing: not connected</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
