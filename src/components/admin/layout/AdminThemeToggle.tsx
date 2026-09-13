import { Sun, Moon, Monitor, type LucideIcon } from "lucide-react";
import { useAdminTheme } from "./AdminThemeProvider";
import type { AdminThemeMode } from "@/lib/admin-theme";

const OPTIONS: { mode: AdminThemeMode; label: string; icon: LucideIcon }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Monitor },
];

export function AdminThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useAdminTheme();

  return (
    <div className="inline-flex items-center gap-0.5 rounded-sm border border-border bg-card p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          onClick={() => setMode(opt.mode)}
          aria-pressed={mode === opt.mode}
          title={opt.label}
          className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs transition ${
            mode === opt.mode
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <opt.icon className="h-3.5 w-3.5" />
          {!compact && <span>{opt.label}</span>}
        </button>
      ))}
    </div>
  );
}
