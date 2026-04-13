import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { withCors } from "../lib/cors";
import {
  oneStreamExecuteStep,
  OneStreamRequestError,
  normalizePat,
} from "../lib/onestreamClient";

type ExecuteStepBody = {
  pat?: string;
  baseWebServerUrl?: string;
  apiVersion?: string;
  applicationName?: string;
  dataManagementGroupName?: string;
  stepName?: string;
  customSubstVarsAsCommaSeparatedPairs?: string;
};

async function executeStep(
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

  let body: ExecuteStepBody;
  try {
    body = (await request.json()) as ExecuteStepBody;
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
  if (
    !body.dataManagementGroupName ||
    typeof body.dataManagementGroupName !== "string" ||
    !body.dataManagementGroupName.trim()
  ) {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "dataManagementGroupName is required" },
    });
  }
  if (!body.stepName || typeof body.stepName !== "string" || !body.stepName.trim()) {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "stepName is required" },
    });
  }

  const apiVersion =
    typeof body.apiVersion === "string" && body.apiVersion.length > 0
      ? body.apiVersion
      : process.env.ONESTREAM_API_VERSION_DM_STEP || "5.2.0";

  const customSubst =
    typeof body.customSubstVarsAsCommaSeparatedPairs === "string"
      ? body.customSubstVarsAsCommaSeparatedPairs
      : "";

  try {
    normalizePat(body.pat);
    const result = await oneStreamExecuteStep({
      pat: body.pat,
      baseWebServerUrl: body.baseWebServerUrl,
      apiVersion,
      applicationName: body.applicationName.trim(),
      dataManagementGroupName: body.dataManagementGroupName.trim(),
      stepName: body.stepName.trim(),
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
    context.log("executeStep failed", e);
    return withCors(request, { status: 502, jsonBody: { error: message } });
  }
}

app.http("executeStep", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "execute-step",
  handler: executeStep,
});
