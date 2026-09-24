import { beforeEach, describe, expect, it, vi } from "vitest";

const headers = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: (name: string) => headers.values[name],
}));

import { isProductionRequest, productionHostList, requestHost } from "./analytics-host.server";

describe("server-side dev-traffic guard (decided by the request's Host header)", () => {
  beforeEach(() => {
    headers.values = {};
    delete process.env.ANALYTICS_EXTRA_HOSTS;
  });

  it("production hosts are accepted", () => {
    headers.values = { host: "brwazwneon.com" };
    expect(isProductionRequest()).toBe(true);
    headers.values = { host: "www.brwazwneon.com" };
    expect(isProductionRequest()).toBe(true);
  });

  it("localhost, LAN and preview hosts are refused", () => {
    for (const host of [
      "localhost:8080",
      "127.0.0.1:3000",
      "192.168.1.12:8080",
      "brwaz-poster-boutique-abc-1555.vercel.app",
    ]) {
      headers.values = { host };
      expect(isProductionRequest()).toBe(false);
    }
  });

  it("x-forwarded-host (set by the platform proxy) wins over host", () => {
    headers.values = { host: "internal-lambda.local", "x-forwarded-host": "brwazwneon.com" };
    expect(requestHost()).toBe("brwazwneon.com");
    expect(isProductionRequest()).toBe(true);
    headers.values = { host: "brwazwneon.com", "x-forwarded-host": "localhost:8080" };
    expect(isProductionRequest()).toBe(false);
  });

  it("a request with no host header is not production", () => {
    expect(isProductionRequest()).toBe(false);
  });

  it("a staging domain can be enabled explicitly on the server", () => {
    process.env.ANALYTICS_EXTRA_HOSTS = "staging.brwazwneon.com";
    headers.values = { host: "staging.brwazwneon.com" };
    expect(isProductionRequest()).toBe(true);
    expect(productionHostList()).toContain("staging.brwazwneon.com");
  });
});
