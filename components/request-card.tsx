"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MediaImage } from "@/components/media-image";
import { UserAvatar } from "@/components/user-avatar";
import { CommentSection } from "@/components/comment-thread";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { seasonChips } from "@/lib/requests/season-chips";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { timeAgo } from "@/lib/i18n/format";

export type RequestCardPerson = { name: string; avatarSrc?: string | null };

/**
 * A request as the Requests page lists it, after Seerr's request cards:
 * a wide card with the title's backdrop faded behind it; poster, year,
 * title and season chips on the left; the status pill and who asked (and
 * who reviewed) in the middle; the actions on the right. The conversation
 * opens under the card ("Comments (2)").
 */
export function RequestCard({
  id,
  mediaType,
  tmdbId,
  title,
  year,
  posterPath,
  backdropPath,
  seasons,
  is4k = false,
  status,
  requestedBy,
  requestedAt,
  modifiedAt,
  modifiedBy,
  addedTo,
  notes,
  commentCount = 0,
  actions,
  below,
}: {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  year?: string | null;
  posterPath: string | null;
  backdropPath?: string | null;
  seasons: number[] | null;
  is4k?: boolean;
  status: { label: string; className: string };
  requestedBy: RequestCardPerson;
  requestedAt: string | Date;
  /** Reviewed or edited since asking, when it was. */
  modifiedAt?: string | Date | null;
  modifiedBy?: RequestCardPerson | null;
  /** The Sonarr/Radarr server it went to, when known. */
  addedTo?: string | null;
  /** Small lines under the status (a declined reason, "Can't find"…). */
  notes?: ReactNode;
  commentCount?: number;
  /** The right-hand column: Approve / Decline / Edit / Cancel… */
  actions?: ReactNode;
  /** Full width under the columns (an Advanced section, an error). */
  below?: ReactNode;
}) {
  const t = useT();
  const backdrop = tmdbImageUrl(backdropPath ?? null, "w780");
  const poster = tmdbImageUrl(posterPath, "w154");
  const chips = seasonChips(seasons);

  return (
    <article className="relative overflow-hidden rounded-2xl border border-border bg-bg-1">
      {backdrop && (
        <div aria-hidden className="absolute inset-0">
          <MediaImage src={backdrop} alt="" fill sizes="900px" className="object-cover opacity-30" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--marquee-bg-1)_0%,color-mix(in_srgb,var(--marquee-bg-1)_82%,transparent)_45%,color-mix(in_srgb,var(--marquee-bg-1)_92%,transparent)_100%)]" />
        </div>
      )}
      <div className="relative flex flex-col gap-4 p-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <Link
            href={`/title/${mediaType}/${tmdbId}`}
            className="relative h-[84px] w-14 shrink-0 overflow-hidden rounded-lg bg-bg-2 ring-1 ring-border"
          >
            {poster && <MediaImage src={poster} alt="" fill sizes="56px" className="object-cover" />}
          </Link>
          <div className="min-w-0">
            {year && <p className="text-[11px] text-text-muted">{year}</p>}
            <Link
              href={`/title/${mediaType}/${tmdbId}`}
              className="block truncate font-display text-[16px] font-semibold text-text-primary hover:text-accent"
            >
              {title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {chips.map((chip) => (
                <span key={chip} className="rounded-md border border-border bg-bg-0/60 px-1.5 py-0.5 text-[10.5px] font-medium text-text-secondary">
                  {chip}
                </span>
              ))}
              {is4k && (
                <span className="rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-accent">
                  4K
                </span>
              )}
            </div>
            <CommentSection kind="request" id={id} count={commentCount} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 text-[12.5px] text-text-secondary md:w-[280px] md:shrink-0">
          <div>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${status.className}`}>
              {status.label}
            </span>
          </div>
          <Person label={t("requests.requestedByLine", { when: timeAgo(t, requestedAt) })} person={requestedBy} />
          {modifiedAt && (
            <Person
              label={t("requests.modifiedByLine", { when: timeAgo(t, modifiedAt) })}
              person={modifiedBy ?? null}
            />
          )}
          {addedTo && <p className="text-text-muted">{t("requests.addedTo", { server: addedTo })}</p>}
          {notes}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
      </div>
      {below && <div className="relative px-4 pb-4">{below}</div>}
    </article>
  );
}

function Person({ label, person }: { label: string; person: RequestCardPerson | null }) {
  return (
    <p className="flex items-center gap-1.5 truncate">
      <span className="text-text-muted">{label}</span>
      {person && (
        <>
          <UserAvatar label={person.name} src={person.avatarSrc ?? null} size={18} />
          <span className="truncate font-medium text-text-primary">{person.name}</span>
        </>
      )}
    </p>
  );
}
