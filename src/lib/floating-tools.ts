/**
 * Shared z-index scale and floating-tools layout manager.
 *
 * Every fixed-position UI element MUST use these constants so nothing
 * overlaps the sticky product action bar, modals, or toasts.
 *
 * ┌────────────────────────────┬──────────┐
 * │ element                    │ z-index  │
 * ├────────────────────────────┼──────────┤
 * │ page content               │ 0        │
 * │ sticky header              │ 30       │
 * │ sticky product action bar  │ 50       │
 * │ floating tools             │ 60       │
 * │ dropdowns / popovers       │ 70       │
 * │ bottom sheets              │ 80       │
 * │ modal overlay              │ 90       │
 * │ modal content              │ 100      │
 * │ toast notifications        │ 110      │
 * └────────────────────────────┴──────────┘
 */

export const Z = {
  PAGE: 0,
  HEADER: 30,
  STICKY_BAR: 50,
  FLOATING_TOOLS: 60,
  DROPDOWN: 70,
  BOTTOM_SHEET: 80,
  MODAL_OVERLAY: 90,
  MODAL_CONTENT: 100,
  TOAST: 110,
} as const;

/** CSS custom property name for the sticky action bar height. */
export const STICKY_BAR_VAR = "--sticky-bar-h";

/** CSS custom property name that signals a bottom sheet is open. */
export const BOTTOM_SHEET_VAR = "--bottom-sheet-open";

/**
 * Set or clear the sticky bar height on the document root.
 * All floating widgets read `var(--sticky-bar-h)` for their bottom offset.
 */
export function setStickyBarHeight(px: number | null) {
  const root = document.documentElement;
  if (px !== null && px > 0) {
    root.style.setProperty(STICKY_BAR_VAR, `${px}px`);
  } else {
    root.style.removeProperty(STICKY_BAR_VAR);
  }
}

/**
 * Set or clear bottom-sheet-open flag so floating widgets can hide.
 */
export function setBottomSheetOpen(open: boolean) {
  const root = document.documentElement;
  if (open) {
    root.style.setProperty(BOTTOM_SHEET_VAR, "1");
  } else {
    root.style.removeProperty(BOTTOM_SHEET_VAR);
  }
}
