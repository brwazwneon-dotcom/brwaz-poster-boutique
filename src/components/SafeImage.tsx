import { useCallback, useEffect, useRef, useState } from "react";
import { IMAGE_FALLBACK } from "@/lib/storage-url";
import { enqueueImageLoad } from "@/lib/image-loader-queue";

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
  ...rest
}: Props) {
  const [errored, setErrored] = useState(false);
  const [retrySrc, setRetrySrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const attemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const signalRef = useRef<AbortController | null>(null);
  const displaySrc = retrySrc ?? src;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setErrored(false);
    setRetrySrc(null);
    setLoaded(false);
    attemptsRef.current = 0;

    if (!displaySrc || displaySrc === IMAGE_FALLBACK) {
      setLoaded(true);
      return;
    }

    signalRef.current?.abort();
    const ac = new AbortController();
    signalRef.current = ac;

    enqueueImageLoad(displaySrc, fallbackSrc, ac.signal)
      .then(() => {
        if (mountedRef.current && !ac.signal.aborted) {
          setLoaded(true);
        }
      })
      .catch(() => {
        if (mountedRef.current && !ac.signal.aborted) {
          setErrored(true);
          setLoaded(true);
        }
      });

    return () => {
      ac.abort();
    };
  }, [displaySrc, fallbackSrc]);

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      attemptsRef.current += 1;
      if (attemptsRef.current === 1 && fallbackSrc && fallbackSrc !== src) {
        setRetrySrc(fallbackSrc);
      } else {
        setErrored(true);
      }
      onError?.(e);
    },
    [fallbackSrc, src, onError],
  );

  if (!loaded && !errored && displaySrc && displaySrc !== IMAGE_FALLBACK) {
    return (
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
  }

  const img = (
    <img
      {...rest}
      src={errored || !displaySrc ? IMAGE_FALLBACK : displaySrc}
      sizes={sizes}
      loading={loaded ? "eager" : loading ?? "lazy"}
      decoding={decoding ?? "async"}
      onError={handleError}
      onLoad={(e) => {
        if (!loaded) setLoaded(true);
        onLoad?.(e);
      }}
    />
  );

  if (!avifSrcSet && !webpSrcSet) return img;

  return (
    <picture className="contents">
      {avifSrcSet ? <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} /> : null}
      {webpSrcSet ? <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} /> : null}
      {img}
    </picture>
  );
}

export { enqueueImageLoad };
