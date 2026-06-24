export type Category = {
  slug: string;
  name: string;
  blurb: string;
};

export const CATEGORIES: Category[] = [
  { slug: "football", name: "Football", blurb: "Legends of the pitch." },
  { slug: "movies", name: "Movies", blurb: "Cinema on your wall." },
  { slug: "tv-series", name: "TV Series", blurb: "Iconic shows, framed." },
  { slug: "anime", name: "Anime", blurb: "Cult favourites & classics." },
  { slug: "cars", name: "Cars", blurb: "Machines worth framing." },
  { slug: "custom", name: "Custom Designs", blurb: "Send us your image." },
];

export const getCategory = (slug: string) =>
  CATEGORIES.find((c) => c.slug === slug);