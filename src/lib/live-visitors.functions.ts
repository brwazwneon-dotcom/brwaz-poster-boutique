import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { NeonDbError } from "@neondatabase/serverless";
import { sql } from "@/lib/neon.server";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";
import { isProductionRequest, productionHostList, requestHost } from "@/lib/analytics-host.server";
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
