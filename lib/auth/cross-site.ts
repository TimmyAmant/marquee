/** Whether the browser says another site started this request. For the
 * website's own routes that ride on the session cookie (changing a photo,
 * push subscriptions): a cross-site PUT or DELETE already needs a CORS
 * preflight they never grant, and this is the belt to that pair of braces. */
export function isCrossSite(request: Request): boolean {
  return request.headers.get("sec-fetch-site") === "cross-site";
}
