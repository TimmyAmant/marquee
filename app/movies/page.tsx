import { DiscoverView, type DiscoverSearchParams } from "@/app/discover/discover-view";

export default function MoviesPage({
  searchParams,
}: {
  searchParams: Promise<DiscoverSearchParams>;
}) {
  return <DiscoverView searchParams={searchParams} lockedType="movie" basePath="/movies" />;
}
