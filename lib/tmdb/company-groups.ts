export type CompanyGroup = {
  key: string;
  displayName: string;
  /** TMDb company ids that make up this group; first entry supplies the display logo. */
  memberIds: number[];
};

export const COMPANY_GROUPS: CompanyGroup[] = [
  {
    key: "disney",
    displayName: "The Walt Disney Company",
    memberIds: [
      2, // Walt Disney Pictures
      3166, // Walt Disney Productions (legacy name, pre-1986)
      3, // Pixar
      420, // Marvel Studios
      7505, // Marvel Entertainment
      1, // Lucasfilm
      127928, // 20th Century Studios
      43, // Fox Searchlight / Searchlight Pictures
      6125, // Walt Disney Animation Studios
    ],
  },
];

export function findGroupForCompanyId(tmdbId: number): CompanyGroup | undefined {
  return COMPANY_GROUPS.find((group) => group.memberIds.includes(tmdbId));
}

export type DedupedCompany = { tmdbId: number; name: string; logoPath: string | null };

/**
 * Collapses companies that belong to the same conglomerate group (e.g.
 * Disney/Marvel/Lucasfilm) into a single entry, preferring whichever member
 * comes first in the group's `memberIds` — the entry documented to "supply
 * the display logo" — over whatever order the caller's list happens to be in.
 */
export function dedupeCompanies<T extends { id: number; name: string; logo_path: string | null }>(
  companies: T[],
): DedupedCompany[] {
  const byKey = new Map<string, { tmdbId: number; name: string; logoPath: string | null }>();

  for (const company of companies) {
    const group = findGroupForCompanyId(company.id);
    const key = group?.key ?? `co-${company.id}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        tmdbId: company.id,
        name: group?.displayName ?? company.name,
        logoPath: company.logo_path,
      });
      continue;
    }

    if (group) {
      const existingRank = group.memberIds.indexOf(existing.tmdbId);
      const candidateRank = group.memberIds.indexOf(company.id);
      if (candidateRank !== -1 && candidateRank < existingRank) {
        byKey.set(key, { tmdbId: company.id, name: group.displayName, logoPath: company.logo_path });
      }
    }
  }

  return Array.from(byKey.values());
}
