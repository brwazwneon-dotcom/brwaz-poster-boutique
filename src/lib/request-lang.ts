import { createServerFn } from "@tanstack/react-start";

export type Lang = "ar" | "en";
export const LANG_COOKIE = "brw_lang";

/** Language the server should render for a request: cookie first, then Accept-Language (first supported
 *  tag wins; if none is supported -> "ar", like the old client detector). No header at all (bots,
 *  health checks) keeps "en", which is what the server rendered before, so crawlers see no change. */
export function resolveRequestLang(cookie: string | null, acceptLanguage: string | null): Lang {
  const fromCookie = cookie?.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=(ar|en)(?:;|$)`))?.[1];
  if (fromCookie === "ar" || fromCookie === "en") return fromCookie;
  if (!acceptLanguage) return "en";
  const tags = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? "1");
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((t) => t.tag && t.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    if (tag.startsWith("ar")) return "ar";
    if (tag.startsWith("en")) return "en";
  }
  return "ar";
}

export const getRequestLang = createServerFn({ method: "GET" }).handler(async (): Promise<Lang> => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  return resolveRequestLang(req.headers.get("cookie"), req.headers.get("accept-language"));
});
