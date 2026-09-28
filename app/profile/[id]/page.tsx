import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PosterCard } from "@/components/poster-card";
import { PosterRowItem } from "@/components/poster-row";
import { Shelf } from "@/components/shelf";
import { StatusBadge } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadMemberProfile } from "@/lib/users/profile";
import { avatarPath } from "@/lib/users/avatar-path";
import { PERMISSION_PRESET_LABELS, presetFor } from "@/lib/users/permissions";
import type { QuotaState } from "@/lib/requests/quota";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-1 px-5 py-4">
      <p className="text-[12px] font-medium text-text-muted">{label}</p>
      <p className="mt-1 font-display text-[28px] font-semibold leading-8 text-text-primary">{value}</p>
      {detail && <p className="mt-1 text-[12px] text-text-secondary">{detail}</p>}
    </div>
  );
}

/** "3 of 5" left, or "Unlimited". */
function remaining(t: Translator, quota: QuotaState | null): { value: string; detail: string | null } {
  if (!quota) return { value: t("settings.profileUnlimited"), detail: null };
  return {
    value: t("settings.profileRemainingOf", { remaining: quota.remaining, limit: quota.limit }),
    detail: t("settings.profileEveryDays", { days: quota.days }),
  };
}

/**
 * A member's profile, after Seerr's: their photo, name and when they
 * joined; how many requests they've made and how many they have left; and
 * their Plex Watchlist. Yours from Settings › Account, anyone's for the
 * admin from the household list (lib/users/profile.ts; GET
 * /api/v1/users/{id}/profile is the same).
 */
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.userId) redirect("/login");
  if (!UUID.test(id)) notFound();
  const t = await getT();

  const profile = await loadMemberProfile(
    { userId: viewer.userId, isAdmin: viewer.isAdmin, libraryOwnerId: viewer.libraryOwnerId },
    id,
  );
  if (!profile) notFound();
  const { member } = profile;
  const name = member.displayName || member.username;
  const isSelf = member.id === viewer.userId;
  const preset = member.role === "admin" ? "admin" : presetFor(member);
  const movies = remaining(t, profile.limits.movie);
  const series = remaining(t, profile.limits.tv);

  return (
    <div className="px-4 py-6 sm:px-7 sm:py-7">
      <div className="flex flex-wrap items-center gap-5">
        <UserAvatar label={name} src={avatarPath(member, "/api")} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[28px] font-semibold leading-9 text-text-primary">{name}</h1>
          <p className="mt-0.5 truncate text-[14px] text-text-secondary">{member.username}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-text-muted">
            <span className="rounded-full border border-accent/40 px-2.5 py-0.5 text-accent">
              {t(PERMISSION_PRESET_LABELS[preset])}
            </span>
            <span>{t("settings.profileJoined", { date: formatDate(t, member.createdAt, "long") })}</span>
          </div>
        </div>
        {(isSelf || viewer.isAdmin) && (
          <Link
            href="/settings"
            className="flex h-8 items-center rounded-full border border-border-strong px-4 text-[13px] text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            {isSelf ? t("settings.profileEditAccount") : t("settings.profileManageMembers")}
          </Link>
        )}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("settings.profileTotalRequests")}
          value={formatNumber(t, profile.requests.total)}
          detail={t("settings.profileRequestSplit", { movies: profile.requests.movie, series: profile.requests.tv })}
        />
        <StatCard label={t("settings.profileMovieRequestsLeft")} value={movies.value} detail={movies.detail} />
        <StatCard label={t("settings.profileSeriesRequestsLeft")} value={series.value} detail={series.detail} />
      </div>

      {profile.watchlist && (
        <div className="-mr-4 mt-12 sm:-mr-7">
          {profile.watchlist.length > 0 ? (
            <Shelf title={t("settings.profilePlexWatchlist")} seeAllHref={isSelf ? "/discover/watchlist" : undefined}>
              {profile.watchlist.map((item) => (
                <PosterRowItem key={`${item.mediaType}-${item.tmdbId}`}>
                  <PosterCard
                    href={`/title/${item.mediaType}/${item.tmdbId}`}
                    posterPath={item.posterPath}
                    name={item.name}
                    year={item.year ?? undefined}
                    typeLabel={{
                      mediaType: item.mediaType,
                      text: item.mediaType === "movie" ? t("common.movie") : t("common.series"),
                    }}
                    badge={item.status && <StatusBadge status={item.status} compact />}
                    status={item.status}
                    episodes={item.episodes}
                  />
                </PosterRowItem>
              ))}
            </Shelf>
          ) : (
            <>
              <h2 className="font-display text-[20px] font-semibold text-text-primary">{t("settings.profilePlexWatchlist")}</h2>
              <p className="mt-2 text-sm text-text-secondary">{t("settings.profileWatchlistEmpty")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
