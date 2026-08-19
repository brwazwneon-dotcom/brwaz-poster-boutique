import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Zap, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { trackEvent, trackCustom } from "@/lib/meta-pixel";
import { useMarketingConfig } from "@/lib/use-marketing";
import { cn } from "@/lib/utils";

type LastEvent = { name: string; route: string; at: number } | null;

type PixelDebugWindow = Window & {
  __brwz_pixel_loaded?: boolean;
  __brwz_pixel_id?: string;
  fbq?: unknown;
};

function isAdminPath(p: string) {
  return p === "/admin" || p.startsWith("/admin/");
}

/**
 * Live debug panel for Meta Pixel — mirrors what Meta Pixel Helper sees.
 * Reports pixel-id / script / fbq state independently so a missing script
 * can never be silently marked as "configured".
 */
export function MetaPixelDebugCard() {
  const cfg = useMarketingConfig();
  const [now, setNow] = useState(0);
  const [lastEvent, setLastEvent] = useState<LastEvent>(null);

  // Ping every 1.5s to refresh the fbq-loaded / script-injected reading
  // without needing full page state.
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1), 1500);
    return () => clearInterval(t);
  }, []);
  void now;

  const state = useMemo(() => {
    const w: PixelDebugWindow | null = typeof window !== "undefined" ? window : null;
    const route = typeof window !== "undefined" ? window.location.pathname : "";
    const scriptTag =
      typeof document !== "undefined"
        ? !!document.querySelector('script[src*="connect.facebook.net/en_US/fbevents.js"]')
        : false;
    return {
      route,
      isAdmin: isAdminPath(route),
      pixelId: cfg.pixelId || null,
      pixelIdConfigured: !!cfg.pixelId && /^\d{6,20}$/.test(cfg.pixelId),
      pixelEnabled: cfg.pixelEnabled,
      scriptInjected: scriptTag || !!w?.__brwz_pixel_loaded,
      fbqLoaded: !!w?.fbq,
      currentPixelInMemory: (w?.__brwz_pixel_id as string) || null,
    };
  }, [cfg.pixelId, cfg.pixelEnabled, now]);

  const fire = (name: string, run: () => void) => {
    try {
      run();
      const route = typeof window !== "undefined" ? window.location.pathname : "";
      setLastEvent({ name, route, at: Date.now() });
      toast.success(`Fired ${name} on ${route || "?"}`);
    } catch (e) {
      toast.error(`${name} failed: ${(e as Error).message}`);
    }
  };

  const openIn = (path: string) => {
    if (typeof window === "undefined") return;
    window.open(path, "_blank", "noopener");
  };

  const statusRow = (label: string, ok: boolean, help?: string) => (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div>
        <div>{label}</div>
        {help && <div className="text-[10px] text-muted-foreground">{help}</div>}
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest",
          ok
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
            : "border-amber-500/40 bg-amber-500/10 text-amber-600",
        )}
      >
        {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        {ok ? "OK" : "Not detected"}
      </span>
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Zap className="h-4 w-4" />
          Meta Pixel — Live Debug
        </div>
        <button
          onClick={() => setNow((n) => n + 1)}
          className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Current context
        </div>
        <div className="flex items-center justify-between text-xs">
          <span>Route</span>
          <span className="font-mono">{state.route || "—"}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span>Public route?</span>
          <span>{state.isAdmin ? "No (admin — pixel skipped)" : "Yes"}</span>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Pixel status
        </div>
        {statusRow(
          "Pixel ID configured",
          state.pixelIdConfigured,
          state.pixelId ? `ID: ${state.pixelId}` : "Add your Pixel ID in Marketing settings",
        )}
        {statusRow(
          "Pixel enabled by admin",
          state.pixelEnabled,
          state.pixelEnabled ? "Toggle is ON" : "Toggle is OFF — no tracking will run",
        )}
        {statusRow(
          "Pixel script injected",
          state.scriptInjected,
          "connect.facebook.net/en_US/fbevents.js",
        )}
        {statusRow("fbq() loaded in browser", state.fbqLoaded, "The global fbq function is ready")}
        {statusRow(
          "Current page tracking active",
          !state.isAdmin && state.pixelEnabled && state.fbqLoaded,
          state.isAdmin ? "Disabled on /admin by design" : "Requires all of the above",
        )}
        {statusRow(
          "Cart tracking",
          !state.isAdmin && state.pixelEnabled && state.fbqLoaded,
          "Fires ViewCart / AddToCart / CartUpdated / RemoveFromCart",
        )}
        {statusRow(
          "Checkout tracking",
          !state.isAdmin && state.pixelEnabled && state.fbqLoaded,
          "Fires InitiateCheckout / Lead / AddPhoneNumber / Purchase",
        )}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Last event
        </div>
        {lastEvent ? (
          <div className="text-xs">
            <div>
              <span className="text-muted-foreground">Name:</span>{" "}
              <span className="font-mono">{lastEvent.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Route:</span>{" "}
              <span className="font-mono">{lastEvent.route}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Time:</span>{" "}
              {new Date(lastEvent.at).toLocaleTimeString()}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            No event fired yet in this session.
          </div>
        )}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Test buttons
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TestBtn label="Open Home + fire PageView" onClick={() => openIn("/?_pixeltest=1")} />
          <TestBtn label="Open Cart + fire ViewCart" onClick={() => openIn("/cart?_pixeltest=1")} />
          <TestBtn
            label="Fire PageView now"
            onClick={() => fire("PageView", () => trackEvent("PageView"))}
          />
          <TestBtn
            label="Fire AddToCart (test)"
            onClick={() =>
              fire("AddToCart", () =>
                trackEvent("AddToCart", {
                  content_ids: ["test-poster"],
                  content_name: "Test Poster",
                  content_type: "product",
                  content_category: "Test",
                  value: 100,
                  currency: "EGP",
                  quantity: 1,
                }),
              )
            }
          />
          <TestBtn
            label="Fire InitiateCheckout"
            onClick={() =>
              fire("InitiateCheckout", () =>
                trackEvent("InitiateCheckout", {
                  value: 100,
                  currency: "EGP",
                  num_items: 1,
                }),
              )
            }
          />
          <TestBtn
            label="Fire ViewCart"
            onClick={() =>
              fire("ViewCart", () =>
                trackCustom("ViewCart", {
                  value: 100,
                  currency: "EGP",
                }),
              )
            }
          />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Test results appear in Meta Events Manager under "Test Events" and in the Meta Pixel
          Helper browser extension.
        </p>
      </div>
    </div>
  );
}

function TestBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm border border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent text-left"
    >
      {label}
    </button>
  );
}
