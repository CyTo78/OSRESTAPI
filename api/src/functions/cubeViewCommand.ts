import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { withCors } from "../lib/cors";
import {
  oneStreamGetAdoDataSetForCubeViewCommand,
  OneStreamRequestError,
  normalizePat,
} from "../lib/onestreamClient";

type CubeViewBody = {
  pat?: string;
  baseWebServerUrl?: string;
  apiVersion?: string;
  applicationName?: string;
  cubeViewName?: string;
  dataTablePerCubeViewRow?: boolean;
  resultDataTableName?: string;
  cubeViewDataTableOptions?: unknown;
  customSubstVarsAsCommaSeparatedPairs?: string;
};

function parseCubeViewDataTableOptions(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("cubeViewDataTableOptions must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  return Object.keys(o).length > 0 ? o : null;
}

async function cubeViewCommand(
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

  let body: CubeViewBody;
  try {
    body = (await request.json()) as CubeViewBody;
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
  if (!body.cubeViewName || typeof body.cubeViewName !== "string" || !body.cubeViewName.trim()) {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "cubeViewName is required" },
    });
  }

  if (typeof body.dataTablePerCubeViewRow !== "boolean") {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "dataTablePerCubeViewRow must be a boolean" },
    });
  }

  let cubeViewOpts: Record<string, unknown> | null;
  try {
    cubeViewOpts = parseCubeViewDataTableOptions(body.cubeViewDataTableOptions);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid cubeViewDataTableOptions";
    return withCors(request, { status: 400, jsonBody: { error: msg } });
  }

  const apiVersion =
    typeof body.apiVersion === "string" && body.apiVersion.length > 0
      ? body.apiVersion
      : process.env.ONESTREAM_API_VERSION_CUBE_VIEW || "5.2.0";

  const resultDataTableName =
    typeof body.resultDataTableName === "string" ? body.resultDataTableName : "";
  const customSubst =
    typeof body.customSubstVarsAsCommaSeparatedPairs === "string"
      ? body.customSubstVarsAsCommaSeparatedPairs
      : "";

  try {
    normalizePat(body.pat);
    const result = await oneStreamGetAdoDataSetForCubeViewCommand({
      pat: body.pat,
      baseWebServerUrl: body.baseWebServerUrl,
      apiVersion,
      applicationName: body.applicationName.trim(),
      cubeViewName: body.cubeViewName.trim(),
      dataTablePerCubeViewRow: body.dataTablePerCubeViewRow,
      resultDataTableName,
      cubeViewDataTableOptions: cubeViewOpts,
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
    context.log("cubeViewCommand failed", e);
    return withCors(request, { status: 502, jsonBody: { error: message } });
  }
}

app.http("cubeViewCommand", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "cube-view-command",
  handler: cubeViewCommand,
});
