export type CompanyGroup = {
  key: string;
  displayName: string;
  /** TMDb company ids that make up this group; first entry supplies the display logo. */
  memberIds: number[];
};

// Empty by request — Marvel/Lucasfilm/Pixar/20th Century previously merged
// into a single "The Walt Disney Company" page here, which read as broken
// (clicking Lucasfilm's own logo landed on a page branded Disney). Each
// studio now gets its own page again; findGroupForCompanyId/dedupeCompanies
// both fall back to per-company handling when no group matches.
export const COMPANY_GROUPS: CompanyGroup[] = [];

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
