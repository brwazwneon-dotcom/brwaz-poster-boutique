import { useState } from "react";
import { IMAGE_FALLBACK } from "@/lib/storage-url";

type Props = React.ImgHTMLAttributes<HTMLImageElement>;

export function SafeImage({ src, onError, ...rest }: Props) {
  const [errored, setErrored] = useState(false);
  return (
    <img
      {...rest}
      src={errored || !src ? IMAGE_FALLBACK : src}
      onError={(e) => {
        if (!errored) setErrored(true);
        onError?.(e);
      }}
    />
  );
}