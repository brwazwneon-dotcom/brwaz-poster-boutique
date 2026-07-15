import { useEffect, useState } from "react";
import { IMAGE_FALLBACK } from "@/lib/storage-url";

type Props = React.ImgHTMLAttributes<HTMLImageElement>;

export function SafeImage({ src, onError, onLoad, loading, decoding, ...rest }: Props) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setErrored(false);
    setLoaded(false);
    if (!src || src.startsWith("data:")) return;
    if (loaded) return;
    const id = window.setTimeout(() => {
      setErrored(true);
      try {
        const w = window as unknown as { __brwImageIssues?: Array<{ src: string; at: number; reason: string }> };
        w.__brwImageIssues = (w.__brwImageIssues ?? []).slice(-30);
        w.__brwImageIssues.push({ src, at: Date.now(), reason: "timeout_1500ms" });
      } catch {
        /* noop */
      }
    }, 1500);
    return () => window.clearTimeout(id);
  }, [src, loaded]);
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
        setLoaded(true);
        onLoad?.(e);
      }}
    />
  );
}