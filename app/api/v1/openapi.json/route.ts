import { withApi } from "@/lib/api/handler";
import { APP_VERSION } from "@/lib/api/version";
import { buildOpenApiSpec } from "@/lib/api/openapi/spec";

/** The OpenAPI 3.1 description of this API — public: it describes the
 * endpoints and holds nothing secret. Also shown at /api-docs. */
export const GET = withApi(async () => buildOpenApiSpec(APP_VERSION));
