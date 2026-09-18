import { QueryClient, dehydrate, hydrate, type DehydratedState } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

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

  return router;
};
