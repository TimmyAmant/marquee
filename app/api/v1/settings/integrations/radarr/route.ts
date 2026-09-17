import { arrPutHandler, disconnectHandler } from "@/lib/api/routes/integrations";

export const PUT = arrPutHandler("radarr");
export const DELETE = disconnectHandler("radarr");
