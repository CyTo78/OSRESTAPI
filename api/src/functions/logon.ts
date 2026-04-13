import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { withCors } from "../lib/cors";
import { oneStreamLogon, OneStreamRequestError } from "../lib/onestreamClient";

type LogonBody = {
  pat?: string;
  baseWebServerUrl?: string;
  apiVersion?: string;
};

async function logon(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") {
    return withCors(request, { status: 204 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return withCors(request, {
      status: 415,
      jsonBody: { error: "Content-Type must be application/json" },
    });
  }

  let body: LogonBody;
  try {
    body = (await request.json()) as LogonBody;
  } catch {
    return withCors(request, { status: 400, jsonBody: { error: "Invalid JSON body" } });
  }

  if (!body.pat || typeof body.pat !== "string") {
    return withCors(request, { status: 400, jsonBody: { error: "pat is required" } });
  }
  if (!body.baseWebServerUrl || typeof body.baseWebServerUrl !== "string") {
    return withCors(request, { status: 400, jsonBody: { error: "baseWebServerUrl is required" } });
  }

  const apiVersion =
    typeof body.apiVersion === "string" && body.apiVersion.length > 0
      ? body.apiVersion
      : process.env.ONESTREAM_API_VERSION || "7.2.0";

  try {
    const result = await oneStreamLogon({
      pat: body.pat,
      baseWebServerUrl: body.baseWebServerUrl,
      apiVersion,
    });
    return withCors(request, { status: 200, jsonBody: result });
  } catch (e) {
    if (e instanceof OneStreamRequestError) {
      return withCors(request, {
        status: e.statusCode,
        jsonBody:
          typeof e.responseBody === "object" && e.responseBody !== null
            ? e.responseBody
            : { error: e.message },
      });
    }
    const message = e instanceof Error ? e.message : "OneStream request failed";
    context.log("logon failed", e);
    return withCors(request, { status: 502, jsonBody: { error: message } });
  }
}

app.http("logon", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "logon",
  handler: logon,
});
