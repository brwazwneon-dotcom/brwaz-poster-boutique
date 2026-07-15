import { useEffect, useRef, useState } from "react";
import { IMAGE_FALLBACK } from "@/lib/storage-url";

type Props = React.ImgHTMLAttributes<HTMLImageElement>;

export function SafeImage({ src, onError, onLoad, loading, decoding, ...rest }: Props) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  useEffect(() => {
    setErrored(false);
    setLoaded(false);
    loadedRef.current = false;
    if (!src || src.startsWith("data:")) return;
    const id = window.setTimeout(() => {
      if (loadedRef.current) return;
      setErrored(true);
      try {
        const w = window as unknown as { __brwImageIssues?: Array<{ src: string; at: number; reason: string }> };
        w.__brwImageIssues = (w.__brwImageIssues ?? []).slice(-30);
        w.__brwImageIssues.push({ src, at: Date.now(), reason: "timeout_15000ms" });
      } catch {
        /* noop */
      }
    }, 15000);
    return () => window.clearTimeout(id);
  }, [src]);
  return (
    <img
      {...rest}
      src={errored || !src ? IMAGE_FALLBACK : src}
      loading={loading ?? "lazy"}
      decoding={decoding ?? "async"}
      onError={(e) => {
        if (!errored) setErrored(true);
        onError?.(e);
      }}
      onLoad={(e) => {
        loadedRef.current = true;
        setLoaded(true);
        onLoad?.(e);
      }}
    />
  );
}