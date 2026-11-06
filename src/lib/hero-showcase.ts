import { queryOptions } from "@tanstack/react-query";
import { getHeroShowcasePublic } from "@/lib/db-public.functions";
import type { ShowcasePayload } from "@/lib/hero-showcase-core";

// The four Best Sellers of the day. Filled on the server by the homepage route loader (so the lead frame is in the
// first HTML and can be preloaded) and then handed to the browser as is: the browser never picks the day's products
// itself, so the page cannot change under the visitor and nothing reloads when the day turns over.
export const heroShowcaseQueryOptions = queryOptions({
  queryKey: ["hero-showcase"],
  staleTime: 30 * 60_000,
  refetchOnWindowFocus: false,
  queryFn: async () => getHeroShowcasePublic() as Promise<ShowcasePayload>,
});
