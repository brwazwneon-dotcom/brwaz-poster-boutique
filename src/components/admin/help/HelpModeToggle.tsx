import { HelpCircle } from "lucide-react";
import { useHelpMode } from "@/hooks/useHelpMode";
import { useAdminI18n } from "@/lib/admin-i18n";
import { HelpTip } from "./HelpTip";
import { cn } from "@/lib/utils";

export function HelpModeToggle() {
  const { helpMode, toggleHelpMode } = useHelpMode();
  const { lang } = useAdminI18n();
  const label = lang === "ar" ? "وضع المساعدة" : "Help Mode";

  return (
    <HelpTip id="help.mode_toggle">
      <button
        type="button"
        onClick={toggleHelpMode}
        aria-pressed={helpMode}
        className={cn(
          "inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-xs uppercase tracking-widest transition-colors",
          helpMode
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border hover:bg-accent",
        )}
      >
        <HelpCircle className="h-4 w-4" />
        <span className="hidden sm:inline">
          {label}
          {helpMode ? " • ON" : ""}
        </span>
      </button>
    </HelpTip>
  );
}
