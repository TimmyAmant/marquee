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

export const CURATED_NETWORK_IDS = [
  213, // Netflix
  49, // HBO
  1024, // Amazon (Prime Video)
  2739, // Disney+
  2552, // Apple TV+
  453, // Hulu
  88, // FX
  67, // Showtime
  3353, // Peacock
  4330, // Paramount+
  6, // NBC
  16, // CBS
];
