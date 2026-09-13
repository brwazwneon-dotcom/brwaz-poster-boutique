import { useEffect } from "react";
import { ExternalLink, LogOut } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { NAV_GROUPS, type Tab } from "./nav-config";

export function AdminCommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (tab: Tab) => void;
  onSignOut: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const go = (tab: Tab) => {
    onNavigate(tab);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a page…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {NAV_GROUPS.map((group) => (
          <CommandGroup key={group.id} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} ${(item.keywords ?? []).join(" ")}`}
                onSelect={() => go(item.id)}
              >
                <item.icon />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="General">
          <CommandItem
            value="view website preview storefront"
            onSelect={() => {
              window.open("/", "_blank", "noopener,noreferrer");
              onOpenChange(false);
            }}
          >
            <ExternalLink />
            <span>View website</span>
          </CommandItem>
          <CommandItem
            value="sign out logout"
            onSelect={() => {
              onOpenChange(false);
              onSignOut();
            }}
          >
            <LogOut />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-end gap-1 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>Close</span>
        <CommandShortcut className="static ml-0">Esc</CommandShortcut>
      </div>
    </CommandDialog>
  );
}
