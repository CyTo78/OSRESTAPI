import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { withCors } from "../lib/cors";
import {
  oneStreamGetAdoDataSetForAdapter,
  OneStreamRequestError,
  normalizePat,
} from "../lib/onestreamClient";

function adapterApiIsV7(apiVersion: string): boolean {
  const major = parseInt(String(apiVersion).trim().split(".")[0] || "0", 10);
  return major >= 7;
}

type LogonSiBody = {
  XfBytes?: string;
};

type AdapterBody = {
  pat?: string;
  /** Optional Logon token when the platform returns one; else PAT is used for API 7.x. */
  webApiAccessToken?: string;
  baseWebServerUrl?: string;
  apiVersion?: string;
  applicationName?: string;
  adapterName?: string;
  resultDataTableName?: string;
  customSubstVarsAsCommaSeparatedPairs?: string;
  /** API 7.2.0+ only; default false. */
  isSystemLevel?: boolean;
  /** Logon SessionInfo from UI session; required for API 7.x (OpenApplication → SI on adapter call). */
  logonSessionInfo?: LogonSiBody;
};

async function adoAdapterDataset(
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

  let body: AdapterBody;
  try {
    body = (await request.json()) as AdapterBody;
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
  if (!body.adapterName || typeof body.adapterName !== "string" || !body.adapterName.trim()) {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "adapterName is required" },
    });
  }

  const apiVersion =
    typeof body.apiVersion === "string" && body.apiVersion.length > 0
      ? body.apiVersion
      : process.env.ONESTREAM_API_VERSION_ADO_ADAPTER || "7.2.0";

  const v7 = adapterApiIsV7(apiVersion);
  const webTok =
    typeof body.webApiAccessToken === "string" ? body.webApiAccessToken.trim() : "";

  if (v7) {
    const si = body.logonSessionInfo;
    const xf =
      si && typeof si === "object" && typeof si.XfBytes === "string" ? si.XfBytes.trim() : "";
    if (!xf) {
      return withCors(request, {
        status: 400,
        jsonBody: {
          error:
            "logonSessionInfo with XfBytes is required for adapter API 7.x (same as Logon SessionInfo from sign-in).",
        },
      });
    }
  }

  const resultDataTableName =
    typeof body.resultDataTableName === "string" ? body.resultDataTableName : "";
  const customSubst =
    typeof body.customSubstVarsAsCommaSeparatedPairs === "string"
      ? body.customSubstVarsAsCommaSeparatedPairs
      : "";
  const isSystemLevel = body.isSystemLevel === true;

  try {
    normalizePat(body.pat);
    const logonSi =
      v7 && body.logonSessionInfo && typeof body.logonSessionInfo.XfBytes === "string"
        ? { XfBytes: body.logonSessionInfo.XfBytes.trim() }
        : undefined;

    const result = await oneStreamGetAdoDataSetForAdapter({
      pat: body.pat,
      webApiAccessToken: v7 && webTok ? webTok : undefined,
      baseWebServerUrl: body.baseWebServerUrl,
      apiVersion,
      applicationName: body.applicationName.trim(),
      adapterName: body.adapterName.trim(),
      resultDataTableName,
      customSubstVarsAsCommaSeparatedPairs: customSubst,
      isSystemLevel: v7 ? isSystemLevel : undefined,
      logonSessionInfo: logonSi,
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
    context.log("adoAdapterDataset failed", e);
    return withCors(request, { status: 502, jsonBody: { error: message } });
  }
}

app.http("adoAdapterDataset", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "adapter-dataset",
  handler: adoAdapterDataset,
});
