import { useEffect } from "react";
import { registerPwa } from "@/lib/pwa-register";

export function PwaBoot() {
  useEffect(() => {
    registerPwa();
  }, []);
  return null;
}