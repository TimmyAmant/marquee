// Unlike movies, TMDb has no native "this show crosses over with that show"
// concept (no TV equivalent of `belongs_to_collection`), so these have to be
// curated by hand — same approach as lib/tmdb/company-groups.ts.
export type TvFranchiseGroup = {
  key: string;
  displayName: string;
  memberTmdbIds: number[];
};

export const TV_FRANCHISE_GROUPS: TvFranchiseGroup[] = [
  {
    key: "arrowverse",
    displayName: "Arrowverse",
    memberTmdbIds: [
      1412, // Arrow
      60735, // The Flash
      62688, // Supergirl
      62643, // DC's Legends of Tomorrow
      89247, // Batwoman
      95057, // Superman & Lois
    ],
  },
  {
    key: "911-universe",
    displayName: "9-1-1 Universe",
    memberTmdbIds: [
      75219, // 9-1-1
      89393, // 9-1-1: Lone Star
    ],
  },
  {
    key: "one-chicago",
    displayName: "One Chicago",
    memberTmdbIds: [
      44006, // Chicago Fire
      58841, // Chicago P.D.
      62650, // Chicago Med
    ],
  },
  {
    key: "ncis",
    displayName: "NCIS Franchise",
    memberTmdbIds: [
      4614, // NCIS
      17610, // NCIS: Los Angeles
      61387, // NCIS: New Orleans
      124271, // NCIS: Hawaiʻi
      157950, // NCIS: Sydney
    ],
  },
];

export function findTvFranchiseGroup(tmdbId: number): TvFranchiseGroup | undefined {
  return TV_FRANCHISE_GROUPS.find((group) => group.memberTmdbIds.includes(tmdbId));
}
