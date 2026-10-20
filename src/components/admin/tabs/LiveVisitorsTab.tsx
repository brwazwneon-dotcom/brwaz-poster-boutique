import { useCallback, useEffect, useRef, useState } from "react";
import {
  Globe2,
  MapPin,
  Monitor,
  RefreshCw,
  Repeat,
  Smartphone,
  Tablet,
  UserPlus,
  Users,
} from "lucide-react";
import {
  getLiveVisitorsAdmin,
  getVisitorInsightsAdmin,
  type LiveVisitorsResult,
  type VisitorInsightsResult,
} from "@/lib/live-visitors.functions";
import { INSIGHT_RANGES, type InsightDays } from "@/lib/visitor-insights-core";
import { ADMIN_IDLE_EVENT, isAdminIdle } from "@/lib/idle-pause";
import { pageLabel, type Tally } from "@/lib/live-visitors-core";
import { cn } from "@/lib/utils";

const POLL_MS = 15_000;
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

/** Who the visitors are over the last 7 / 30 / 90 days, from the real visit log. */
function VisitorInsightsPanel({ active }: { active: boolean }) {
  const [days, setDays] = useState<InsightDays>(30);
  const [result, setResult] = useState<VisitorInsightsResult | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setResult(null);
    getVisitorInsightsAdmin({ data: { days } })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled) setResult({ ok: false, message: "Could not load visitor insights." });
      });
    return () => {
      cancelled = true;
    };
  }, [active, days]);

  const ins = result?.ok ? result.insights : null;
  const since = result?.ok && result.trackingSince ? result.trackingSince.slice(0, 10) : null;

  return (
    <section className="space-y-3" aria-labelledby="visitor-insights-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="visitor-insights-title" className="text-display text-xl font-semibold">
            Visitor insights
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Where visitors come from and how many have been here before
            {since ? ` (visits recorded since ${since})` : ""}.
          </p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Period">
          {INSIGHT_RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={cn(
                "h-9 rounded-sm border px-3 text-sm",
                days === d
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/40",
              )}
            >
              {d} days
            </button>
          ))}
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
      {!result && <p className="text-sm text-muted-foreground">Loading…</p>}

      {ins && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Visitors" value={ins.visitors} icon={Users} accent />
            <Stat label="New" value={ins.newVisitors} icon={UserPlus} />
            <Stat label="Came back" value={ins.returningVisitors} icon={Repeat} />
            <div className="rounded-sm border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Repeat className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-widest">
                  Returning share
                </span>
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">
                {ins.visitors ? `${ins.returningPercent}%` : "—"}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            “Came back” = visited before this period, or on more than one day inside it. A visitor
            is one browser; someone who clears their browser data or switches phone counts again as
            new.
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            <Breakdown title="Countries" rows={ins.countries} empty="No visits in this period." />
            <Breakdown title="Cities" rows={ins.cities} empty="No visits in this period." />
            <Breakdown
              title="Where returning visitors come from"
              rows={ins.returningCities}
              empty="No returning visitors in this period."
            />
          </div>
        </>
      )}

      <div className="rounded-sm border border-dashed border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Age &amp; gender
          </h4>
          <span className="rounded-sm bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Not connected
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          A website cannot see a visitor’s age or gender, so no figure is shown here rather than a
          guess. The real source is Meta Ads: it reports age and gender for the people your ads
          reach and click. That needs a small addition to the Meta sync.
        </p>
      </div>
    </section>
  );
}

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
      if (document.visibilityState === "visible" && !isAdminIdle()) void load();
    }, POLL_MS);
    // Back from idle: refresh at once.
    const onIdleChange = (e: Event) => {
      if (!(e as CustomEvent<{ idle: boolean }>).detail.idle) void load();
    };
    window.addEventListener(ADMIN_IDLE_EVENT, onIdleChange);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      window.removeEventListener(ADMIN_IDLE_EVENT, onIdleChange);
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
                updated {ago(elapsed)} · refreshes every 15 sec · pauses after 5 idle minutes
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

      <VisitorInsightsPanel active={active} />

      <p className="text-xs text-muted-foreground">
        Visitor location is approximate and derived from network geolocation. It is not precise GPS
        location. No IP addresses are stored or shown, and live sessions are deleted after one hour.
      </p>
    </div>
  );
}
