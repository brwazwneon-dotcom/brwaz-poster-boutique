import { AnalyticsCenter } from "@/components/admin/analytics/AnalyticsCenter";

/**
 * The single Analytics area of the admin: the Marketing & Analytics Center.
 * (It replaces the earlier 4-panel "Website Analytics" view — visits by day,
 * traffic sources, top products and searches — which now live in Overview,
 * Traffic, Products and Clicks.)
 */
export function AnalyticsTab() {
  return <AnalyticsCenter />;
}
