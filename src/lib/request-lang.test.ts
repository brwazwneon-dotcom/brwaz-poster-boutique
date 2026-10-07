import { describe, expect, it } from "vitest";
import { resolveRequestLang } from "./request-lang";

describe("resolveRequestLang", () => {
  it("cookie wins over Accept-Language", () => {
    expect(resolveRequestLang("a=1; brw_lang=ar; b=2", "en-US,en;q=0.9")).toBe("ar");
    expect(resolveRequestLang("brw_lang=en", "ar")).toBe("en");
  });
  it("ignores invalid cookie values", () => {
    expect(resolveRequestLang("brw_lang=fr", "ar-EG")).toBe("ar");
    expect(resolveRequestLang("xbrw_lang=ar", null)).toBe("en");
  });
  it("uses Accept-Language by preference order and q-values", () => {
    expect(resolveRequestLang(null, "ar-EG,ar;q=0.9,en;q=0.8")).toBe("ar");
    expect(resolveRequestLang(null, "en-US,en;q=0.9,ar;q=0.8")).toBe("en");
    expect(resolveRequestLang(null, "en;q=0.5,ar;q=0.9")).toBe("ar");
  });
  it("unsupported languages fall back to ar (old detector behaviour)", () => {
    expect(resolveRequestLang(null, "fr-FR,fr;q=0.9")).toBe("ar");
  });
  it("no signals keeps en so crawlers see the same HTML as before", () => {
    expect(resolveRequestLang(null, null)).toBe("en");
    expect(resolveRequestLang("", "")).toBe("en");
  });
});
