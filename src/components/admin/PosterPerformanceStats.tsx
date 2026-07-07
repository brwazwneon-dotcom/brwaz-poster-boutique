import {
  avgViewSeconds,
  conversionRatePct,
  ctrPct,
  formatAvgTime,
  formatRatePct,
} from "@/lib/poster-metrics";

export interface PosterPerformanceStatsProps {
  viewsCount: number | null | undefined;
  salesCount: number | null | undefined;
  cartAddsCount: number | null | undefined;
  totalViewSeconds: number | null | undefined;
}

/**
 * Renders per-poster CTR, conversion rate, and average time viewed.
 * Displays "—" for any metric when the poster has zero views, so
 * the admin dashboard never shows NaN/Infinity values.
 */
export function PosterPerformanceStats({
  viewsCount,
  salesCount,
  cartAddsCount,
  totalViewSeconds,
}: PosterPerformanceStatsProps) {
  const conv = formatRatePct(conversionRatePct(salesCount, viewsCount), viewsCount);
  const ctr = formatRatePct(ctrPct(cartAddsCount, viewsCount), viewsCount);
  const avg = formatAvgTime(avgViewSeconds(totalViewSeconds, viewsCount), viewsCount);

  return (
    <div
      data-testid="poster-performance-stats"
      className="flex items-center gap-3 text-[11px] text-muted-foreground"
    >
      <span data-testid="poster-ctr">
        CTR: <span className="text-foreground">{ctr}</span>
      </span>
      <span data-testid="poster-conversion">
        CR: <span className="text-foreground">{conv}</span>
      </span>
      <span data-testid="poster-avg-time">
        Avg: <span className="text-foreground">{avg}</span>
      </span>
    </div>
  );
}