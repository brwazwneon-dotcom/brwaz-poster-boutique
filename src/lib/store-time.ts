/**
 * The store's calendar is Cairo time. Cutting days at UTC midnight made every
 * order placed in the first 2–3 hours after Cairo midnight count as
 * "yesterday". Pure (no Node/DOM APIs) so it is shared by the Executive
 * Dashboard and the Analytics Center and can be unit-tested.
 */
export const STORE_TIME_ZONE = "Africa/Cairo";

export function storeOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wallClockAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

export type AnalyticsRangeKey =
  "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month" | "custom";

export type AnalyticsRange = {
  key: AnalyticsRangeKey;
  start: Date;
  end: Date; // exclusive
  prevStart: Date;
  prevEnd: Date; // exclusive
  days: number;
};

const DAY_MS = 86_400_000;
const MAX_CUSTOM_DAYS = 366;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Resolves a dashboard date preset (or a custom Cairo-date range) plus the
 * comparison period. "Last 7/30 days" are N calendar days ending today, and the
 * previous period is the N days immediately before — always equal length.
 * "This month" compares against the same elapsed span of last month.
 */
export function resolveAnalyticsRange(
  key: AnalyticsRangeKey,
  custom?: { from?: string; to?: string },
  now = new Date(),
): AnalyticsRange {
  const offset = storeOffsetMs(now);
  const local = new Date(now.getTime() + offset);
  const midnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - offset);
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
  const today = midnight(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const tomorrow = addDays(today, 1);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();

  const build = (start: Date, end: Date, prevStart: Date, prevEnd: Date): AnalyticsRange => ({
    key,
    start,
    end,
    prevStart,
    prevEnd,
    days: Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS)),
  });
  const equalPrevious = (start: Date, end: Date) => {
    const len = end.getTime() - start.getTime();
    return build(start, end, new Date(start.getTime() - len), start);
  };

  switch (key) {
    case "yesterday":
      return equalPrevious(addDays(today, -1), today);
    case "7d":
      return equalPrevious(addDays(today, -6), tomorrow);
    case "30d":
      return equalPrevious(addDays(today, -29), tomorrow);
    case "this_month": {
      const start = midnight(y, m, 1);
      const prevStart = midnight(y, m - 1, 1);
      const elapsed = tomorrow.getTime() - start.getTime();
      const prevMonthLen = start.getTime() - prevStart.getTime();
      return build(
        start,
        tomorrow,
        prevStart,
        new Date(prevStart.getTime() + Math.min(elapsed, prevMonthLen)),
      );
    }
    case "last_month": {
      const start = midnight(y, m - 1, 1);
      const end = midnight(y, m, 1);
      return build(start, end, midnight(y, m - 2, 1), start);
    }
    case "custom": {
      const f = ISO_DAY.exec(custom?.from ?? "");
      const t = ISO_DAY.exec(custom?.to ?? "");
      if (f && t) {
        let start = midnight(Number(f[1]), Number(f[2]) - 1, Number(f[3]));
        let end = addDays(midnight(Number(t[1]), Number(t[2]) - 1, Number(t[3])), 1);
        if (end.getTime() <= start.getTime()) [start, end] = [addDays(end, -1), addDays(start, 1)];
        if (end.getTime() - start.getTime() > MAX_CUSTOM_DAYS * DAY_MS) {
          start = addDays(end, -MAX_CUSTOM_DAYS);
        }
        return equalPrevious(start, end);
      }
      return equalPrevious(addDays(today, -6), tomorrow);
    }
    case "today":
    default:
      return equalPrevious(today, tomorrow);
  }
}
