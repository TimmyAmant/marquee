import { arrPutHandler, disconnectHandler } from "@/lib/api/routes/integrations";

export const PUT = arrPutHandler("sonarr");
export const DELETE = disconnectHandler("sonarr");
