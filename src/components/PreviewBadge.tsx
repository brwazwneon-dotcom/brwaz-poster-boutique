import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { isPreviewMode, exitPreviewMode } from "@/lib/preview-mode";

/**
 * Floating badge shown when the visitor is viewing the site through
 * "Preview as Client". Read-only; no admin controls are exposed.
 */
export function PreviewBadge() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!isPreviewMode()) return;
    setActive(true);
    // Prevent search engines from indexing preview URLs.
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    document.documentElement.dataset.previewMode = "1";
    return () => {
      meta.remove();
      delete document.documentElement.dataset.previewMode;
    };
  }, []);

  if (!active) return null;

  const backToAdmin = () => {
    exitPreviewMode();
    // If this tab was opened from admin, close it; otherwise navigate.
    if (window.opener) {
      window.close();
      // Fallback in case the browser blocks window.close for user-opened tabs.
      setTimeout(() => {
        window.location.href = "/admin";
      }, 200);
    } else {
      window.location.href = "/admin";
    }
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 z-[9999] -translate-x-1/2 flex items-center gap-3 rounded-full border border-yellow-400/50 bg-black/90 px-4 py-2 text-xs font-medium text-yellow-300 shadow-lg backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <Eye className="h-4 w-4" aria-hidden />
      <span className="uppercase tracking-widest">Preview Mode — visible only to admin</span>
      <button
        type="button"
        onClick={backToAdmin}
        className="ml-2 inline-flex items-center gap-1 rounded-full bg-yellow-400 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-black transition hover:bg-yellow-300"
      >
        <X className="h-3 w-3" aria-hidden />
        Back to admin
      </button>
    </div>
  );
}
