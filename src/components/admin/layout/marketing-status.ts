import type { MetaAdsStatusView } from "@/lib/meta-ads.types";

const STALE_HOURS = 12;

export type MarketingStatusLabel = { text: string; tone: "ok" | "warn" | "muted" };

/** The one-line Meta Ads status shown at the bottom of the admin sidebar. */
export function marketingStatusLabel(
  status: MetaAdsStatusView | null,
  now: Date = new Date(),
): MarketingStatusLabel {
  if (!status) return { text: "Marketing: status unavailable", tone: "muted" };
  if (!status.migrationApplied) return { text: "Meta Ads: not connected", tone: "muted" };
  if (!status.lastSuccess) {
    return status.configured
      ? { text: "Meta Ads: connected, not synced", tone: "warn" }
      : { text: "Meta Ads: not connected", tone: "muted" };
  }
  const hours = Math.max(
    0,
    Math.floor((now.getTime() - new Date(status.lastSuccess.finishedAt).getTime()) / 3_600_000),
  );
  const failedSince =
    !!status.lastAttempt &&
    status.lastAttempt.status === "failed" &&
    new Date(status.lastAttempt.startedAt).getTime() >
      new Date(status.lastSuccess.finishedAt).getTime();
  const age =
    hours < 1 ? "just now" : hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
  return hours >= STALE_HOURS || failedSince
    ? { text: `Meta Ads: stale, last synced ${age}`, tone: "warn" }
    : { text: `Meta Ads: synced ${age}`, tone: "ok" };
}
