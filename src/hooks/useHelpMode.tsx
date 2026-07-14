import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "brw_admin_help_mode";
const TOUR_KEY = "brw_admin_tour_seen";

type Ctx = {
  helpMode: boolean;
  setHelpMode: (v: boolean) => void;
  toggleHelpMode: () => void;
  tourSeen: boolean;
  markTourSeen: () => void;
  resetTour: () => void;
};

const HelpModeContext = createContext<Ctx | null>(null);

export function HelpModeProvider({ children }: { children: ReactNode }) {
  const [helpMode, setHelpModeState] = useState(false);
  const [tourSeen, setTourSeen] = useState(true); // default true to avoid SSR flash

  useEffect(() => {
    try {
      setHelpModeState(localStorage.getItem(STORAGE_KEY) === "1");
      setTourSeen(localStorage.getItem(TOUR_KEY) === "1");
    } catch {}
  }, []);

  const setHelpMode = useCallback((v: boolean) => {
    setHelpModeState(v);
    try { localStorage.setItem(STORAGE_KEY, v ? "1" : "0"); } catch {}
  }, []);

  const value = useMemo<Ctx>(() => ({
    helpMode,
    setHelpMode,
    toggleHelpMode: () => setHelpMode(!helpMode),
    tourSeen,
    markTourSeen: () => {
      setTourSeen(true);
      try { localStorage.setItem(TOUR_KEY, "1"); } catch {}
    },
    resetTour: () => {
      setTourSeen(false);
      try { localStorage.removeItem(TOUR_KEY); } catch {}
    },
  }), [helpMode, setHelpMode, tourSeen]);

  return <HelpModeContext.Provider value={value}>{children}</HelpModeContext.Provider>;
}

export function useHelpMode(): Ctx {
  const ctx = useContext(HelpModeContext);
  if (!ctx) {
    return {
      helpMode: false,
      setHelpMode: () => {},
      toggleHelpMode: () => {},
      tourSeen: true,
      markTourSeen: () => {},
      resetTour: () => {},
    };
  }
  return ctx;
}