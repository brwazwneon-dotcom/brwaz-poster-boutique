import { useState } from "react";
import { IMAGE_FALLBACK } from "@/lib/storage-url";

type Props = React.ImgHTMLAttributes<HTMLImageElement>;

export function SafeImage({ src, onError, loading, decoding, ...rest }: Props) {
  const [errored, setErrored] = useState(false);
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
    />
  );
}