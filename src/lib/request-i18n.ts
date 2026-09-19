import type { i18n as I18n } from "i18next";

// One i18n instance per router. On the server that is a per-request instance
// (so concurrent requests in different languages stay separate); in the
// browser it is simply the shared instance.
const registry = new WeakMap<object, I18n>();

export function registerRouterI18n(router: object, instance: I18n) {
  registry.set(router, instance);
}

export function getRouterI18n(router: object, fallback: I18n): I18n {
  return registry.get(router) ?? fallback;
}
