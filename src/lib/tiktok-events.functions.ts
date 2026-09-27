import { createServerFn } from "@tanstack/react-start";
import { TikTokRelayInputSchema } from "@/lib/tiktok-events";

// PUBLIC endpoint: the browser relays its TikTok pixel events here so TikTok can
// deduplicate them (same event_id + name). Deliberately narrow, exactly like the
// Meta relay:
//  - only allow-listed event names are accepted (Purchase is NOT one of them —
//    revenue events are built on the server from stored order data);
//  - the payload is validated here and sanitised again in the handler;
//  - nothing in the request decides the pixel, the account or the token.
// Config, token, hashing and the API call live in tiktok-events.server.ts.
export const sendTikTokEventFromBrowser = createServerFn({ method: "POST" })
  .validator((input: unknown) => TikTokRelayInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { relayTikTokBrowserEvent } = await import("@/lib/tiktok-events.server");
    return relayTikTokBrowserEvent(data);
  });
