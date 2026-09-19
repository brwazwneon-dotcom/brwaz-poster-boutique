import { QueryClient, dehydrate, hydrate, type DehydratedState } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import i18n, { createRequestI18n, resolveRequestLanguage, type Lang } from "./lib/i18n";
import { registerRouterI18n } from "./lib/request-i18n";
import { routeTree } from "./routeTree.gen";

// Only the server branch runs on the server; the browser build drops it.
const detectRequestLanguage = createIsomorphicFn()
  .server((): Lang | null =>
    resolveRequestLanguage(getRequestHeader("cookie"), getRequestHeader("accept-language")),
  )
  .client((): Lang | null => null);

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Route loaders (category, trending, best-sellers, sets) prefetch into
    // this query client on the server, and components such as the header read
    // that data while rendering. Without handing the cache to the browser, the
    // server HTML is rendered with real data while the client's first render
    // starts empty and falls back to defaults, so React reports a hydration
    // mismatch (#418) and re-renders the whole page.
    dehydrate: () => ({ queryClientState: dehydrate(queryClient) as unknown as object }),
    hydrate: (dehydrated: { queryClientState: object }) => {
      hydrate(queryClient, dehydrated.queryClientState as DehydratedState);
    },
  });

  // Render each request in the visitor's own language (cookie, then the
  // browser's Accept-Language) instead of always Arabic, which used to make
  // English visitors see Arabic first and then have the whole page switch.
  const requestLang = detectRequestLanguage();
  registerRouterI18n(router, requestLang ? createRequestI18n(requestLang) : i18n);

  return router;
};
