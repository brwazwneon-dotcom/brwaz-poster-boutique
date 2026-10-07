import { timingSafeEqual } from "node:crypto";

// Shared guard for Vercel Cron routes. Vercel Cron calls a route with
// `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET configured a cron route refuses
// to run at all (503), and a wrong or missing header is a 401. The comparison is constant-time
// and the secret is never echoed in a response.
export type CronAuth = "ok" | "not_configured" | "unauthorized";

export function checkCronAuth(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): CronAuth {
  const secret = env.CRON_SECRET;
  if (!secret) return "not_configured";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected)
    ? "ok"
    : "unauthorized";
}

/** A ready response for a failed check, or null when the request may proceed. */
export function cronAuthFailure(auth: CronAuth): Response | null {
  if (auth === "not_configured") {
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}
