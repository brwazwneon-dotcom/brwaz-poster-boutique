// Poster pictures are served from the shop's own image host as two ready-made WebP files:
//   .../p/<posterId>-1000.webp (large) and .../p/<posterId>-480.webp (small card size).
// A card that shows a poster at ~200 px asks for the small one instead of the large one.
// Any other URL (e.g. a legacy host) is left to the caller.
const LARGE = /^(https?:\/\/[^?#]+\/p\/[0-9a-f-]{36})-(\d{3,4})\.webp$/i;

export function smallPosterUrl(url: string, width: number): string | null {
  const m = url.match(LARGE);
  if (!m) return null;
  return width <= 640 ? `${m[1]}-480.webp` : url;
}
