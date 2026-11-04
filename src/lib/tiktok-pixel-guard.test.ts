// @vitest-environment jsdom
/**
 * The TikTok pixel only runs on production hostnames. These tests use the REAL host rule (analytics-env.ts, the same
 * one the Meta Pixel and the internal analytics use) and the real trackTikTok; only the network edge is faked, so
 * nothing here can reach TikTok.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const relay = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true })));
vi.mock("./tiktok-events.functions", () => ({ sendTikTokEventFromBrowser: relay }));
vi.mock("./analytics", () => ({ visitorId: () => "visitor-1" }));

import { _resetTikTokBrowserForTests, trackTikTok } from "./tiktok-browser";
import { tiktokPixelAllowed } from "./tiktok-pixel-guard";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realLocation = window.location;
const visit = (hostname: string) =>
  Object.defineProperty(window, "location", {
    value: { hostname, href: `https://${hostname}/`, pathname: "/", search: "" },
    configurable: true,
  });

const PRODUCTION = ["brwazwneon.com", "www.brwazwneon.com", "BRWAZWNEON.com"];
const NOT_PRODUCTION = [
  "localhost",
  "127.0.0.1",
  "brwaz-poster-boutique.vercel.app",
  "brwaz-poster-boutique-abc123-team.vercel.app",
  "brwazwneon.com.evil.example",
  "evil-brwazwneon.com",
  "staging.brwazwneon.com",
  "",
];

describe("tiktokPixelAllowed", () => {
  afterEach(() =>
    Object.defineProperty(window, "location", { value: realLocation, configurable: true }),
  );

  it.each(PRODUCTION)("%s: allowed", (host) => {
    visit(host);
    expect(tiktokPixelAllowed()).toBe(true);
  });

  it.each(NOT_PRODUCTION)("%j: refused", (host) => {
    visit(host);
    expect(tiktokPixelAllowed()).toBe(false);
  });

  it("the admin is refused even on a production host", () => {
    visit("brwazwneon.com");
    expect(tiktokPixelAllowed(true)).toBe(false);
    expect(tiktokPixelAllowed(false)).toBe(true);
  });
});

describe("trackTikTok", () => {
  const track = vi.fn();
  const w = window as unknown as {
    ttq?: { track: typeof track };
    __brwz_tiktok_pixel_loaded?: boolean;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    track.mockReset();
    relay.mockClear();
    _resetTikTokBrowserForTests();
    w.ttq = { track };
    w.__brwz_tiktok_pixel_loaded = true; // the pixel is up: the only thing left to stop it is the host rule
  });
  afterEach(() => {
    vi.useRealTimers();
    delete w.ttq;
    delete w.__brwz_tiktok_pixel_loaded;
    Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  });

  const fire = () =>
    trackTikTok("AddToCart", { content_ids: ["p1"], value: 100, currency: "EGP" }, "evt-1", {
      relay: true,
    });

  it.each(NOT_PRODUCTION.filter(Boolean))(
    "%s: nothing reaches the pixel and nothing is relayed to the Events API",
    (host) => {
      visit(host);
      fire();
      vi.advanceTimersByTime(30_000);
      expect(track).not.toHaveBeenCalled();
      expect(relay).not.toHaveBeenCalled();
    },
  );

  it("a non-production host does not queue events to be sent later either", () => {
    visit("localhost");
    w.__brwz_tiktok_pixel_loaded = false; // pixel not up yet: this is the queueing path
    fire();
    w.__brwz_tiktok_pixel_loaded = true; // ... and it comes up later
    vi.advanceTimersByTime(30_000);
    expect(track).not.toHaveBeenCalled();
    expect(relay).not.toHaveBeenCalled();
  });

  it.each(PRODUCTION)("%s: unchanged, the event goes to the pixel and to the relay", (host) => {
    visit(host);
    fire();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0][0]).toBe("AddToCart");
    expect(track.mock.calls[0][2]).toEqual({ event_id: "evt-1" });
    expect(relay).toHaveBeenCalledTimes(1);
  });

  it("a production host still queues an event until the pixel boots", () => {
    visit("brwazwneon.com");
    w.__brwz_tiktok_pixel_loaded = false;
    fire();
    expect(track).not.toHaveBeenCalled();
    w.__brwz_tiktok_pixel_loaded = true;
    vi.advanceTimersByTime(1_000);
    expect(track).toHaveBeenCalledTimes(1);
  });
});

// Source checks: there is no second way to load the pixel or to send it an event around the guard.
describe("no path around the guard", () => {
  const code = (t: string) =>
    t
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const files = walk(SRC).map((p) => ({
    rel: path.relative(SRC, p).replace(/\\/g, "/"),
    raw: fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"),
    text: code(fs.readFileSync(p, "utf8")),
  }));
  const only = (re: RegExp) => files.filter((f) => re.test(f.text)).map((f) => f.rel);

  it("the pixel script is created and loaded from exactly one place, routes/__root.tsx", () => {
    expect(only(/TIKTOK_PIXEL_BOOTSTRAP/)).toEqual(["routes/__root.tsx"]);
    expect(only(/ttq\??\.load/)).toContain("routes/__root.tsx");
    for (const rel of only(/ttq\??\.(load|page)\b/)) expect(rel).toBe("routes/__root.tsx");
    // the script address appears in the root bootstrap and nowhere else (a dns-prefetch hint is not a request)
    expect(only(/analytics\.tiktok\.com/)).toEqual(["routes/__root.tsx"]);
  });

  it("TikTokPixelBoot checks the host rule before it creates the script", () => {
    const root = files.find((f) => f.rel === "routes/__root.tsx")!.text;
    const boot = root.slice(root.indexOf("function TikTokPixelBoot"));
    const guard = boot.indexOf("tiktokPixelAllowed(disabled)");
    expect(guard).toBeGreaterThan(-1);
    expect(boot.slice(guard, guard + 60)).toMatch(/\)\)\s*return;/);
    expect(guard).toBeLessThan(boot.indexOf("new Function(TIKTOK_PIXEL_BOOTSTRAP)"));
    expect(guard).toBeLessThan(boot.indexOf("ttq?.load"));
    expect(guard).toBeLessThan(boot.indexOf("requestIdleCallback"));
    // the old admin-only check is not the only condition any more
    expect(boot).not.toMatch(/if \(disabled\) return;/);
  });

  it("events reach the pixel only through trackTikTok, and it checks the host first", () => {
    const callers = only(/\bttq\(\)\??\.track|window\.ttq\??\.track/);
    expect(callers).toEqual(["lib/tiktok-browser.ts"]);
    const src = files.find((f) => f.rel === "lib/tiktok-browser.ts")!.text;
    const fn = src.slice(src.indexOf("export function trackTikTok"));
    const guard = fn.indexOf("tiktokPixelAllowed()");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(fn.indexOf("ttq()"));
    expect(guard).toBeLessThan(fn.indexOf("pending.push"));
    expect(guard).toBeLessThan(fn.indexOf("sendTikTokEventFromBrowser("));
  });

  it("only trackTikTok relays to the Events API from the browser, and only meta-pixel calls trackTikTok", () => {
    expect(only(/sendTikTokEventFromBrowser\s*\(/)).toEqual(["lib/tiktok-browser.ts"]);
    expect(only(/\btrackTikTok\s*\(/).sort()).toEqual([
      "lib/meta-pixel.ts",
      "lib/tiktok-browser.ts",
    ]);
    // ... behind the same host rule that already gates every Meta Pixel event
    const meta = files.find((f) => f.rel === "lib/meta-pixel.ts")!.text;
    const trackEvent = meta.slice(meta.indexOf("export function trackEvent"));
    expect(trackEvent.indexOf("clientTrackingAllowed()")).toBeLessThan(
      trackEvent.indexOf("trackTikTok("),
    );
  });

  it("the server sender keeps its own host check", () => {
    const server = files.find((f) => f.rel === "lib/tiktok-events.server.ts")!.text;
    expect(server).toMatch(/opts\.production \?\? isProductionRequest\(\)/);
    expect(server).toContain("non_production_host");
  });
});
