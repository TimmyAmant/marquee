/** Where a studio or network in search opens: a studio its company page, a
 * network the Series grid filtered to it (as Discover's Networks row does). */
export function companyHref(company: { kind: "studio" | "network"; tmdbId: number }): string {
  return company.kind === "network" ? `/network/${company.tmdbId}` : `/company/${company.tmdbId}`;
}
