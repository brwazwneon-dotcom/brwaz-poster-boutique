// Every category and sub-category has its own page: /category/<slug>. These helpers
// build that address and copy / share it.

const SITE = "https://brwazwneon.com";

export function categoryUrl(slug: string, poster?: string): string {
  const base = `${SITE}/category/${encodeURIComponent(slug)}`;
  return poster ? `${base}?poster=${encodeURIComponent(poster)}` : base;
}

/** Copies the text; falls back to a hidden textarea where the Clipboard API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Phone share sheet when there is one; otherwise copy. Returns what happened. */
export async function shareOrCopy(
  url: string,
  title: string,
): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator.share === "function" && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      await navigator.share({ url, title });
      return "shared";
    }
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return "shared";
  }
  return (await copyText(url)) ? "copied" : "failed";
}
