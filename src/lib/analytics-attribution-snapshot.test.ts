import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/neon.server", () => ({
  sql: () => {
    throw new Error("these tests must not reach the database");
  },
}));

import { attributeCheckouts, type CheckoutRow } from "./analytics-core.server";

const CAMP = "52575575055376";
const AD = "52575869248376";
const ctx = {
  start: "2026-09-01T00:00:00Z",
  end: "2026-10-01T00:00:00Z",
  hosts: ["brwazwneon.com"],
  m: true,
};

const order = (over: Partial<CheckoutRow> = {}): CheckoutRow => ({
  k: "k",
  order_number: "BRW-1",
  items: 1,
  payment_method: "cod",
  visitor_id: null, // no session lookup: the join is a pure function of the row
  created_at: "2026-09-27T00:15:00Z",
  revenue: "1000",
  status: "confirmed",
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  ...over,
});

const snapshot = {
  v: 1,
  recorded_at: "2026-09-27T00:15:01Z",
  first: {
    source: "instagram",
    medium: "paid",
    campaign: CAMP,
    content: AD,
    term: null,
    meta_campaign_id: CAMP,
    meta_ad_id: AD,
  },
  last: {
    source: "facebook",
    medium: "paid",
    campaign: "52500000000001",
    content: "52500000000002",
    term: null,
  },
  ids_source: "utm",
};

describe("attributeCheckouts with the order-time snapshot", () => {
  it("first-touch reads the FIRST touch frozen on the order; last-touch reads the LAST", async () => {
    const [first] = await attributeCheckouts(ctx, [order({ snapshot })], "first");
    const [last] = await attributeCheckouts(ctx, [order({ snapshot })], "last");
    expect(first.touch).toMatchObject({
      source: "instagram",
      campaign: CAMP,
      content: AD,
      stamped: true,
    });
    expect(last.touch).toMatchObject({
      source: "facebook",
      campaign: "52500000000001",
      content: "52500000000002",
    });
    expect(first.via).toBe("order_utm");
    expect(last.via).toBe("order_utm");
  });

  it("the snapshot wins over the order's utm_* columns (it is the fuller record)", async () => {
    const [r] = await attributeCheckouts(
      ctx,
      [order({ snapshot, utm_source: "ig", utm_medium: "paid", utm_campaign: "OTHER" })],
      "last",
    );
    expect(r.touch?.campaign).toBe("52500000000001");
  });

  it("an order without a snapshot behaves exactly as before (utm_* columns, else unattributed)", async () => {
    const [withUtm, none] = await attributeCheckouts(
      ctx,
      [order({ utm_source: "ig", utm_medium: "paid", utm_campaign: CAMP }), order()],
      "last",
    );
    expect(withUtm).toMatchObject({
      via: "order_utm",
      touch: { source: "instagram", campaign: CAMP },
    });
    expect(none).toMatchObject({ via: "none", touch: null });
  });

  it("a snapshot whose last touch is empty falls back instead of inventing one", async () => {
    const onlyFirst = { ...snapshot, last: null };
    const [last] = await attributeCheckouts(
      ctx,
      [order({ snapshot: onlyFirst, utm_source: "ig", utm_medium: "paid", utm_campaign: CAMP })],
      "last",
    );
    expect(last.touch?.campaign).toBe(CAMP); // from utm_*, not from the first touch
    const [first] = await attributeCheckouts(ctx, [order({ snapshot: onlyFirst })], "first");
    expect(first.touch?.source).toBe("instagram");
  });

  it("garbage in the stored column is ignored, never trusted", async () => {
    for (const bad of ["x", 5, {}, { v: 9, first: { source: "x" } }, [1, 2]]) {
      const [r] = await attributeCheckouts(ctx, [order({ snapshot: bad })], "last");
      expect(r.via).toBe("none");
    }
  });
});
