import { unstable_rethrow } from "next/navigation";

/**
 * A server action's (or fetch helper's) result, or `{ error }` when the call
 * itself fails — a dropped connection, the server restarting, an error it
 * didn't catch. Client components await this instead of the bare action so
 * a busy button always comes back and the usual error message (inline or
 * toast) shows, rather than an unhandled rejection leaving it stuck:
 *
 *   const result = await orError(saveThingAction(value), t("common.somethingWentWrong"));
 *
 * For results shaped `{ error?: string, … }`, which all of them are.
 */
export async function orError<R extends { error?: string | null }>(promise: Promise<R>, error: string): Promise<R> {
  try {
    return await promise;
  } catch (err) {
    // An action that ends in redirect() rejects with Next's own error, which
    // has to reach the router for the navigation to happen.
    unstable_rethrow(err);
    // Every result type this is used with reads `error` first.
    return { error } as R;
  }
}
