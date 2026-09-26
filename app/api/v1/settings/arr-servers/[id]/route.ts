import { deleteArrServerHandler, updateArrServerHandler } from "@/lib/api/routes/arr-servers";

/** Edit or remove one server. */
export const PATCH = updateArrServerHandler;
export const DELETE = deleteArrServerHandler;
