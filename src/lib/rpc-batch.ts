// Merges calls made within a few milliseconds of each other into one request.
//
// The storefront asks for small slices of the same data from many components at
// once (about a dozen site-setting lookups and a handful of poster-image lookups
// right after hydration). Each one used to be its own server round trip; on a
// phone connection that is a queue of requests all waiting for each other.

type Waiter<R> = { keys: string[]; resolve: (value: R) => void; reject: (reason: unknown) => void };

/**
 * `fetchMany(keys)` performs ONE request for the union of the keys and returns
 * a record keyed by those keys. Each caller gets back only the keys it asked
 * for. Outside the browser (server rendering) calls go straight through.
 */
export function createKeyBatcher<V>(
  fetchMany: (keys: string[]) => Promise<Record<string, V>>,
  options: { windowMs?: number; maxKeys?: number } = {},
): (keys: string[]) => Promise<Record<string, V>> {
  const windowMs = options.windowMs ?? 12;
  const maxKeys = options.maxKeys ?? 80;
  let waiters: Waiter<Record<string, V>>[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const batch = waiters;
    waiters = [];
    if (batch.length === 0) return;
    const all = Array.from(new Set(batch.flatMap((w) => w.keys)));
    const chunks: string[][] = [];
    for (let i = 0; i < all.length; i += maxKeys) chunks.push(all.slice(i, i + maxKeys));
    Promise.all(chunks.map((chunk) => fetchMany(chunk))).then(
      (parts) => {
        const merged: Record<string, V> = Object.assign({}, ...parts);
        for (const w of batch) {
          const out: Record<string, V> = {};
          for (const key of w.keys) if (key in merged) out[key] = merged[key];
          w.resolve(out);
        }
      },
      (error) => {
        for (const w of batch) w.reject(error);
      },
    );
  };

  return (keys: string[]) => {
    if (typeof window === "undefined" || keys.length === 0) return fetchMany(keys);
    return new Promise<Record<string, V>>((resolve, reject) => {
      waiters.push({ keys, resolve, reject });
      if (!timer) timer = setTimeout(flush, windowMs);
    });
  };
}
