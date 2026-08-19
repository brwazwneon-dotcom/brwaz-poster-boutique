import { useEffect, useRef } from "react";

type VisibilityCallback = () => void;

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  rootMargin: "500px 0px",
  threshold: 0.01,
};

let sharedObserver: IntersectionObserver | null = null;
const callbacks = new Map<Element, VisibilityCallback>();
const observedElements = new Set<Element>();
let refCount = 0;

function getObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const cb = callbacks.get(entry.target);
        if (cb) {
          cb();
          sharedObserver?.unobserve(entry.target);
          callbacks.delete(entry.target);
          observedElements.delete(entry.target);
        }
      }
    }, OBSERVER_OPTIONS);
  }
  return sharedObserver;
}

export function registerGridNode(element: Element, onVisible: VisibilityCallback): void {
  if (typeof IntersectionObserver === "undefined") {
    onVisible();
    return;
  }
  if (callbacks.has(element)) return;
  const observer = getObserver();
  callbacks.set(element, onVisible);
  observedElements.add(element);
  try {
    observer.observe(element);
  } catch {
    onVisible();
  }
}

export function unregisterGridNode(element: Element): void {
  callbacks.delete(element);
  observedElements.delete(element);
  if (sharedObserver) {
    try {
      sharedObserver.unobserve(element);
    } catch {
      /* noop */
    }
  }
}

export function disconnectGridObserver(): void {
  if (sharedObserver) {
    sharedObserver.disconnect();
    sharedObserver = null;
  }
  callbacks.clear();
  observedElements.clear();
}

export function useGridNodeRef(onVisible: VisibilityCallback) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef(onVisible);
  cbRef.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      cbRef.current();
      return;
    }
    registerGridNode(el, () => cbRef.current());
    return () => {
      unregisterGridNode(el);
    };
  }, []);

  return ref;
}

export function useGridObserver() {
  useEffect(() => {
    return () => {
      disconnectGridObserver();
    };
  }, []);
}
