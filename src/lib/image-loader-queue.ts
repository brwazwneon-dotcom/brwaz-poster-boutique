const MAX_CONCURRENT = 6;

export type ResponsiveSources = {
  avifSrcSet?: string;
  webpSrcSet?: string;
  sizes?: string;
};

type QueueItem = {
  src: string;
  fallbackSrc?: string;
  responsive?: ResponsiveSources;
  enqueuedAt: number;
  signal?: AbortSignal;
  resolve: (url: string) => void;
  reject: (reason: unknown) => void;
};

let activeCount = 0;
const pending: QueueItem[] = [];

// Cards learn their resized variants from a second request that finishes a
// moment after they first render. Until it does, all they have is the
// full-size original, and loading that just to replace it a moment later with
// the small variant doubles the bytes. While any such request is in flight,
// originals (items without responsive sources) wait, for at most HOLD_MS, so
// a slow or failed request can never block images.
const HOLD_MS = 1500;
const responsivePending = new Map<string, number>();

export function markResponsivePending(key: string): void {
  if (!responsivePending.has(key)) responsivePending.set(key, Date.now());
}

export function clearResponsivePending(key: string): void {
  if (responsivePending.delete(key)) processQueue();
}

function hasFreshResponsivePending(): boolean {
  const now = Date.now();
  for (const [key, since] of responsivePending) {
    if (now - since > HOLD_MS) responsivePending.delete(key);
  }
  return responsivePending.size > 0;
}

function isHeld(item: QueueItem): boolean {
  if (item.responsive || item.signal?.aborted) return false;
  if (Date.now() - item.enqueuedAt > HOLD_MS) return false;
  return hasFreshResponsivePending();
}

let recheckTimer: ReturnType<typeof setTimeout> | null = null;

function processQueue(): void {
  let i = 0;
  while (activeCount < MAX_CONCURRENT && i < pending.length) {
    if (isHeld(pending[i])) {
      i++;
      continue;
    }
    const item = pending.splice(i, 1)[0];
    activeCount++;
    loadImage(item).finally(() => {
      activeCount--;
      processQueue();
    });
  }
  if (!recheckTimer && pending.some(isHeld)) {
    recheckTimer = setTimeout(() => {
      recheckTimer = null;
      processQueue();
    }, 60);
  }
}

function loadImage(item: QueueItem): Promise<void> {
  return new Promise<void>((resolveLoad) => {
    const { src, fallbackSrc, responsive, signal, resolve, reject } = item;

    if (signal?.aborted) {
      // activeCount was already incremented by processQueue() before this
      // ran, and its own .finally() decrements it once this promise
      // resolves — decrementing again here double-counted every already-
      // aborted item (frequent: SafeImage recreates its AbortController on
      // every re-render, aborting stale queue entries), driving activeCount
      // permanently negative and letting far more than MAX_CONCURRENT
      // image loads fire at once — the likely cause of "images sometimes
      // load slowly / fail to appear" under any re-render churn (a fast
      // scroll, a hydration mismatch recovery, a filter change).
      reject(new DOMException("Aborted", "AbortError"));
      resolveLoad();
      return;
    }

    const attempt = (url: string, sources?: ResponsiveSources) => {
      return new Promise<string>((res, rej) => {
        // When the visible <picture> will pick a resized AVIF/WebP variant,
        // preload exactly that one. Preloading the plain `src` here used to
        // download the full-size original as well (often 2-4x the bytes)
        // and then the <picture> fetched its own small variant on top.
        // Building the same <picture> off-screen makes the browser choose
        // the same candidate, which the visible one then reuses from cache.
        let img: HTMLImageElement;
        let holder: HTMLPictureElement | null = null;
        if (sources && (sources.avifSrcSet || sources.webpSrcSet)) {
          holder = document.createElement("picture");
          const add = (type: string, srcSet: string) => {
            const s = document.createElement("source");
            s.type = type;
            s.srcset = srcSet;
            if (sources.sizes) s.sizes = sources.sizes;
            holder!.appendChild(s);
          };
          if (sources.avifSrcSet) add("image/avif", sources.avifSrcSet);
          if (sources.webpSrcSet) add("image/webp", sources.webpSrcSet);
          img = document.createElement("img");
          if (sources.sizes) img.sizes = sources.sizes;
          holder.appendChild(img);
        } else {
          img = new Image();
        }
        img.onload = () => res(url);
        img.onerror = () => rej(new Error(`Failed to load: ${url}`));
        if (signal) {
          signal.addEventListener(
            "abort",
            () => {
              holder?.replaceChildren(img);
              img.removeAttribute("srcset");
              img.src = "";
              rej(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        }
        img.src = url;
      });
    };

    attempt(src, responsive)
      .then((url) => {
        resolve(url);
        resolveLoad();
      })
      .catch(() => {
        if (fallbackSrc && fallbackSrc !== src) {
          attempt(fallbackSrc)
            .then((url) => {
              resolve(url);
              resolveLoad();
            })
            .catch((err) => {
              reject(err);
              resolveLoad();
            });
        } else {
          reject(new Error(`All attempts failed: ${src}`));
          resolveLoad();
        }
      });
  });
}

export function enqueueImageLoad(
  src: string,
  fallbackSrc?: string,
  signal?: AbortSignal,
  responsive?: ResponsiveSources,
): Promise<string> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));

  return new Promise<string>((resolve, reject) => {
    pending.push({ src, fallbackSrc, responsive, enqueuedAt: Date.now(), signal, resolve, reject });
    processQueue();
  });
}

export function getActiveCount(): number {
  return activeCount;
}

export function getPendingCount(): number {
  return pending.length;
}
