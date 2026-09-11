export async function safePromiseFn<T>(
  // PromiseLike, not Promise: Supabase query builders (e.g. `.from(...).select(...)`)
  // are thenables but not nominally `Promise<T>`, and both `await` and
  // `Promise.race` accept any thenable at runtime — widening the type here
  // just lets TypeScript accept what already works, with no behavior change.
  fn: PromiseLike<T>,
  // `null`, not `T`: every current caller already treats `status !==
  // "ok"` as its cue to compute its own typed default rather than trust
  // this value's shape (see callers in system-health.functions.ts), so
  // requiring `fallback` to match T forced callers to fake a shape they
  // never actually use. `null` is always valid regardless of T.
  fallback: T | null,
  name: string,
  timeoutMs = 3000,
): Promise<{ value: T | null; status: "ok" | "unavailable"; error?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    const value = await Promise.race([fn, timeout]);
    return { value, status: "ok" };
  } catch (e) {
    console.warn(`Health check "${name}" failed:`, e);
    return {
      value: fallback,
      status: "unavailable",
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
