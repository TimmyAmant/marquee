import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { ERROR_REFERENCE } from "@/lib/help/error-reference";
import type { ErrorReferenceCategory, ListResponse } from "@/lib/api/types";

/** The Error reference page: what each user-facing error message means and
 * what to do about it, grouped by area. */
export const GET = withApi(async (request): Promise<ListResponse<ErrorReferenceCategory>> => {
  await requireApiUser(request);
  return {
    results: ERROR_REFERENCE.map((category) => ({
      title: category.title,
      entries: category.entries.map((e) => ({ message: e.message, meaning: e.meaning, whatToDo: e.whatToDo })),
    })),
  };
});
