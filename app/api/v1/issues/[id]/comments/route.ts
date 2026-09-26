import { threadRoutes } from "@/lib/api/routes/comments";

/** The conversation on a problem report: the reporter and reviewers only. */
const routes = threadRoutes("issue");
export const GET = routes.GET;
export const POST = routes.POST;
