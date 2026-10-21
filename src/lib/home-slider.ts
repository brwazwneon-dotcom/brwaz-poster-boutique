import { queryOptions } from "@tanstack/react-query";
import { getSliderImagesPublic } from "@/lib/db-public.functions";

export type HomeSlide = {
  id: string;
  image_url: string;
  title: string | null;
  link_url: string | null;
  webp_srcset: string | null;
  avif_srcset: string | null;
};

// Shared by the slider component and the homepage route loader, which fills this query on the server so the
// first slide is already in the HTML (and its picture can be preloaded) instead of being found after the scripts ran.
export const homeSliderQueryOptions = queryOptions({
  queryKey: ["homepage-slider"],
  staleTime: 60_000,
  queryFn: async () => getSliderImagesPublic() as Promise<HomeSlide[]>,
});
