import { testDatabase } from "@/lib/test/pglite";
import {
  arrStatusCache,
  diskSpaceSnapshots,
  jellyfinLibraryItems,
  jellyfinServers,
  plexLibraryItems,
  plexServers,
  titles,
  users,
} from "@/lib/db/schema";

// A small household library on the PGlite database for the Library page's
// tests: an admin, five titles across Plex, Jellyfin, Radarr and Sonarr,
// one of them on two servers in two files, and a month of disk snapshots.

export const GB = 1024 ** 3;

export async function seedLibrary() {
  const { db } = await testDatabase();
  const [admin] = await db.insert(users).values({ username: "admin", role: "admin", permissions: [] }).returning({ id: users.id });
  const [member] = await db
    .insert(users)
    .values({ username: "member", role: "member", permissions: ["requestMovies", "requestTv"] })
    .returning({ id: users.id });

  await db.insert(titles).values([
    {
      mediaType: "movie",
      tmdbId: 603,
      name: "The Matrix",
      releaseDate: "1999-03-30",
      rawTmdb: { genres: [{ id: 28, name: "Action" }, { id: 878, name: "Science Fiction" }], vote_average: 8.2, belongs_to_collection: { id: 2344, name: "The Matrix Collection" } },
    },
    { mediaType: "movie", tmdbId: 949, name: "Heat", releaseDate: "1995-12-15", rawTmdb: { genres: [{ id: 80, name: "Crime" }], vote_average: 7.9 } },
    { mediaType: "movie", tmdbId: 27205, name: "Inception", releaseDate: "2010-07-15", rawTmdb: { genres: [{ id: 28, name: "Action" }], vote_average: 8.4 } },
    { mediaType: "tv", tmdbId: 1399, name: "Game of Thrones", firstAirDate: "2011-04-17", rawTmdb: { genres: [{ id: 18, name: "Drama" }], vote_average: 8.4 } },
    { mediaType: "tv", tmdbId: 95396, name: "Severance", firstAirDate: "2022-02-17", rawTmdb: { genres: [{ id: 18, name: "Drama" }], vote_average: 8.3 } },
  ]);

  const [plex] = await db
    .insert(plexServers)
    .values({ userId: admin.id, machineIdentifier: "tower", name: "Tower" })
    .returning({ id: plexServers.id });
  const [jellyfin] = await db
    .insert(jellyfinServers)
    .values({ userId: admin.id, serverId: "jf1", name: "Attic", product: "jellyfin" })
    .returning({ id: jellyfinServers.id });

  await db.insert(plexLibraryItems).values([
    {
      plexServerId: plex.id,
      ratingKey: "1",
      mediaType: "movie",
      tmdbId: 603,
      title: "The Matrix",
      addedAt: new Date("2026-09-20T18:00:00Z"),
      sizeBytes: 30 * GB,
      filePath: "/movies/The Matrix (1999)/The Matrix (1999) Bluray-2160p.mkv",
      resolution: "4K",
      videoCodec: "HEVC",
      dynamicRange: "DV",
      audioCodec: "TrueHD Atmos",
    },
    {
      plexServerId: plex.id,
      ratingKey: "2",
      mediaType: "tv",
      tmdbId: 1399,
      title: "Game of Thrones",
      addedAt: new Date("2026-09-10T18:00:00Z"),
      sizeBytes: 90 * GB,
      filePath: "/tv/Game of Thrones",
      resolution: "1080p",
      videoCodec: "H264",
      episodeCount: 73,
    },
  ]);
  await db.insert(jellyfinLibraryItems).values([
    {
      jellyfinServerId: jellyfin.id,
      itemId: "j1",
      mediaType: "movie",
      tmdbId: 603,
      title: "The Matrix",
      addedAt: new Date("2026-08-01T18:00:00Z"),
      sizeBytes: 8 * GB,
      filePath: "/movies/The Matrix (1999)/The Matrix (1999) WEBDL-1080p.mkv",
      resolution: "1080p",
      videoCodec: "H264",
      dynamicRange: "SDR",
    },
    {
      jellyfinServerId: jellyfin.id,
      itemId: "j2",
      mediaType: "movie",
      tmdbId: 949,
      title: "Heat",
      addedAt: new Date("2026-09-25T18:00:00Z"),
      sizeBytes: 12 * GB,
      filePath: "/movies/Heat (1995)/Heat (1995).mkv",
      resolution: "1080p",
      videoCodec: "HEVC",
      dynamicRange: "HDR10",
    },
  ]);
  await db.insert(arrStatusCache).values([
    {
      userId: admin.id,
      provider: "radarr",
      externalId: 603,
      arrId: 12,
      status: "owned",
      monitored: true,
      sizeBytes: 30 * GB,
      filePath: "/movies/The Matrix (1999)/The Matrix (1999) Bluray-2160p.mkv",
      qualityName: "Bluray-2160p",
      dynamicRange: "DV",
      audioCodec: "TrueHD Atmos",
    },
    { userId: admin.id, provider: "radarr", externalId: 27205, arrId: 13, status: "tracked_monitored", monitored: true, filePath: "/movies/Inception (2010)" },
    { userId: admin.id, provider: "sonarr", externalId: 1399, arrId: 7, status: "owned", monitored: true, sizeBytes: 90 * GB, filePath: "/tv/Game of Thrones", episodeCount: 61 },
    { userId: admin.id, provider: "sonarr", externalId: 95396, arrId: 8, status: "tracked_downloading", monitored: true, sizeBytes: 4 * GB, filePath: "/tv/Severance", episodeCount: 3 },
  ]);
  await db.insert(diskSpaceSnapshots).values([
    { userId: admin.id, path: "/movies", freeBytes: 1000 * GB, capturedAt: new Date("2026-09-01T03:00:00Z") },
    { userId: admin.id, path: "/movies", freeBytes: 900 * GB, capturedAt: new Date("2026-09-11T03:00:00Z") },
    { userId: admin.id, path: "/tv", freeBytes: 500 * GB, capturedAt: new Date("2026-09-11T03:00:00Z") },
  ]);

  return { adminId: admin.id, memberId: member.id, plexServerId: plex.id, jellyfinServerId: jellyfin.id };
}
