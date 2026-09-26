import { commentRoutes } from "@/lib/api/routes/comments";

/** Edit (its author, for 15 minutes) or delete (that, or the admin) a comment. */
const routes = commentRoutes("request");
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
