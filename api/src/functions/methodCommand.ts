import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { withCors } from "../lib/cors";
import {
  oneStreamGetAdoDataSetForMethodCommand,
  OneStreamRequestError,
  normalizePat,
} from "../lib/onestreamClient";

type MethodCommandBody = {
  pat?: string;
  baseWebServerUrl?: string;
  apiVersion?: string;
  applicationName?: string;
  methodQuery?: string;
  xfCommandMethodTypeId?: string;
  resultDataTableName?: string;
  customSubstVarsAsCommaSeparatedPairs?: string;
};

async function methodCommand(
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

  let body: MethodCommandBody;
  try {
    body = (await request.json()) as MethodCommandBody;
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
  if (!body.methodQuery || typeof body.methodQuery !== "string" || !body.methodQuery.trim()) {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "methodQuery is required" },
    });
  }
  if (
    !body.xfCommandMethodTypeId ||
    typeof body.xfCommandMethodTypeId !== "string" ||
    !body.xfCommandMethodTypeId.trim()
  ) {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "xfCommandMethodTypeId is required" },
    });
  }

  const apiVersion =
    typeof body.apiVersion === "string" && body.apiVersion.length > 0
      ? body.apiVersion
      : process.env.ONESTREAM_API_VERSION_METHOD_COMMAND || "5.2.0";

  const resultDataTableName =
    typeof body.resultDataTableName === "string" ? body.resultDataTableName : "";
  const customSubst =
    typeof body.customSubstVarsAsCommaSeparatedPairs === "string"
      ? body.customSubstVarsAsCommaSeparatedPairs
      : "";

  try {
    normalizePat(body.pat);
    const result = await oneStreamGetAdoDataSetForMethodCommand({
      pat: body.pat,
      baseWebServerUrl: body.baseWebServerUrl,
      apiVersion,
      applicationName: body.applicationName.trim(),
      methodQuery: body.methodQuery.trim(),
      xfCommandMethodTypeId: body.xfCommandMethodTypeId.trim(),
      resultDataTableName,
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
    context.log("methodCommand failed", e);
    return withCors(request, { status: 502, jsonBody: { error: message } });
  }
}

app.http("methodCommand", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "method-command",
  handler: methodCommand,
});
