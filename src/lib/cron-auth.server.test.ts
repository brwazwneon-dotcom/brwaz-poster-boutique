import { describe, expect, it } from "vitest";
import { checkCronAuth, cronAuthFailure } from "./cron-auth.server";

const req = (authorization?: string) =>
  new Request("https://x.test/api/cron", { headers: authorization ? { authorization } : {} });
const SECRET = "s3cr3t-value-for-tests-1234567890";

describe("cron auth (CRON_SECRET)", () => {
  it("refuses everything when CRON_SECRET is not configured, even a header that looks right", () => {
    expect(checkCronAuth(req(), {})).toBe("not_configured");
    expect(checkCronAuth(req(`Bearer ${SECRET}`), {})).toBe("not_configured");
    expect(checkCronAuth(req(`Bearer `), { CRON_SECRET: "" })).toBe("not_configured");
  });

  it("rejects a missing, wrong, unprefixed or same-length-wrong secret", () => {
    const env = { CRON_SECRET: SECRET };
    expect(checkCronAuth(req(), env)).toBe("unauthorized");
    expect(checkCronAuth(req("Bearer nope"), env)).toBe("unauthorized");
    expect(checkCronAuth(req(SECRET), env)).toBe("unauthorized");
    expect(checkCronAuth(req(`Bearer ${"x".repeat(SECRET.length)}`), env)).toBe("unauthorized");
    expect(checkCronAuth(req(`bearer ${SECRET}`), env)).toBe("unauthorized");
  });

  it("accepts exactly 'Bearer <secret>'", () => {
    expect(checkCronAuth(req(`Bearer ${SECRET}`), { CRON_SECRET: SECRET })).toBe("ok");
  });

  it("the failure responses carry a status and no secret", async () => {
    const nc = cronAuthFailure("not_configured")!;
    const un = cronAuthFailure("unauthorized")!;
    expect(nc.status).toBe(503);
    expect(un.status).toBe(401);
    expect(cronAuthFailure("ok")).toBeNull();
    for (const r of [nc, un]) {
      const text = await r.text();
      expect(text).not.toContain(SECRET);
      expect(JSON.parse(text).ok).toBe(false);
    }
  });
});
