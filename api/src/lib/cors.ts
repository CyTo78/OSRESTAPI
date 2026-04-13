import { HttpRequest, HttpResponseInit } from "@azure/functions";

/**
 * - file:// uses opaque/null origins; Access-Control-Allow-Origin: * + credentials omit works.
 * - Chrome "Private Network Access": requests from non-local pages (incl. many file:// cases) to
 *   localhost require Access-Control-Allow-Private-Network: true on the preflight (OPTIONS).
 */
export function corsHeaders(_request: HttpRequest): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Access-Control-Request-Private-Network",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export function withCors(
  request: HttpRequest,
  init: HttpResponseInit
): HttpResponseInit {
  return {
    ...init,
    headers: { ...corsHeaders(request), ...(init.headers || {}) },
  };
}
