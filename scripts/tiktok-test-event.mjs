#!/usr/bin/env node
/**
 * Sends ONE TikTok Events API *test* event so the owner can verify the token, the
 * pixel code and the request shape before turning the integration on.
 *
 *   TIKTOK_EVENTS_ACCESS_TOKEN=...  TIKTOK_TEST_EVENT_CODE=TEST12345 \
 *     node scripts/tiktok-test-event.mjs            # ViewContent
 *   ... node scripts/tiktok-test-event.mjs purchase # CompletePayment (dummy 100 EGP)
 *
 * Safety:
 *  - refuses to run without TIKTOK_TEST_EVENT_CODE, so it can never create a real conversion:
 *    the event only appears under Events Manager -> Test Events;
 *  - reads the token from the environment only and NEVER prints it (nor the request body);
 *    the output is the HTTP status and TikTok's own `code` / `message`.
 *
 * Success is `code: 0`. Then open Events Manager -> Test Events and look for the event.
 * If TikTok answers with another code, that message says what to fix (token, pixel code, schema).
 */
const token = process.env.TIKTOK_EVENTS_ACCESS_TOKEN?.trim();
const testCode = process.env.TIKTOK_TEST_EVENT_CODE?.trim();
const pixel = (process.env.TIKTOK_PIXEL_CODE || "D9E35TRC77UDPAPRP140").trim();
const kind = (process.argv[2] || "viewcontent").toLowerCase();

if (!token) {
  console.error("Set TIKTOK_EVENTS_ACCESS_TOKEN in the environment (not on the command line).");
  process.exit(2);
}
if (!testCode) {
  console.error(
    "Set TIKTOK_TEST_EVENT_CODE (Events Manager -> Test Events). This script only sends TEST events.",
  );
  process.exit(2);
}

const stamp = Date.now().toString(36);
const isPurchase = kind === "purchase";
const event = {
  event: isPurchase ? "CompletePayment" : "ViewContent",
  event_time: Math.floor(Date.now() / 1000),
  event_id: `${isPurchase ? "purchase_TEST" : "test"}-${stamp}`,
  user: { user_agent: "brwazwneon-test-script/1.0", ip: "41.65.10.20" },
  page: { url: "https://brwazwneon.com/" },
  properties: isPurchase
    ? {
        value: 100,
        currency: "EGP",
        content_type: "product",
        order_id: `TEST-${stamp}`,
        contents: [
          { content_id: "test-product", content_type: "product", quantity: 1, price: 100 },
        ],
      }
    : {
        content_type: "product",
        contents: [{ content_id: "test-product", content_type: "product", quantity: 1 }],
      },
};

const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Access-Token": token },
  body: JSON.stringify({
    event_source: "web",
    event_source_id: pixel,
    test_event_code: testCode,
    data: [event],
  }),
}).catch((e) => ({ networkError: e.message }));

if ("networkError" in res) {
  console.error("Network error:", res.networkError);
  process.exit(1);
}
const json = await res.json().catch(() => ({}));
console.log(`HTTP ${res.status}  code=${json.code ?? "?"}  message=${json.message ?? "?"}`);
console.log(`event: ${event.event}   event_id: ${event.event_id}   pixel: ${pixel}`);
console.log(
  json.code === 0
    ? "OK — now check Events Manager -> Test Events for this event."
    : "Not accepted — read the message above (token / pixel code / schema).",
);
process.exit(json.code === 0 ? 0 : 1);
