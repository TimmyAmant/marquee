import { createArrServerHandler, listArrServersHandler } from "@/lib/api/routes/arr-servers";

/** Every Sonarr and Radarr server; POST adds one (tests it first). */
export const GET = listArrServersHandler;
export const POST = createArrServerHandler;
