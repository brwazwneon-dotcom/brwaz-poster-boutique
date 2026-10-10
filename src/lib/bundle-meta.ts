// Which posters a "N Frames Bundle" order row contains. `orders` keeps ONE
// poster_image per row, so before this the other posters of a bundle were only
// names inside poster_title — and a name can match several different posters.
// The checkout now also stores each poster's id/title/image as JSON in the
// row's `notes` (the same place custom-design uploads keep their metadata).
// The server rewrites it from the posters table by id, so the browser can't
// put anything else there.
export type BundlePosterMeta = { id: string | null; title: string; image: string };
export type BundleMeta = { bundle_posters: BundlePosterMeta[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_POSTERS = 30;

export function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\/\S+$/.test(v) && v.length <= 2000;
}

export function buildBundleNotes(
  posters: Array<{ posterId: string; title: string; image: string }>,
): string {
  const meta: BundleMeta = {
    bundle_posters: posters.slice(0, MAX_POSTERS).map((p) => ({
      id: UUID_RE.test(p.posterId) ? p.posterId : null,
      title: String(p.title ?? "").slice(0, 200),
      image: isHttpUrl(p.image) ? p.image : "",
    })),
  };
  return JSON.stringify(meta);
}

export function parseBundleMeta(notes: string | null | undefined): BundleMeta | null {
  if (!notes || notes[0] !== "{") return null;
  try {
    const parsed = JSON.parse(notes) as { bundle_posters?: unknown };
    if (!Array.isArray(parsed.bundle_posters)) return null;
    const posters = parsed.bundle_posters
      .slice(0, MAX_POSTERS)
      .map((p): BundlePosterMeta | null => {
        if (!p || typeof p !== "object") return null;
        const o = p as Record<string, unknown>;
        return {
          id: typeof o.id === "string" && UUID_RE.test(o.id) ? o.id : null,
          title: typeof o.title === "string" ? o.title : "",
          image: isHttpUrl(o.image) ? o.image : "",
        };
      })
      .filter((p): p is BundlePosterMeta => p !== null);
    return posters.length > 0 ? { bundle_posters: posters } : null;
  } catch {
    return null;
  }
}

/**
 * Server side: rebuild the notes from the posters table (by id) so the stored
 * title/image are the real ones. Posters not found keep what the browser sent
 * only if its image is a real URL.
 */
export function canonicalBundleNotes(
  notes: string | null | undefined,
  catalog: Map<string, { title: string; image_url: string | null }>,
): string | null {
  const meta = parseBundleMeta(notes);
  if (!meta) return null;
  return JSON.stringify({
    bundle_posters: meta.bundle_posters.map((p) => {
      const real = p.id ? catalog.get(p.id) : undefined;
      return {
        id: p.id,
        title: real?.title ?? p.title,
        image: isHttpUrl(real?.image_url) ? real!.image_url : p.image,
      };
    }),
  } satisfies BundleMeta);
}

export function bundlePosterIds(notes: string | null | undefined): string[] {
  return (parseBundleMeta(notes)?.bundle_posters ?? [])
    .map((p) => p.id)
    .filter((id): id is string => !!id);
}

/**
 * The stored image of the idx-th poster named in a bundle's title. Matched by
 * position when the counts agree (the title and the meta come from the same
 * list), otherwise by exact title — never a guess.
 */
export function bundleImageAt(
  meta: BundleMeta | null,
  names: string[],
  idx: number,
): string | null {
  if (!meta) return null;
  const list = meta.bundle_posters;
  if (list.length === names.length) return list[idx]?.image || null;
  const hits = list.filter((p) => p.title === names[idx] && p.image);
  return hits.length === 1 ? hits[0].image : null;
}
