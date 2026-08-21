export async function safePromiseFn<T>(
  fn: Promise<T>,
  fallback: T,
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
