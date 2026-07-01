import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useMaintenanceBypass, useMaintenanceConfig } from "@/lib/maintenance";
import { MaintenancePage } from "./MaintenancePage";

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { data: cfg, isLoading } = useMaintenanceConfig();
  const bypass = useMaintenanceBypass(cfg);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Admin & auth routes always accessible so admins can sign in / manage maintenance.
  if (pathname.startsWith("/admin") || pathname.startsWith("/auth")) {
    return <>{children}</>;
  }

  // While loading, render children (avoids blank flash for non-maintenance case).
  if (isLoading || !cfg) return <>{children}</>;
  if (!cfg.enabled) return <>{children}</>;
  if (!bypass.ready) {
    // Bypass check pending — show a minimal black splash to avoid content flash.
    return <div className="min-h-screen w-full bg-black" />;
  }
  if (bypass.allowed) return <>{children}</>;
  return <MaintenancePage cfg={cfg} />;
}