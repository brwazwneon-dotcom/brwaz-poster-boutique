// Which image an order row should store. The browser sends whatever image its
// cart item carried, which is sometimes empty or not a real URL (a poster
// added before its image variants had loaded, an old cached cart, a dead
// storage host). The order's image is its permanent record, so when the
// browser's value isn't usable the server falls back to the poster's own
// catalog image at order time.
const DEAD_HOSTS = ["blob.vercel-storage.com"];

export function isUsableOrderImage(url: unknown): url is string {
  if (typeof url !== "string" || !/^https?:\/\/\S+$/.test(url)) return false;
  return !DEAD_HOSTS.some((h) => url.includes(h));
}

export function chooseOrderImage(sent: unknown, catalogUrl: string | null | undefined): string {
  if (isUsableOrderImage(sent)) return sent;
  if (isUsableOrderImage(catalogUrl)) return catalogUrl;
  return typeof sent === "string" ? sent : "";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function posterIdsNeedingImage(
  rows: Array<{ selected_poster: string | null; poster_image: unknown }>,
): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    if (
      r.selected_poster &&
      UUID_RE.test(r.selected_poster) &&
      !isUsableOrderImage(r.poster_image)
    ) {
      ids.add(r.selected_poster);
    }
  }
  return [...ids];
}
