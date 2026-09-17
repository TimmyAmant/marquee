import { disconnectHandler } from "@/lib/api/routes/integrations";

/** Disconnect Plex (the connection itself is made with the PIN flow under ./pin). */
export const DELETE = disconnectHandler("plex");
