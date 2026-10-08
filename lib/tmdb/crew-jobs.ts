import type { MessageKey } from "@/lib/i18n/translator";

// A person's behind-the-camera credits on their page (app/person/[id]):
// the jobs they did on each title, most telling first. Pure, so it's unit
// tested directly; lib/tmdb/cache.ts saves what it returns.

/** Credits that aren't work on the title: kept off a person's page. */
const NOT_A_ROLE = new Set(["Thanks", "Special Thanks", "In Memory Of", "Dedicated To"]);

/** The jobs people look a filmmaker up for, in the order they're listed;
 * anything else follows, alphabetically. */
const JOB_ORDER = [
  "Director",
  "Co-Director",
  "Creator",
  "Writer",
  "Screenplay",
  "Teleplay",
  "Story",
  "Novel",
  "Characters",
  "Producer",
  "Executive Producer",
  "Co-Producer",
  "Original Music Composer",
  "Director of Photography",
  "Editor",
];

function rank(job: string): number {
  const index = JOB_ORDER.indexOf(job);
  return index === -1 ? JOB_ORDER.length : index;
}

/** At most this many jobs per title: "Director, Writer, Producer". */
export const MAX_JOBS_SHOWN = 3;

/** Each title's jobs ("movie:27205" → ["Director", "Writer", "Producer"]),
 * without the credits that aren't a role. */
export function crewJobsByTitle(
  crew: { media_type: string; id: number; job?: string | null }[],
): Map<string, string[]> {
  const byTitle = new Map<string, Set<string>>();
  for (const item of crew) {
    const job = item.job?.trim();
    if (!job || NOT_A_ROLE.has(job)) continue;
    const key = `${item.media_type}:${item.id}`;
    const jobs = byTitle.get(key) ?? new Set<string>();
    jobs.add(job);
    byTitle.set(key, jobs);
  }
  return new Map(
    [...byTitle].map(([key, jobs]) => [
      key,
      [...jobs].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).slice(0, MAX_JOBS_SHOWN),
    ]),
  );
}

/** The message key for a job's name in the reader's language; null for
 * the rarer ones, which stay as TMDb names them. */
export function jobMessageKey(job: string): MessageKey | null {
  return JOB_KEYS[job] ?? null;
}

const JOB_KEYS: Record<string, MessageKey> = {
  Director: "discover.jobDirector",
  "Co-Director": "discover.jobCoDirector",
  Creator: "discover.jobCreator",
  Writer: "discover.jobWriter",
  Screenplay: "discover.jobScreenplay",
  Teleplay: "discover.jobTeleplay",
  Story: "discover.jobStory",
  Novel: "discover.jobNovel",
  Characters: "discover.jobCharacters",
  Producer: "discover.jobProducer",
  "Executive Producer": "discover.jobExecutiveProducer",
  "Co-Producer": "discover.jobCoProducer",
  "Original Music Composer": "discover.jobComposer",
  "Director of Photography": "discover.jobCinematographer",
  Editor: "discover.jobEditor",
};
