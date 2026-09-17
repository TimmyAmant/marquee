import { apiJson, errorToApiError, jsonError } from "@/lib/api/errors";

type RouteParams = Record<string, string | string[]>;
type RouteContextLike<P extends RouteParams> = { params: Promise<P> };

export type ApiHandler<P extends RouteParams = RouteParams> = (
  request: Request,
  params: P,
) => Promise<Response | unknown>;

/**
 * Wraps a /api/v1 route handler: awaits the dynamic params, turns a plain
 * returned value into a JSON 200, and converts anything thrown into a contract
 * error ({ error, code }) — ApiError as-is, TMDb/upstream failures as 502,
 * everything else as a logged, detail-free 500. Every response gets the
 * X-Marquee-API header.
 */
export function withApi<P extends RouteParams = RouteParams>(handler: ApiHandler<P>) {
  return async (request: Request, context: RouteContextLike<P>): Promise<Response> => {
    try {
      const params = context?.params ? await context.params : ({} as P);
      const result = await handler(request, params);
      return result instanceof Response ? result : apiJson(result);
    } catch (err) {
      const { error, unexpected } = errorToApiError(err);
      if (unexpected) {
        const url = new URL(request.url);
        console.error(`[api/v1] ${request.method} ${url.pathname} failed:`, err);
      }
      return jsonError(error.status, error.code, error.message);
    }
  };
}
