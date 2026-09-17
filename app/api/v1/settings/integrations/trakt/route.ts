import { settingDeleteHandler, settingPutHandler } from "@/lib/api/routes/integrations";
import { testAndSaveTraktClientId } from "@/lib/integrations/manage";
import { clearTraktClientId } from "@/lib/integrations/app-settings";

/** Body: { clientId } — a Trakt API app's client id. */
export const PUT = settingPutHandler("clientId", testAndSaveTraktClientId);
export const DELETE = settingDeleteHandler(clearTraktClientId);
