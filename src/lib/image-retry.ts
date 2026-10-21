// Safety net for every plain <img> on the site (banners, logos, collection tiles, cart thumbnails, ...).
// A dropped connection fails an image once and the browser never asks again, so the picture stays
// broken until the visitor reloads. This asks again on a back-off, and once more when the phone gets
// its connection back. SafeImage has its own retry (it swaps the element) and opts out with
// data-img-retry="own".

const DELAYS_MS = [1500, 4000, 9000];
const tries = new WeakMap<HTMLImageElement, number>();

function isRetryable(img: HTMLImageElement): boolean {
  if (img.dataset.imgRetry === "own") return false;
  const src = img.getAttribute("src") ?? "";
  const srcset = img.getAttribute("srcset") ?? "";
  if (!src && !srcset) return false;
  return !src.startsWith("data:") && !src.startsWith("blob:");
}

/** Makes the browser fetch the image again (re-setting the same attribute re-runs source selection). */
function refetch(img: HTMLImageElement): void {
  const srcset = img.getAttribute("srcset");
  const src = img.getAttribute("src");
  if (srcset) img.setAttribute("srcset", srcset);
  if (src) img.setAttribute("src", src);
}

function isBroken(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth === 0;
}

function scheduleRetry(img: HTMLImageElement): void {
  const n = tries.get(img) ?? 0;
  if (n >= DELAYS_MS.length) return;
  tries.set(img, n + 1);
  setTimeout(() => {
    if (img.isConnected && isRetryable(img) && isBroken(img)) refetch(img);
  }, DELAYS_MS[n]);
}

export function installImageRetry(target: Document = document, win: Window = window): () => void {
  // `error` does not bubble, so it is caught in the capture phase.
  const onError = (event: Event) => {
    const el = event.target;
    if (el instanceof HTMLImageElement && isRetryable(el)) scheduleRetry(el);
  };
  const onOnline = () => {
    for (const img of Array.from(target.images)) {
      if (isRetryable(img) && isBroken(img)) {
        tries.delete(img);
        refetch(img);
      }
    }
  };
  target.addEventListener("error", onError, true);
  win.addEventListener("online", onOnline);
  return () => {
    target.removeEventListener("error", onError, true);
    win.removeEventListener("online", onOnline);
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  installImageRetry();
}
