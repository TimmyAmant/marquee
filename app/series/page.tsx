import { DiscoverView, type DiscoverSearchParams } from "@/app/discover/discover-view";

export default function SeriesPage({
  searchParams,
}: {
  searchParams: Promise<DiscoverSearchParams>;
}) {
  return <DiscoverView searchParams={searchParams} lockedType="tv" basePath="/series" />;
}
