import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { withCors } from "../lib/cors";
import {
  oneStreamExecuteSequence,
  OneStreamRequestError,
  normalizePat,
} from "../lib/onestreamClient";

type ExecuteSequenceBody = {
  pat?: string;
  baseWebServerUrl?: string;
  apiVersion?: string;
  workspaceName?: string;
  applicationName?: string;
  sequenceName?: string;
  customSubstVarsAsCommaSeparatedPairs?: string;
};

async function executeSequence(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
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

  let body: ExecuteSequenceBody;
  try {
    body = (await request.json()) as ExecuteSequenceBody;
  } catch {
    return withCors(request, { status: 400, jsonBody: { error: "Invalid JSON body" } });
  }

  if (!body.pat || typeof body.pat !== "string") {
    return withCors(request, { status: 400, jsonBody: { error: "pat is required" } });
  }
  if (!body.baseWebServerUrl || typeof body.baseWebServerUrl !== "string") {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "baseWebServerUrl is required" },
    });
  }
  if (!body.applicationName || typeof body.applicationName !== "string") {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "applicationName is required" },
    });
  }
  if (!body.workspaceName || typeof body.workspaceName !== "string" || !body.workspaceName.trim()) {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "workspaceName is required" },
    });
  }
  if (!body.sequenceName || typeof body.sequenceName !== "string" || !body.sequenceName.trim()) {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "sequenceName is required" },
    });
  }

  const apiVersion =
    typeof body.apiVersion === "string" && body.apiVersion.length > 0
      ? body.apiVersion
      : process.env.ONESTREAM_API_VERSION_DM_SEQUENCE || "5.2.0";

  const customSubst =
    typeof body.customSubstVarsAsCommaSeparatedPairs === "string"
      ? body.customSubstVarsAsCommaSeparatedPairs
      : "";

  try {
    normalizePat(body.pat);
    const result = await oneStreamExecuteSequence({
      pat: body.pat,
      baseWebServerUrl: body.baseWebServerUrl,
      apiVersion,
      workspaceName: body.workspaceName.trim(),
      applicationName: body.applicationName.trim(),
      sequenceName: body.sequenceName.trim(),
      customSubstVarsAsCommaSeparatedPairs: customSubst,
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
    context.log("executeSequence failed", e);
    return withCors(request, { status: 502, jsonBody: { error: message } });
  }
}

app.http("executeSequence", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "execute-sequence",
  handler: executeSequence,
});
