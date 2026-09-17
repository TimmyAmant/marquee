import { reviewRequestHandler } from "@/lib/api/routes/requests";
import { approveRequest } from "@/lib/requests/mutate";

/** Approve: adds the title with the admin's Sonarr/Radarr, then notifies the requester. */
export const POST = reviewRequestHandler(approveRequest, "Only an admin can approve requests.");
