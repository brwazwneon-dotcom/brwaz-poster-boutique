import { getRequestHeader } from "@tanstack/react-start/server";
import {
  PRODUCTION_HOSTNAMES,
  hostnameOf,
  isProductionHostname,
  parseHostList,
} from "@/lib/analytics-env";

/**
 * Server-side half of the dev-traffic guard. The host comes from the request
 * headers, not from the client payload, so a stale/modified browser bundle
 * cannot label its own traffic as production.
 *
 * ANALYTICS_EXTRA_HOSTS (comma-separated) lets a real staging domain count as
 * production traffic when there is one.
 */
export function requestHost(): string {
  try {
    return hostnameOf(getRequestHeader("x-forwarded-host") ?? getRequestHeader("host"));
  } catch {
    return "";
  }
}

export function isProductionRequest(): boolean {
  return isProductionHostname(requestHost(), parseHostList(process.env.ANALYTICS_EXTRA_HOSTS));
}

/** SQL parameter: the hostnames whose rows count as production. */
export function productionHostList(): string[] {
  return [...PRODUCTION_HOSTNAMES, ...parseHostList(process.env.ANALYTICS_EXTRA_HOSTS)];
}
