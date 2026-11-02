// "Can this page respond yet?" - used by the preloader overlay to know when it may uncover the server-rendered page.
//
// React hydration puts its props (the event handlers) on a DOM node as an own property whose name starts with "__reactProps$" the moment it
// hydrates that node. A control that is on screen but has no such property is still plain server HTML: tapping it would do nothing. So the
// page is responsive when every interactive control that is currently inside the viewport carries React's props.
//
// Why not just "the overlay's own effect ran": that proves the part of the tree that was not suspended has committed, not that every
// visible control has been hydrated (a Suspense boundary can still be pending). Why this check is bounded: some visible links are not
// React-managed (markup injected with dangerouslySetInnerHTML never gets props), so a caller must always apply its own time limit.
// The property name is a React implementation detail; if React ever renamed it the check would simply never find a hydrated control and
// the caller's time limit would dismiss the overlay - it can delay the dismissal by at most that limit, it can never block the page.

const REACT_PROPS_PREFIX = "__reactProps$";

/** the controls a visitor can reasonably tap, click or focus */
export const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** upper bound on controls examined per check, so the check stays cheap on very long pages */
export const MAX_CONTROLS_CHECKED = 80;

export function hasReactProps(el: Element): boolean {
  // own enumerable properties only: React stores its expandos there, and enumerating a DOM node's prototype chain would be slow
  for (const key of Object.keys(el)) if (key.startsWith(REACT_PROPS_PREFIX)) return true;
  return false;
}

function isInViewport(el: Element, width: number, height: number): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  return r.bottom > 0 && r.top < height && r.right > 0 && r.left < width;
}

/**
 * Interactive controls inside the viewport that React has NOT hydrated yet (outside `ignore`, e.g. the overlay itself). An empty list
 * means the visible page can respond.
 */
export function unhydratedControlsInViewport(doc: Document, ignore: Element | null): Element[] {
  const view = doc.defaultView;
  if (!view) return [];
  const pending: Element[] = [];
  let checked = 0;
  for (const el of doc.querySelectorAll(INTERACTIVE_SELECTOR)) {
    if (ignore?.contains(el)) continue;
    if (!isInViewport(el, view.innerWidth, view.innerHeight)) continue;
    if (++checked > MAX_CONTROLS_CHECKED) break;
    if (!hasReactProps(el)) pending.push(el);
  }
  return pending;
}
