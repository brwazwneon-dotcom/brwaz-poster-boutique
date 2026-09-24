// Best-effort work that must NEVER delay the customer's response.
//
// On Vercel a serverless function may be frozen the moment the response is sent,
// so a plain un-awaited promise can be lost. Vercel exposes `waitUntil` on the
// request context (this is exactly what `@vercel/functions` reads); it keeps the
// function alive for the task WITHOUT holding the response.
//
// Modes:
//  - "deferred": Vercel `waitUntil` available → the response is not held at all.
//  - "detached": not on Vercel (local dev, a long-lived Node server) → the
//                process outlives the response, so the task simply runs on.
//  - "bounded":  on Vercel but no `waitUntil` found → we cannot safely detach,
//                so wait for the task, but never longer than `boundMs`.
// The task can never reject into the caller.
type WaitUntil = (promise: Promise<unknown>) => void;

const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

function vercelWaitUntil(): WaitUntil | null {
  try {
    const holder = (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT] as
      { get?: () => { waitUntil?: WaitUntil } | undefined } | undefined;
    const ctx = holder?.get?.();
    return typeof ctx?.waitUntil === "function" ? (p) => ctx.waitUntil!(p) : null;
  } catch {
    return null;
  }
}

export type AfterResponseMode = "deferred" | "detached" | "bounded";

export async function afterResponse(
  task: (info: { deferred: boolean }) => Promise<unknown>,
  opts: { boundMs?: number } = {},
): Promise<AfterResponseMode> {
  const run = (deferred: boolean) =>
    Promise.resolve()
      .then(() => task({ deferred }))
      .catch(() => {
        /* best-effort: a failing task must never surface to the caller */
      });

  const wait = vercelWaitUntil();
  if (wait) {
    wait(run(true));
    return "deferred";
  }
  if (!process.env.VERCEL) {
    void run(true);
    return "detached";
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    run(false),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, opts.boundMs ?? 3_500);
    }),
  ]);
  if (timer) clearTimeout(timer);
  return "bounded";
}
