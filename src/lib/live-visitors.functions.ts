import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { NeonDbError } from "@neondatabase/serverless";
import { sql } from "@/lib/neon.server";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";
import { isProductionRequest, productionHostList, requestHost } from "@/lib/analytics-host.server";
import {
  buildVisitorInsights,
  clampInsightDays,
  type InsightVisitorRow,
  type VisitorInsights,
} from "@/lib/visitor-insights-core";
import {
  DEFAULT_ACTIVE_WINDOW_SECONDS,
  LIVE_RETENTION_MINUTES,
  MIN_PING_INTERVAL_SECONDS,
  browserFromUserAgent,
  buildLiveSnapshot,
  clampWindowSeconds,
  geoFromHeaders,
  sanitizePing,
  type LiveRow,
  type LiveSnapshot,
} from "@/lib/live-visitors-core";

// "relation does not exist": migration 027 has not been applied to this database.
const isMissingTable = (e: unknown) => e instanceof NeonDbError && e.code === "42P01";

/**
 * Public heartbeat. The browser sends a tiny body every ~40s while a tab is
 * visible; this upserts ONE row per anonymous visitor. Best-effort by design:
 * it never throws, never blocks rendering, and non-production hosts are refused
 * (local dev and preview deployments share the production database).
 *
 * Privacy: no IP is read or stored. Location comes from the platform's
 * approximate geolocation headers; the browser family from the User-Agent
 * header (the string itself is not stored).
 */
export const livePingPublic = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    try {
      if (!isProductionRequest()) return { ok: true, skipped: "non_production_host" };
      const ping = sanitizePing(data);
      if (!ping) return { ok: false };
      const geo = geoFromHeaders((n) => getRequestHeader(n));
      const browser = browserFromUserAgent(getRequestHeader("user-agent"));
      await sql()`
        insert into live_sessions (
          visitor_id, path, title, country_code, country, region, city,
          device, browser, source, screen, host
        ) values (
          ${ping.visitorId}, ${ping.path}, ${ping.title}, ${geo.countryCode}, ${geo.country},
          ${geo.region}, ${geo.city}, ${ping.device}, ${browser}, ${ping.source}, ${ping.screen},
          ${requestHost()}
        )
        on conflict (visitor_id) do update set
          first_seen = case
            when live_sessions.last_seen < now() - interval '30 minutes' then now()
            else live_sessions.first_seen end,
          last_seen = now(),
          path = excluded.path,
          title = excluded.title,
          country_code = coalesce(excluded.country_code, live_sessions.country_code),
          country = coalesce(excluded.country, live_sessions.country),
          region = coalesce(excluded.region, live_sessions.region),
          city = coalesce(excluded.city, live_sessions.city),
          device = excluded.device,
          browser = excluded.browser,
          source = coalesce(excluded.source, live_sessions.source),
          screen = excluded.screen,
          host = excluded.host
        where live_sessions.last_seen < now() - make_interval(secs => ${MIN_PING_INTERVAL_SECONDS})
           or live_sessions.path is distinct from excluded.path
      `;
      // Retention: occasionally drop long-gone sessions so the table stays tiny.
      if (Math.random() < 0.02) {
        await sql()`
          delete from live_sessions
          where last_seen < now() - make_interval(mins => ${LIVE_RETENTION_MINUTES})
        `;
      }
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

export type LiveVisitorsResult =
  | { ok: true; snapshot: LiveSnapshot; serverTime: string }
  | { ok: false; reason: "migration_missing" | "error"; message: string };

/** Admin only: who is on the site right now (default window 90s). */
export const getLiveVisitorsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { windowSeconds?: number } | undefined) ?? {})
  .handler(async ({ data }): Promise<LiveVisitorsResult> => {
    const windowSeconds = clampWindowSeconds(data.windowSeconds ?? DEFAULT_ACTIVE_WINDOW_SECONDS);
    try {
      const rows = (await sql()`
        select visitor_id, first_seen, last_seen, path, title, country_code, country, region,
               city, device, browser, source, screen
        from live_sessions
        where last_seen > now() - make_interval(secs => ${windowSeconds})
          and host = any(${productionHostList()})
        order by last_seen desc
        limit 500
      `) as LiveRow[];
      // The admin view is the other natural moment to prune old rows.
      await sql()`
        delete from live_sessions
        where last_seen < now() - make_interval(mins => ${LIVE_RETENTION_MINUTES})
      `.catch(() => undefined);
      return {
        ok: true,
        snapshot: buildLiveSnapshot(rows, Date.now(), windowSeconds),
        serverTime: new Date().toISOString(),
      };
    } catch (e) {
      if (isMissingTable(e)) {
        return {
          ok: false,
          reason: "migration_missing",
          message:
            "Live visitor tracking is not set up yet: database migration 027 has not been applied.",
        };
      }
      return { ok: false, reason: "error", message: "Could not load live visitors." };
    }
  });

export type VisitorInsightsResult =
  | { ok: true; insights: VisitorInsights; trackingSince: string | null }
  | { ok: false; message: string };

/**
 * Admin only: where visitors come from and how many have been here before, over the
 * last 7 / 30 / 90 days. Read-only, from the existing visit log (anonymous visitor id +
 * approximate location; no IP address). Age and gender are not recorded, so they are
 * not part of this result.
 */
export const getVisitorInsightsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { days?: number } | undefined) ?? {})
  .handler(async ({ data }): Promise<VisitorInsightsResult> => {
    const days = clampInsightDays(data.days);
    const sinceMs = Date.now() - days * 86_400_000;
    const hosts = productionHostList();
    try {
      const rows = (await sql()`
        with firsts as (
          select visitor_id, min(created_at) as first_ever
          from analytics_visits
          where visitor_id is not null and host = any(${hosts})
          group by visitor_id
        ),
        inrange as (
          select visitor_id,
                 count(*)::int as visits,
                 count(distinct (created_at at time zone 'Africa/Cairo')::date)::int as days,
                 (array_agg(country order by created_at desc))[1] as country,
                 (array_agg(country_code order by created_at desc))[1] as country_code,
                 (array_agg(city order by created_at desc))[1] as city,
                 (array_agg(governorate order by created_at desc))[1] as governorate,
                 (array_agg(device order by created_at desc))[1] as device
          from analytics_visits
          where visitor_id is not null
            and host = any(${hosts})
            and created_at >= ${new Date(sinceMs).toISOString()}
          group by visitor_id
        )
        select i.*, f.first_ever
        from inrange i join firsts f using (visitor_id)
        limit 30000
      `) as unknown as Array<Omit<InsightVisitorRow, "first_ever"> & { first_ever: string | Date }>;
      const since = (await sql()`
        select min(created_at) as t from analytics_visits where host = any(${hosts})
      `) as unknown as Array<{ t: string | Date | null }>;
      const normalized: InsightVisitorRow[] = rows.map((r) => ({
        ...r,
        first_ever: new Date(r.first_ever).toISOString(),
      }));
      return {
        ok: true,
        insights: buildVisitorInsights(normalized, days, sinceMs),
        trackingSince: since[0]?.t ? new Date(since[0].t).toISOString() : null,
      };
    } catch {
      return { ok: false, message: "Could not load visitor insights." };
    }
  });
