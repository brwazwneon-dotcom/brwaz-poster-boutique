import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Pages are rendered in the visitor's language (cookie, then Accept-Language),
// so caches must not hand one visitor's language to another.
function withLanguageVary(response: Response): Response {
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.append("Vary", "Cookie, Accept-Language");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// The framework emits one <link rel="modulepreload"> per JS chunk the page
// needs (about 51 on the homepage), all at the same priority as the render-
// blocking CSS and the hero image. On a slow connection they share the pipe
// equally, which pushed the stylesheet and the hero image back by about a
// second each (measured). Keeping the hints but marking them low priority lets
// the CSS and hero go first while the JS still downloads in parallel.
const MODULEPRELOAD_TAG = /<link\b[^>]*?\brel=(["'])modulepreload\1[^>]*>/gi;
const FETCHPRIORITY_ATTR = /\sfetchpriority\s*=/i;
// A <link> tag is far shorter than this; it bounds how much text is held back
// waiting for a tag to finish when a chunk ends mid-tag.
const MAX_HELD_TAG_LENGTH = 2048;

export function lowerModulePreloadPriority(html: string): string {
  return html.replace(MODULEPRELOAD_TAG, (tag) =>
    FETCHPRIORITY_ATTR.test(tag) ? tag : tag.replace(/(\s*\/?>)$/, ' fetchpriority="low"$1'),
  );
}

// Index up to which `text` can be rewritten and flushed now: everything before
// a trailing, still-incomplete tag (a chunk can end in the middle of a <link>).
function safeFlushLength(text: string): number {
  const lastOpen = text.lastIndexOf("<");
  if (lastOpen === -1 || text.indexOf(">", lastOpen) !== -1) return text.length;
  return text.length - lastOpen > MAX_HELD_TAG_LENGTH ? text.length : lastOpen;
}

function withLowPriorityModulePreloads(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  // Compressed bodies can't be rewritten as text; this entry normally returns
  // them uncompressed (the platform compresses afterwards), so skipping is a
  // safe no-op rather than a risk.
  if (
    !contentType.includes("text/html") ||
    !response.body ||
    response.headers.has("content-encoding")
  ) {
    return response;
  }
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let held = "";
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = held + decoder.decode(chunk, { stream: true });
        const end = safeFlushLength(text);
        held = text.slice(end);
        if (end > 0) {
          controller.enqueue(encoder.encode(lowerModulePreloadPriority(text.slice(0, end))));
        }
      },
      flush(controller) {
        const rest = held + decoder.decode();
        if (rest) controller.enqueue(encoder.encode(lowerModulePreloadPriority(rest)));
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withLowPriorityModulePreloads(
        withLanguageVary(await normalizeCatastrophicSsrResponse(response)),
      );
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
