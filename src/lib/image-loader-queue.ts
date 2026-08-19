const MAX_CONCURRENT = 6;

type QueueItem = {
  src: string;
  fallbackSrc?: string;
  signal?: AbortSignal;
  resolve: (url: string) => void;
  reject: (reason: unknown) => void;
};

let activeCount = 0;
const pending: QueueItem[] = [];

function processQueue(): void {
  while (activeCount < MAX_CONCURRENT && pending.length > 0) {
    const item = pending.shift()!;
    activeCount++;
    loadImage(item).finally(() => {
      activeCount--;
      processQueue();
    });
  }
}

function loadImage(item: QueueItem): Promise<void> {
  return new Promise<void>((resolveLoad) => {
    const { src, fallbackSrc, signal, resolve, reject } = item;

    if (signal?.aborted) {
      activeCount--;
      reject(new DOMException("Aborted", "AbortError"));
      resolveLoad();
      return;
    }

    const attempt = (url: string) => {
      return new Promise<string>((res, rej) => {
        const img = new Image();
        img.onload = () => res(url);
        img.onerror = () => rej(new Error(`Failed to load: ${url}`));
        if (signal) {
          signal.addEventListener(
            "abort",
            () => {
              img.src = "";
              rej(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        }
        img.src = url;
      });
    };

    attempt(src)
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
): Promise<string> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));

  return new Promise<string>((resolve, reject) => {
    pending.push({ src, fallbackSrc, signal, resolve, reject });
    processQueue();
  });
}

export function getActiveCount(): number {
  return activeCount;
}

export function getPendingCount(): number {
  return pending.length;
}
