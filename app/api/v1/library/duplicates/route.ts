import { libraryDuplicatesHandler } from "@/lib/api/routes/library";

/** Admin: titles on more than one server or in more than one file. */
export const GET = libraryDuplicatesHandler;
