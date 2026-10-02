import { useCallback, useEffect, useRef, useState } from "react";
import { IMAGE_FALLBACK } from "@/lib/storage-url";
import { enqueueImageLoad, waitForResponsiveHold } from "@/lib/image-loader-queue";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  avifSrcSet?: string;
  webpSrcSet?: string;
  fallbackSrc?: string;
};

export function SafeImage({
  src,
  avifSrcSet,
  webpSrcSet,
  fallbackSrc,
  onError,
  onLoad,
  loading,
  decoding,
  sizes,
  fetchPriority,
  style,
  ...rest
}: Props) {
  // The fallback URL being retried, tagged with the src it replaces so a new
  // `src` automatically starts over from the primary URL.
  const [retry, setRetry] = useState<{ for: string | undefined; url: string } | null>(null);
  const displaySrc = retry && retry.for === src ? retry.url : src;
  const key = displaySrc ?? "";
  // Load state is recorded per URL, so a new src is "not loaded" in the very
  // render it arrives in — a plain boolean still said "loaded" for one commit
  // and briefly rendered the new image eagerly, bypassing lazy loading.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [erroredFor, setErroredFor] = useState<string | null>(null);
  // Lazy images are fetched by the browser itself (native loading="lazy"),
  // not preloaded through the queue on mount — preloading every mounted image
  // made loading="lazy" meaningless. Eager / high-priority images (heroes,
  // first slides) keep the queue preload exactly as before.
  const nativeLazy = (loading ?? "lazy") === "lazy" && fetchPriority !== "high";
  // Native path: the real <img> is only rendered after mount (never in SSR
  // HTML, so its load event can't fire before React is listening) and after
  // any pending resized-variant request settles (see waitForResponsiveHold).
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const errored = erroredFor === key;
  const loaded = loadedFor === key || !displaySrc || displaySrc === IMAGE_FALLBACK;
  const nativeReady = readyFor === key;
  const mountedRef = useRef(true);
  const signalRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!displaySrc || displaySrc === IMAGE_FALLBACK) return;

    signalRef.current?.abort();
    const ac = new AbortController();
    signalRef.current = ac;

    // Preload the same resized variant the <picture> below will show (only
    // for the primary src; a retry with the fallback URL has no variants).
    const responsive =
      displaySrc === src && (avifSrcSet || webpSrcSet)
        ? { avifSrcSet, webpSrcSet, sizes }
        : undefined;

    if (nativeLazy) {
      if (responsive) {
        setReadyFor(displaySrc);
      } else {
        void waitForResponsiveHold(ac.signal).then(() => {
          if (mountedRef.current && !ac.signal.aborted) setReadyFor(displaySrc);
        });
      }
      return () => {
        ac.abort();
      };
    }

    enqueueImageLoad(displaySrc, fallbackSrc, ac.signal, responsive, {
      priority: fetchPriority === "high",
    })
      .then(() => {
        if (mountedRef.current && !ac.signal.aborted) {
          setLoadedFor(displaySrc);
        }
      })
      .catch(() => {
        if (mountedRef.current && !ac.signal.aborted) {
          setErroredFor(displaySrc);
        }
      });

    return () => {
      ac.abort();
    };
  }, [displaySrc, src, fallbackSrc, avifSrcSet, webpSrcSet, sizes, fetchPriority, nativeLazy]);

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      // Decided by which URL just failed, not an attempt counter: the
      // primary falls back to fallbackSrc once; anything else is final.
      if (displaySrc === src && fallbackSrc && fallbackSrc !== src) {
        setRetry({ for: src, url: fallbackSrc });
      } else {
        setErroredFor(key);
      }
      onError?.(e);
    },
    [displaySrc, key, fallbackSrc, src, onError],
  );

  const pending = !loaded && !errored && !!displaySrc && displaySrc !== IMAGE_FALLBACK;
  const skeleton = (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[3] animate-pulse"
      style={{
        background:
          "linear-gradient(110deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.18) 45%, rgba(255,255,255,0.06) 100%)",
        backgroundColor: "rgba(255,255,255,0.08)",
      }}
    />
  );

  // Queue path: nothing but the skeleton until the preload finishes.
  // Native path: the skeleton until mount; then the real lazy <img>
  // (invisible) under the skeleton until the browser has loaded it.
  if (pending && (!nativeLazy || !nativeReady)) return skeleton;

  const img = (
    <img
      {...rest}
      style={pending ? { ...style, opacity: 0 } : style}
      src={errored || !displaySrc ? IMAGE_FALLBACK : displaySrc}
      sizes={sizes}
      fetchPriority={fetchPriority}
      loading={loaded ? "eager" : (loading ?? "lazy")}
      decoding={decoding ?? "async"}
      onError={handleError}
      onLoad={(e) => {
        if (!loaded) setLoadedFor(key);
        onLoad?.(e);
      }}
    />
  );

  // Sources only for the primary URL: once the fallback / IMAGE_FALLBACK is
  // shown, a still-matching <source> would override the <img src> and keep
  // displaying the variant that just failed.
  const content =
    (!avifSrcSet && !webpSrcSet) || displaySrc !== src || errored ? (
      img
    ) : (
      <picture className="contents">
        {avifSrcSet ? <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} /> : null}
        {webpSrcSet ? <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} /> : null}
        {img}
      </picture>
    );

  if (!pending) return content;
  return (
    <>
      {content}
      {skeleton}
    </>
  );
}

export { enqueueImageLoad };
