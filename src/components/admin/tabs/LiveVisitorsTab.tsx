import { useCallback, useEffect, useRef, useState } from "react";
import { Globe2, MapPin, Monitor, RefreshCw, Smartphone, Tablet, Users } from "lucide-react";
import { getLiveVisitorsAdmin, type LiveVisitorsResult } from "@/lib/live-visitors.functions";
import { pageLabel, type Tally } from "@/lib/live-visitors-core";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;
const WINDOWS = [
  { seconds: 60, label: "1 min" },
  { seconds: 90, label: "90 sec" },
  { seconds: 180, label: "3 min" },
  { seconds: 300, label: "5 min" },
];

function flag(code: string | null): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function ago(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} sec ago`;
  const m = Math.floor(seconds / 60);
  return `${m} min ago`;
}

function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  accent?: boolean;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-widest">{label}</span>
      </div>
      <div
        className={cn(
          "mt-2 text-3xl font-semibold tabular-nums",
          accent ? "text-emerald-400" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Breakdown({ title, rows, empty }: { title: string; rows: Tally[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate">{r.label}</span>
                <span className="font-mono text-xs tabular-nums">{r.count}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-muted">
                <div
                  className="h-1 rounded-full bg-primary"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;

export function LiveVisitorsTab({ active = true }: { active?: boolean }) {
  const [windowSeconds, setWindowSeconds] = useState(90);
  const [result, setResult] = useState<LiveVisitorsResult | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const r = await getLiveVisitorsAdmin({ data: { windowSeconds } });
      setResult(r);
      setFetchedAt(Date.now());
    } catch {
      setResult({ ok: false, reason: "error", message: "Could not load live visitors." });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [windowSeconds]);

  // Poll only while this tab is on screen AND the browser tab is visible.
  useEffect(() => {
    if (!active) return;
    void load();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [active, load]);

  const snap = result?.ok ? result.snapshot : null;
  const elapsed = Math.max(0, Math.round((now - fetchedAt) / 1000));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-display text-2xl font-semibold">Live visitors</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            People on the website right now. A visitor counts as online while their browser has
            checked in within the last{" "}
            <strong className="text-foreground">
              {snap?.windowSeconds ?? windowSeconds} seconds
            </strong>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="live-window">
            Active window
          </label>
          <select
            id="live-window"
            value={windowSeconds}
            onChange={(e) => setWindowSeconds(Number(e.target.value))}
            className="h-9 rounded-sm border border-border bg-background px-2 text-sm"
          >
            {WINDOWS.map((w) => (
              <option key={w.seconds} value={w.seconds}>
                {w.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-sm border border-border px-3 text-sm hover:bg-muted/40 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {result && !result.ok && (
        <div
          role="alert"
          className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300"
        >
          {result.message}
        </div>
      )}

      {snap && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Currently online" value={snap.online} icon={Users} accent />
            <Stat
              label="Countries"
              value={snap.countries.filter((c) => c.key !== "??").length}
              icon={Globe2}
            />
            <Stat
              label="Cities"
              value={snap.cities.filter((c) => !c.key.endsWith("|")).length}
              icon={MapPin}
            />
            <Stat
              label="Mobile"
              value={snap.devices.mobile + snap.devices.tablet}
              icon={Smartphone}
            />
            <Stat label="Desktop" value={snap.devices.desktop} icon={Monitor} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Breakdown title="Countries" rows={snap.countries} empty="No visitors online." />
            <Breakdown title="Cities" rows={snap.cities} empty="No visitors online." />
            <Breakdown title="Pages being viewed" rows={snap.pages} empty="No visitors online." />
          </div>

          <div className="rounded-sm border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Live visitors
              </h3>
              <span className="text-[11px] text-muted-foreground">
                updated {ago(elapsed)} · refreshes every 10 sec
              </span>
            </div>
            {snap.visitors.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nobody is on the site right now.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                      <th className="px-5 py-2 font-semibold">Location</th>
                      <th className="px-3 py-2 font-semibold">Page</th>
                      <th className="px-3 py-2 font-semibold">Device</th>
                      <th className="px-3 py-2 font-semibold">Source</th>
                      <th className="px-5 py-2 text-right font-semibold">Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.visitors.map((v) => {
                      const Dev = DEVICE_ICON[v.device];
                      return (
                        <tr
                          key={v.label + v.path + v.secondsAgo}
                          className="border-t border-border"
                        >
                          <td className="px-5 py-2.5">
                            <span aria-hidden="true">{flag(v.countryCode)} </span>
                            {v.country ?? "Unknown"}
                            {v.city ? ` — ${v.city}` : ""}
                          </td>
                          <td className="px-3 py-2.5">
                            <span title={v.path}>{pageLabel(v.path)}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 capitalize">
                              <Dev className="h-3.5 w-3.5 text-muted-foreground" />
                              {v.device}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 capitalize text-muted-foreground">
                            {v.source ?? "direct"}
                          </td>
                          <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                            {ago(v.secondsAgo + elapsed)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!snap && !result && <p className="text-sm text-muted-foreground">Loading…</p>}

      <p className="text-xs text-muted-foreground">
        Visitor location is approximate and derived from network geolocation. It is not precise GPS
        location. No IP addresses are stored or shown, and live sessions are deleted after one hour.
      </p>
    </div>
  );
}
