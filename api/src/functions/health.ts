import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { withCors } from "../lib/cors";

async function health(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") {
    return withCors(request, { status: 204 });
  }
  return withCors(request, {
    status: 200,
    jsonBody: { status: "ok", service: "onestream-rest-proxy-api" },
  });
}

app.http("health", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "health",
  handler: health,
});
