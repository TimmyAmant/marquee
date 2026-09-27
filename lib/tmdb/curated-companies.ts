/** Hand-picked, not derived from any TMDb "popular" endpoint — TMDb has no
 * such endpoint for companies/networks, so this is what Discover's Studios
 * and Networks rows show. IDs are TMDb company/network ids; each is fetched
 * live and a bad id just silently drops that one chip, so getting one wrong
 * here is low-risk rather than something that breaks the page. */
export const CURATED_STUDIO_IDS = [
  2, // Walt Disney Pictures
  420, // Marvel Studios
  1, // Lucasfilm
  3, // Pixar
  127928, // 20th Century Studios
  174, // Warner Bros. Pictures
  33, // Universal Pictures
  4, // Paramount Pictures
  34, // Sony Pictures
  5, // Columbia Pictures
  41077, // A24
  521, // DreamWorks Animation
];

/** Discover's Networks row, with the names search matches against: TMDb
 * has no network search, so "hbo" finds HBO here (lib/search/rank.ts
 * matchNetworks). `aliases` are other names people type for the same one. */
export const CURATED_NETWORKS: readonly { id: number; name: string; aliases?: readonly string[] }[] = [
  { id: 213, name: "Netflix" },
  { id: 49, name: "HBO", aliases: ["HBO Max", "Max"] },
  { id: 1024, name: "Prime Video", aliases: ["Amazon", "Amazon Prime", "Amazon Prime Video"] },
  { id: 2739, name: "Disney+", aliases: ["Disney Plus"] },
  { id: 2552, name: "Apple TV+", aliases: ["Apple TV", "Apple TV Plus"] },
  { id: 453, name: "Hulu" },
  { id: 88, name: "FX" },
  { id: 67, name: "Showtime" },
  { id: 3353, name: "Peacock" },
  { id: 4330, name: "Paramount+", aliases: ["Paramount Plus"] },
  { id: 6, name: "NBC" },
  { id: 16, name: "CBS" },
];

export const CURATED_NETWORK_IDS = CURATED_NETWORKS.map((network) => network.id);
