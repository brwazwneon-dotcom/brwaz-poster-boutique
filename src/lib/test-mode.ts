import { useEffect, useState } from "react";

/**
 * Admin-only "Test Mode" flag stored in localStorage. When on, orders
 * placed from the browser are marked `is_test = true` and excluded from
 * analytics/sales counters via the `real_orders` view + admin dashboards.
 */
const KEY = "brw_test_mode";
const EVT = "brw_test_mode_changed";

export function isTestMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setTestMode(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(EVT, { detail: on }));
  } catch {
    /* noop */
  }
}

export function useTestMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => isTestMode());
  useEffect(() => {
    const sync = () => setOn(isTestMode());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [
    on,
    (v: boolean) => {
      setTestMode(v);
      setOn(v);
    },
  ];
}
