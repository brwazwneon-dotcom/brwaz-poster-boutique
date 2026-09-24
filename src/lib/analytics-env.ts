/**
 * Which hosts count as PRODUCTION traffic.
 *
 * Local development and preview deployments share the production database
 * (there is no staging DB), so without a guard every developer/QA page view
 * is recorded as a real visitor. The browser refuses to record on any other
 * host, and the server independently refuses to insert for any other Host
 * header (see analytics-host.server.ts) — one layer failing does not pollute
 * the numbers.
 */
export const PRODUCTION_HOSTNAMES: readonly string[] = ["brwazwneon.com", "www.brwazwneon.com"];

export function parseHostList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((h) => hostnameOf(h))
    .filter(Boolean);
}

/** Lower-cased host without port ("Localhost:8080" → "localhost"). */
export function hostnameOf(hostHeader: string | null | undefined): string {
  return (hostHeader ?? "").trim().toLowerCase().replace(/:\d+$/, "");
}

export function isProductionHostname(
  host: string | null | undefined,
  extraHosts: readonly string[] = [],
): boolean {
  const h = hostnameOf(host);
  if (!h) return false;
  return PRODUCTION_HOSTNAMES.includes(h) || extraHosts.includes(h);
}

let clientExtras: string[] | null = null;
function getClientExtras(): string[] {
  if (clientExtras) return clientExtras;
  try {
    clientExtras = parseHostList(import.meta.env?.VITE_ANALYTICS_EXTRA_HOSTS as string | undefined);
  } catch {
    clientExtras = [];
  }
  return clientExtras;
}

/** True only in a browser on a production hostname. */
export function clientTrackingAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return isProductionHostname(window.location.hostname, getClientExtras());
}
