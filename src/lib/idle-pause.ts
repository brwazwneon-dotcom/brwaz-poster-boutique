// The admin pages refresh their numbers on a timer (notifications, live visitors, analytics…).
// Every refresh is a database query, and the free database only goes to sleep after 5 quiet
// minutes, so an admin tab left open overnight kept it awake all night and used up the monthly
// free compute. After IDLE_MS without a click, key or touch, all of that polling pauses; the
// first interaction resumes it and refreshes at once.

import { focusManager } from "@tanstack/react-query";

export const ADMIN_IDLE_MS = 5 * 60_000;
export const ADMIN_IDLE_EVENT = "brw:admin-idle-change";

let idle = false;

export function isAdminIdle(): boolean {
  return idle;
}

function setIdle(next: boolean) {
  if (idle === next) return;
  idle = next;
  // React Query only polls while the window counts as focused: pretend it is not while idle.
  focusManager.setFocused(next ? false : undefined);
  window.dispatchEvent(new CustomEvent(ADMIN_IDLE_EVENT, { detail: { idle: next } }));
}

/** Starts watching for inactivity. Returns the cleanup. Safe to call once per admin session. */
export function installAdminIdlePause(idleMs = ADMIN_IDLE_MS): () => void {
  if (typeof window === "undefined") return () => {};
  let timer = 0;
  let lastReset = 0;
  const arm = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => setIdle(true), idleMs);
  };
  const onActivity = () => {
    const now = Date.now();
    // Mouse moves fire constantly: re-arming at most twice a second is plenty.
    if (!idle && now - lastReset < 500) return;
    lastReset = now;
    if (idle) setIdle(false);
    arm();
  };
  const events = [
    "pointerdown",
    "pointermove",
    "keydown",
    "wheel",
    "touchstart",
    "scroll",
  ] as const;
  for (const e of events) window.addEventListener(e, onActivity, { passive: true, capture: true });
  arm();
  return () => {
    window.clearTimeout(timer);
    for (const e of events) window.removeEventListener(e, onActivity, { capture: true });
    if (idle) setIdle(false);
  };
}
