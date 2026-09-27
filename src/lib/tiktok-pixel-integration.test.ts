// @vitest-environment jsdom
/**
 * Runs the REAL TikTok pixel bootstrap that ships in routes/__root.tsx (its source
 * text is extracted and executed, not re-implemented) and checks that
 * tiktok-browser.ts drives it correctly: the pixel's own stub records
 * ttq.track(event, properties, {event_id}) calls in order, which is exactly what
 * the real script replays once it loads.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tiktok-events.functions", () => ({ sendTikTokEventFromBrowser: vi.fn() }));
vi.mock("./analytics", () => ({ visitorId: () => "visitor-1" }));

import { _resetTikTokBrowserForTests, trackTikTok } from "./tiktok-browser";

const root = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "routes", "__root.tsx"),
  "utf8",
);
const match = root.match(/const TIKTOK_PIXEL_BOOTSTRAP = `([\s\S]*?)`;/);
const PIXEL_ID = root.match(/const TIKTOK_PIXEL_ID = "([A-Z0-9]+)"/)?.[1];

type Stub = unknown[] & { track: (...a: unknown[]) => void; load: (id: string) => void };
const w = window as unknown as {
  ttq?: Stub;
  TiktokAnalyticsObject?: string;
  __brwz_tiktok_pixel_loaded?: boolean;
};

const bootLikeRoot = () => {
  // Exactly what TikTokPixelBoot does: run the bootstrap, then load the pixel.
  new Function(match![1])();
  w.ttq!.load(PIXEL_ID!);
};

beforeEach(() => {
  vi.useFakeTimers();
  delete w.ttq;
  delete w.TiktokAnalyticsObject;
  delete w.__brwz_tiktok_pixel_loaded;
  document.head.innerHTML = "<script></script>";
  _resetTikTokBrowserForTests();
});

describe("against the real pixel bootstrap from __root.tsx", () => {
  it("the bootstrap and pixel id were found in the source", () => {
    expect(match).toBeTruthy();
    expect(PIXEL_ID).toMatch(/^[A-Z0-9]{20}$/);
  });

  it("the bootstrap raises the ready flag our layer waits for", () => {
    bootLikeRoot();
    expect(w.__brwz_tiktok_pixel_loaded).toBe(true);
  });

  it("events sent after the pixel boots reach the pixel's queue in order, with the event_id", () => {
    bootLikeRoot();
    trackTikTok(
      "ViewContent",
      { content_ids: ["11111111-1111-4111-8111-111111111111"] },
      "evt_00000001",
    );
    trackTikTok("AddToCart", { value: 230 }, "evt_00000002");
    const tracks = (w.ttq as unknown as unknown[][]).filter((c) => c[0] === "track");
    expect(tracks.map((c) => [c[1], (c[3] as { event_id: string }).event_id])).toEqual([
      ["ViewContent", "evt_00000001"],
      ["AddToCart", "evt_00000002"],
    ]);
    expect(tracks[1][2]).toMatchObject({ value: 230, currency: "EGP", content_type: "product" });
  });

  it("an event fired BEFORE the pixel boots is held, then delivered once it does", () => {
    trackTikTok("InitiateCheckout", { value: 500 }, "evt_00000003");
    vi.advanceTimersByTime(800);
    bootLikeRoot();
    vi.advanceTimersByTime(800);
    const tracks = (w.ttq as unknown as unknown[][]).filter((c) => c[0] === "track");
    expect(tracks).toHaveLength(1);
    expect(tracks[0][1]).toBe("InitiateCheckout");
    expect((tracks[0][3] as { event_id: string }).event_id).toBe("evt_00000003");
  });

  it("Purchase reaches the pixel as CompletePayment with the deterministic order id", () => {
    bootLikeRoot();
    trackTikTok("Purchase", { value: 4550, order_id: "BRW-1049" }, "purchase_BRW-1049", {
      relay: true,
    });
    const track = (w.ttq as unknown as unknown[][]).find((c) => c[0] === "track")!;
    expect(track[1]).toBe("CompletePayment");
    expect((track[3] as { event_id: string }).event_id).toBe("purchase_BRW-1049");
    expect(track[2]).toMatchObject({ value: 4550, currency: "EGP" });
  });
});
