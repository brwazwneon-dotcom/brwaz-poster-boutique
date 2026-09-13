import { createContext, useContext, useState, type ReactNode } from "react";
import { getStoredAdminTheme, setStoredAdminTheme, type AdminThemeMode } from "@/lib/admin-theme";

type AdminThemeContextValue = {
  mode: AdminThemeMode;
  setMode: (mode: AdminThemeMode) => void;
};

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

export function useAdminTheme() {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) throw new Error("useAdminTheme must be used within AdminThemeProvider");
  return ctx;
}

// The admin dashboard route mounts client-only (admin.lazy.tsx), so there is
// no SSR pass to worry about hydration-mismatching against — reading
// localStorage in the initializer is safe and avoids a flash of the wrong
// theme on load.
export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AdminThemeMode>(() => getStoredAdminTheme());

  const setMode = (next: AdminThemeMode) => {
    setModeState(next);
    setStoredAdminTheme(next);
  };

  return (
    <AdminThemeContext.Provider value={{ mode, setMode }}>
      {/* display:contents keeps this a pure CSS-variable scope with no layout box,
          so it can wrap SidebarProvider without disturbing its flex layout. */}
      <div data-admin-theme={mode} className="contents">
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
}
