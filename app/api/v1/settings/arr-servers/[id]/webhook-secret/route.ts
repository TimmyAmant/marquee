import { regenerateArrServerSecretHandler } from "@/lib/api/routes/arr-servers";

/** A new secret for this server's webhook URL; the old URL stops working. */
export const POST = regenerateArrServerSecretHandler;
