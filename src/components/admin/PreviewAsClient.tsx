import { useState, useRef, useEffect } from "react";
import {
  Eye,
  ChevronDown,
  Home,
  MapPin,
  Package,
  LayoutGrid,
  Smartphone,
  Tablet,
  Monitor,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { openPreviewWindow, getLastPublicRoute, type PreviewDevice } from "@/lib/preview-mode";
import { cn } from "@/lib/utils";

/**
 * Admin-only "Preview as Client" dropdown. Opens the customer-facing site in a
 * new tab with `?preview=1`, so admins can review edits before publishing
 * without triggering analytics, view counters, notifications or webhooks.
 */
export function PreviewAsClient() {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const preview = async (kind: "home" | "current" | "product" | "collection") => {
    let path = "/";
    if (kind === "home") path = "/";
    else if (kind === "current") path = getLastPublicRoute();
    else if (kind === "product") path = "/sets";
    else if (kind === "collection") {
      const { data } = await supabase
        .from("categories")
        .select("slug")
        .is("parent_id", null)
        .eq("hidden", false)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      path = data?.slug ? `/category/${data.slug}` : "/";
    }
    openPreviewWindow(path, device);
    setOpen(false);
  };

  const devices: { key: PreviewDevice; label: string; Icon: typeof Monitor }[] = [
    { key: "mobile", label: "Mobile", Icon: Smartphone },
    { key: "tablet", label: "Tablet", Icon: Tablet },
    { key: "desktop", label: "Desktop", Icon: Monitor },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-sm border border-yellow-400/50 bg-yellow-400 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-black shadow-sm transition hover:bg-yellow-300"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Eye className="h-4 w-4" aria-hidden />
        Preview as client
        <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-sm border border-border bg-card p-2 shadow-lg"
        >
          <MenuItem Icon={Home} label="Preview homepage" onClick={() => preview("home")} />
          <MenuItem Icon={MapPin} label="Preview current page" onClick={() => preview("current")} />
          <MenuItem Icon={Package} label="Preview product" onClick={() => preview("product")} />
          <MenuItem
            Icon={LayoutGrid}
            label="Preview collection"
            onClick={() => preview("collection")}
          />

          <div className="my-2 border-t border-border" />
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Device
          </div>
          <div className="grid grid-cols-3 gap-1 p-1">
            {devices.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setDevice(key)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-sm border px-2 py-2 text-[10px] font-semibold uppercase tracking-widest transition",
                  device === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 px-2 pb-1 text-[10px] leading-relaxed text-muted-foreground">
            Opens a read-only tab. No analytics, notifications or orders are recorded.
          </p>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  Icon,
  label,
  onClick,
}: {
  Icon: typeof Home;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm text-foreground transition hover:bg-accent"
    >
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      {label}
    </button>
  );
}
