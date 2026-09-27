// lib/pages/search.ts's cards as /api/v1 DTOs, with each viewer's poster
// quick action (lib/api/poster-actions.ts). Shared by GET /search and
// GET /search/{section}.
import { titleCard } from "@/lib/api/mappers";
import { posterActions, type PosterActionRules } from "@/lib/api/poster-actions";
import type { SearchCompanyCard, SearchPersonCard, TitleCard } from "@/lib/api/types";
import type {
  SearchCompanyCard as PageCompanyCard,
  SearchPersonCard as PagePersonCard,
  SearchTitleCard,
} from "@/lib/pages/search";

export function searchTitleDto(rules: PosterActionRules, card: SearchTitleCard): TitleCard {
  const status = card.status ?? null;
  return titleCard(card, {
    overview: card.overview,
    rating: card.rating,
    status,
    favorited: card.favorited,
    ...posterActions(rules, card.mediaType, card.tmdbId, status),
  });
}

export function searchPersonDto(person: PagePersonCard): SearchPersonCard {
  return {
    tmdbId: person.tmdbId,
    name: person.name,
    profilePath: person.profilePath,
    knownForDepartment: person.knownForDepartment,
    favorited: person.favorited,
    knownFor: person.knownFor,
  };
}

export function searchCompanyDto(company: PageCompanyCard): SearchCompanyCard {
  return {
    kind: company.kind,
    tmdbId: company.tmdbId,
    name: company.name,
    logoPath: company.logoPath,
    favorited: company.kind === "network" ? null : company.favorited,
  };
}
