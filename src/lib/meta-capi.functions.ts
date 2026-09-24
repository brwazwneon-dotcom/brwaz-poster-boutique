import { createServerFn } from "@tanstack/react-start";
import { RelayInputSchema } from "@/lib/meta-events";

// PUBLIC endpoint: the browser relays its Pixel events here so Meta can
// deduplicate them (same event_id). It is deliberately narrow:
//  - only allow-listed event names are accepted (Purchase is NOT one of them —
//    revenue events are built on the server from stored order data);
//  - the payload is validated here and sanitised again in the handler;
//  - nothing about the request decides the Meta account or token.
// Config, token, hashing and the Graph call live in meta-capi.server.ts.
export const sendCapiEvent = createServerFn({ method: "POST" })
  .validator((input: unknown) => RelayInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { relayBrowserEvent } = await import("@/lib/meta-capi.server");
    return relayBrowserEvent(data);
  });
