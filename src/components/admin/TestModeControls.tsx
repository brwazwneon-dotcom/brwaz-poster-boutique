import { useState } from "react";
import { FlaskConical, ShoppingBag } from "lucide-react";
import { setTestMode, useTestMode } from "@/lib/test-mode";
import { cn } from "@/lib/utils";

/**
 * Admin controls: toggle global Test Mode + open the storefront as a
 * simulated buyer. When Test Mode is on, any order the storefront
 * submits is flagged is_test=true and excluded from analytics/sales.
 */
export function TestModeControls() {
  const [on, setOn] = useTestMode();
  const [busy, setBusy] = useState(false);

  const previewAsBuyer = () => {
    setBusy(true);
    setTestMode(true);
    setOn(true);
    // Open the storefront in a new tab. Cart submissions from that tab will
    // pick up the same localStorage flag on this origin.
    window.open("/", "_blank", "noopener");
    setTimeout(() => setBusy(false), 400);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOn(!on)}
        className={cn(
          "inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-[11px] font-semibold uppercase tracking-widest transition",
          on
            ? "border-primary bg-primary/15 text-primary"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
        title="When on, orders placed on this browser are marked as TEST and skipped from analytics."
      >
        <FlaskConical className="h-3.5 w-3.5" />
        Test mode: {on ? "ON" : "OFF"}
      </button>
      <button
        type="button"
        onClick={previewAsBuyer}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-sm border border-primary/50 bg-primary/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-primary hover:bg-primary/20 disabled:opacity-50"
      >
        <ShoppingBag className="h-3.5 w-3.5" />
        Preview as buyer
      </button>
    </div>
  );
}
