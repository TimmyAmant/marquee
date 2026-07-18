export type ChangelogEntry = {
  version: string;
  date: string;
  changes: string[];
};

/** Hand-maintained, newest first — bumped in package.json and appended to
 * here on every push to GitHub, so the version number in the footer always
 * has something concrete to link to. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.0",
    date: "2026-07-18",
    changes: [
      "Added a version number to the footer, linking to this changelog.",
      "Fixed: the File details section (and the existing file-info line on title pages) now also shows for titles owned via Plex or Jellyfin, not just Radarr/Sonarr.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-07-14",
    changes: ["Baseline — first versioned release."],
  },
];
