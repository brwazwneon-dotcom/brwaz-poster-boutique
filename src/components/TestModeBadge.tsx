import { useTestMode } from "@/lib/test-mode";
import { FlaskConical, X } from "lucide-react";

/**
 * Floating badge shown on every storefront page when the admin has
 * enabled Test Mode. Purely informational — every order placed while
 * on is flagged is_test = true and excluded from analytics/sales.
 */
export function TestModeBadge() {
  const [on, setOn] = useTestMode();
  if (!on) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[70] flex items-center gap-2 rounded-sm border border-primary/60 bg-black/85 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary shadow-[0_0_20px_rgba(255,215,0,0.25)] backdrop-blur">
      <FlaskConical className="h-3.5 w-3.5" />
      <span>Test Mode · orders won't count</span>
      <button
        onClick={() => setOn(false)}
        title="Turn off test mode"
        className="ml-1 rounded p-0.5 text-primary/70 hover:bg-primary/10 hover:text-primary"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}