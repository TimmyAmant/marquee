import { reviewRequestHandler } from "@/lib/api/routes/requests";
import { manuallyApproveRequest } from "@/lib/requests/mutate";

/** Manually approve: marks it approved without touching Sonarr/Radarr. */
export const POST = reviewRequestHandler(manuallyApproveRequest, "Only an admin can approve requests.");
