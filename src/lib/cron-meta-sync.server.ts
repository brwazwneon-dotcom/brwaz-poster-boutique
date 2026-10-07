// Daily Meta Ads sync, run by Vercel Cron (see vercel.json). It does NOT contain a second Meta
// integration: it calls the one existing sync function (syncMetaAds in meta-ads-sync.server.ts)
// with trigger "cron" and an explicit window of the last 7 days, so late corrections Meta makes
// to recent days (spend and purchase attribution settle for several days) are picked up. That
// function upserts on Meta's own ids, so re-syncing a day replaces it and never duplicates, it
// skips when another sync is running (the meta_sync_runs lock), and it never throws.
import { checkCronAuth, cronAuthFailure } from "@/lib/cron-auth.server";
import { syncMetaAds, type SyncResult } from "@/lib/meta-ads-sync.server";

/** Days re-pulled on every run, today included. */
export const META_CRON_DAYS = 7;
const DAY_MS = 86_400_000;
const dayString = (d: Date) => d.toISOString().slice(0, 10);

/** The last META_CRON_DAYS calendar days ending today (same UTC-day convention as the sync's default range). */
export function metaCronRange(now: Date): { from: string; to: string } {
  return {
    from: dayString(new Date(now.getTime() - (META_CRON_DAYS - 1) * DAY_MS)),
    to: dayString(now),
  };
}

export type MetaCronDeps = {
  sync?: (input: { from?: string; to?: string; trigger?: "cron" }) => Promise<SyncResult>;
  now?: () => Date;
  env?: Record<string, string | undefined>;
};

/** HTTP status Vercel Cron will log: 2xx only when the run was fine or intentionally skipped. */
function statusFor(r: SyncResult): number {
  if (r.status === "success" || r.status === "partial") return 200;
  if (r.errorKind === "busy") return 200; // another sync holds the lock: not an error
  if (r.errorKind === "not_configured" || r.errorKind === "migration_missing") return 503;
  return 502;
}

export async function runMetaCronSync(
  request: Request,
  deps: MetaCronDeps = {},
): Promise<Response> {
  const denied = cronAuthFailure(checkCronAuth(request, deps.env));
  if (denied) return denied;
  try {
    const range = metaCronRange((deps.now ?? (() => new Date()))());
    const r = await (deps.sync ?? syncMetaAds)({ ...range, trigger: "cron" });
    // Counts and status only. `message` is already scrubbed of the token by the sync function.
    return Response.json(
      {
        ok: r.status === "success" || r.status === "partial" || r.errorKind === "busy",
        skipped: r.errorKind === "busy" ? "busy" : undefined,
        status: r.status,
        dateFrom: r.dateFrom,
        dateTo: r.dateTo,
        campaigns: r.campaigns,
        adsets: r.adsets,
        ads: r.ads,
        insightRows: r.insightRows,
        errorKind: r.errorKind,
        message: r.message,
      },
      { status: statusFor(r) },
    );
  } catch {
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
