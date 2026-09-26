import { arrPutHandler, disconnectHandler } from "@/lib/api/routes/integrations";

/** The 4K instance (lib/arr/fourk.ts): same as the main one. */
export const PUT = arrPutHandler("radarr4k");
export const DELETE = disconnectHandler("radarr4k");
