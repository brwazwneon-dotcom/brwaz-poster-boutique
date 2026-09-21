import { useCallback, useState } from "react";
import {
  sizesForFrame,
  type FrameColorId,
  type FrameTypeId,
  type SizeId,
} from "@/lib/poster-options";

/**
 * What the customer has chosen for the poster they are looking at. One value
 * for the whole configurator (preview, option controls, price bar and the
 * cart), so nothing can drift out of sync.
 */
export type PosterConfig = {
  frameType: FrameTypeId;
  size: SizeId;
  color: FrameColorId;
  quantity: number;
};

export const DEFAULT_POSTER_CONFIG: PosterConfig = {
  frameType: "pvc",
  size: "30x40",
  color: "black",
  quantity: 1,
};

/** The size most customers pick — gets a small badge in the size selector. */
export const MOST_POPULAR_SIZE: SizeId = "30x40";

/** Keeps the combination valid: wood frames are wood-coloured, PVC never is, and every frame offers its own sizes. */
export function normalizePosterConfig(c: PosterConfig): PosterConfig {
  let { size, color } = c;
  if (c.frameType === "wood") color = "wood";
  else if (color === "wood") color = "black";
  const allowed = sizesForFrame(c.frameType);
  if (!allowed.includes(size)) size = allowed[0];
  return {
    frameType: c.frameType,
    size,
    color,
    quantity: Math.min(99, Math.max(1, Math.trunc(c.quantity) || 1)),
  };
}

export type PosterConfigurator = {
  config: PosterConfig;
  setFrameType: (frameType: FrameTypeId) => void;
  setSize: (size: SizeId) => void;
  setColor: (color: FrameColorId) => void;
  setQuantity: (quantity: number) => void;
};

export function usePosterConfig(initial: PosterConfig = DEFAULT_POSTER_CONFIG): PosterConfigurator {
  const [config, setConfig] = useState<PosterConfig>(() => normalizePosterConfig(initial));
  const patch = useCallback(
    (next: Partial<PosterConfig>) =>
      setConfig((prev) => normalizePosterConfig({ ...prev, ...next })),
    [],
  );
  return {
    config,
    setFrameType: useCallback((frameType) => patch({ frameType }), [patch]),
    setSize: useCallback((size) => patch({ size }), [patch]),
    setColor: useCallback((color) => patch({ color }), [patch]),
    setQuantity: useCallback((quantity) => patch({ quantity }), [patch]),
  };
}
