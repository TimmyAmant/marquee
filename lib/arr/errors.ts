// Why Sonarr/Radarr turned a call down, in its own words. Its add endpoints
// answer a 400 with a list of validation failures ({ errorMessage }), other
// errors with { message } — without this, every failure read as "couldn't
// add" and nobody could tell a duplicate from a timeout.

export class ArrRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Sonarr/Radarr's own reason, when it gave one. */
    readonly reason: string | null,
  ) {
    super(message);
    this.name = "ArrRequestError";
  }
}

/** The reason in an error answer's body, or null. */
export function reasonFromBody(body: string): string | null {
  const text = body.trim();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const reasons = items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const reason = record.errorMessage ?? record.message ?? record.description;
        return typeof reason === "string" && reason.trim() ? reason.trim() : null;
      })
      .filter((reason): reason is string => reason !== null);
    return reasons.length ? [...new Set(reasons)].join(" ").slice(0, 300) : null;
  } catch {
    return null;
  }
}

/** A short, readable reason for any failed Sonarr/Radarr call. */
export function describeArrError(err: unknown): string | null {
  if (err instanceof ArrRequestError) return err.reason ?? `HTTP ${err.status}`;
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "timed out";
  if (err instanceof Error && err.message === "fetch failed") return "unreachable";
  return null;
}

/** Builds the error a failed response throws. */
export async function arrRequestError(app: string, path: string, res: Response): Promise<ArrRequestError> {
  const reason = reasonFromBody(await res.text().catch(() => ""));
  return new ArrRequestError(`${app} request failed: ${path} (${res.status})${reason ? `: ${reason}` : ""}`, res.status, reason);
}
