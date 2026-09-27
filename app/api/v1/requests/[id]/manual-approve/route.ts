import { reviewRequestHandler } from "@/lib/api/routes/requests";
import { msg } from "@/lib/api/errors";
import { manuallyApproveRequest } from "@/lib/requests/mutate";

/** Manually approve: marks it approved without touching Sonarr/Radarr. */
export const POST = reviewRequestHandler(
  manuallyApproveRequest,
  msg("server.onlyAdminManualApprove"),
  true,
);
