import { threadRoutes } from "@/lib/api/routes/comments";

/** The conversation on a request: the requester and reviewers only. */
const routes = threadRoutes("request");
export const GET = routes.GET;
export const POST = routes.POST;
