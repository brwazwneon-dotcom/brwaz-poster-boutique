import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const VISIT_KEY = "brw:visit-count";
const DISMISS_KEY = "brw:install-dismiss";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (!sessionStorage.getItem("brw:counted")) {
        const n = Number(localStorage.getItem(VISIT_KEY) || "0") + 1;
        localStorage.setItem(VISIT_KEY, String(n));
        sessionStorage.setItem("brw:counted", "1");
      }
    } catch { /* ignore */ }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);

      let visits = 0;
      let dismiss = "";
      try {
        visits = Number(localStorage.getItem(VISIT_KEY) || "0");
        dismiss = localStorage.getItem(DISMISS_KEY) || "";
      } catch { /* ignore */ }

      if (dismiss === "never") return;
      if (dismiss.startsWith("later:")) {
        const ts = Number(dismiss.slice(6));
        if (Date.now() - ts < 1000 * 60 * 60 * 24 * 3) return;
      }
      if (visits >= 2) setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      try { localStorage.setItem(DISMISS_KEY, "never"); } catch { /* ignore */ }
    };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible || !deferred) return null;

  const handleInstall = async () => {
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      setVisible(false);
    }
  };

  const handleLater = () => {
    try { localStorage.setItem(DISMISS_KEY, `later:${Date.now()}`); } catch { /* ignore */ }
    setVisible(false);
  };

  const handleNever = () => {
    try { localStorage.setItem(DISMISS_KEY, "never"); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-white/10 bg-black/90 p-4 text-white shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-lg" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Install BRWAZWNEON App</p>
          <p className="mt-0.5 text-xs text-white/60">Fast access from your home screen.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          onClick={handleNever}
          className="rounded-md px-3 py-1.5 text-xs text-white/50 hover:text-white/80"
        >
          Never again
        </button>
        <button
          onClick={handleLater}
          className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
        >
          Later
        </button>
        <button
          onClick={handleInstall}
          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/90"
        >
          Install
        </button>
      </div>
    </div>
  );
}