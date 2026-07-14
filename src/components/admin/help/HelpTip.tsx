import { useRef, type ReactNode } from "react";
import { HelpCircle, AlertTriangle, ShieldAlert } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminI18n } from "@/lib/admin-i18n";
import { useHelpMode } from "@/hooks/useHelpMode";
import { getHelp, helpText, type HelpSeverity } from "@/lib/admin-help";
import { cn } from "@/lib/utils";

function severityClass(sev?: HelpSeverity) {
  switch (sev) {
    case "danger":
      return "bg-destructive text-destructive-foreground border border-destructive/40";
    case "warning":
      return "bg-amber-500 text-black border border-amber-600";
    default:
      return "bg-primary text-primary-foreground";
  }
}

function SeverityIcon({ sev }: { sev?: HelpSeverity }) {
  if (sev === "danger") return <ShieldAlert className="h-3.5 w-3.5 shrink-0" />;
  if (sev === "warning") return <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
  return null;
}

/**
 * Wraps any element with a tooltip that pulls text from the help registry.
 * Falls back gracefully if the id is missing (no tooltip is rendered).
 *
 * Supports long-press on touch devices to open the tooltip on mobile.
 */
export function HelpTip({
  id,
  children,
  side = "bottom",
  asChild = true,
  className,
}: {
  id: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  asChild?: boolean;
  className?: string;
}) {
  const { lang } = useAdminI18n();
  const entry = getHelp(id);
  const timer = useRef<number | null>(null);

  if (!entry) return <>{children}</>;

  const text = lang === "ar" ? entry.ar : entry.en;

  const startPress = (open: () => void) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(open, 400);
  };
  const endPress = () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger
          asChild={asChild}
          onTouchStart={() => startPress(() => {})}
          onTouchEnd={endPress}
          onTouchCancel={endPress}
        >
          {children as any}
        </TooltipTrigger>
        <TooltipContent side={side} className={cn("max-w-xs text-xs flex items-start gap-1.5", severityClass(entry.severity), className)}>
          <SeverityIcon sev={entry.severity} />
          <span className="leading-snug">{text}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Small inline "?" icon that appears only when Help Mode is ON. */
export function HelpIcon({ id, className }: { id: string; className?: string }) {
  const { helpMode } = useHelpMode();
  if (!helpMode) return null;
  return (
    <HelpTip id={id} asChild={false}>
      <button
        type="button"
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/40 text-[10px] text-muted-foreground hover:bg-accent align-middle",
          className,
        )}
        aria-label="help"
      >
        <HelpCircle className="h-3 w-3" />
      </button>
    </HelpTip>
  );
}

/** Wrap a table column header with a small ? that shows a tooltip on hover. */
export function ColumnHelp({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{children}</span>
      <HelpTip id={id} asChild={false}>
        <span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-muted-foreground/40 text-[9px] text-muted-foreground">
          ?
        </span>
      </HelpTip>
    </span>
  );
}

/**
 * A status badge that automatically shows a tooltip explaining what the status means.
 * Pass a helpId (e.g. "status.new_order") plus the visible label & color classes.
 */
export function HelpBadge({
  id,
  label,
  className,
}: { id: string; label: ReactNode; className?: string }) {
  return (
    <HelpTip id={id} asChild={false}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest cursor-help",
          className,
        )}
      >
        {label}
      </span>
    </HelpTip>
  );
}

/** Standalone rendered help text (used in the Help Content Manager preview). */
export function HelpString({ id }: { id: string }) {
  const { lang } = useAdminI18n();
  return <>{helpText(id, lang)}</>;
}