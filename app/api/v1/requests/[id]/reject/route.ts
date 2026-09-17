import { reviewRequestHandler } from "@/lib/api/routes/requests";
import { rejectRequest } from "@/lib/requests/mutate";

/** Reject: declines the request and notifies the requester. */
export const POST = reviewRequestHandler(rejectRequest, "Only an admin can reject requests.");
