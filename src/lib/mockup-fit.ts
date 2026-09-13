/**
 * Aspect-ratio-vs-print-ratio fit checking for the bulk upload studio.
 * Thresholds ported from the pre-Neon-migration BulkPosterUploader.tsx,
 * tuned around the fixed 2:3 poster print ratio (~0.667).
 */

export type AspectBucket = "good" | "square" | "tall" | "wide";

export function bucketAspect(ratio: number): AspectBucket {
  if (Math.abs(ratio - 1) < 0.08) return "square";
  if (ratio < 0.55) return "tall";
  if (ratio > 0.82) return "wide";
  return "good";
}

export type MockupFit = { ok: boolean; reason: string | null };

const BUCKET_REASON: Record<Exclude<AspectBucket, "good">, string> = {
  square: "Nearly square — will be cropped or leave empty space in the 2:3 frame",
  tall: "Too tall for 2:3 — sides will be cropped",
  wide: "Too wide for 2:3 — top/bottom will be cropped",
};

export function computeMockupFit(ratio: number | null): MockupFit {
  if (ratio == null || !Number.isFinite(ratio)) return { ok: true, reason: null };
  const bucket = bucketAspect(ratio);
  if (bucket === "good") return { ok: true, reason: null };
  return { ok: false, reason: BUCKET_REASON[bucket] };
}

/** Reduce a decimal ratio to a friendly "W:H" string, e.g. 0.667 -> "2:3". */
export function friendlyRatio(ratio: number): string {
  const candidates: Array<[number, number]> = [
    [1, 1], [2, 3], [3, 2], [3, 4], [4, 3], [4, 5], [5, 4], [9, 16], [16, 9], [1, 2], [2, 1],
  ];
  let best: [number, number] = [Math.round(ratio * 100), 100];
  let bestErr = Infinity;
  for (const [w, h] of candidates) {
    const err = Math.abs(w / h - ratio);
    if (err < bestErr) {
      bestErr = err;
      best = [w, h];
    }
  }
  return bestErr < 0.03 ? `${best[0]}:${best[1]}` : ratio.toFixed(2);
}
