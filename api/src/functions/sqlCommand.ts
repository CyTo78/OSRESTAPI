import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { withCors } from "../lib/cors";
import {
  oneStreamExecuteSqlQueryRest,
  OneStreamRequestError,
  normalizePat,
} from "../lib/onestreamClient";

type SqlBody = {
  pat?: string;
  baseWebServerUrl?: string;
  sqlApiVersion?: string;
  applicationName?: string;
  sqlQuery?: string;
  dbLocation?: string;
  resultDataTableName?: string;
  xfExternalDbConnectionName?: string;
  customSubstVarsAsCommaSeparatedPairs?: string;
};

async function sqlCommand(
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

  let body: SqlBody;
  try {
    body = (await request.json()) as SqlBody;
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

  const sqlQuery =
    typeof body.sqlQuery === "string"
      ? body.sqlQuery
      : typeof (body as { sqlCommand?: string }).sqlCommand === "string"
        ? (body as { sqlCommand: string }).sqlCommand
        : "";
  if (!sqlQuery.trim()) {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "sqlQuery is required" },
    });
  }

  const dbLocRaw = (body.dbLocation || "Application").trim();
  const dbLocation =
    dbLocRaw === "External" || dbLocRaw === "Application" ? dbLocRaw : null;
  if (!dbLocation) {
    return withCors(request, {
      status: 400,
      jsonBody: { error: "dbLocation must be Application or External" },
    });
  }

  const xfExternal = typeof body.xfExternalDbConnectionName === "string" ? body.xfExternalDbConnectionName : "";
  if (dbLocation === "External" && !xfExternal.trim()) {
    return withCors(request, {
      status: 400,
      jsonBody: {
        error:
          "XFExternalDBConnectionName is required when DbLocation is External",
      },
    });
  }

  const sqlApiVersion =
    typeof body.sqlApiVersion === "string" && body.sqlApiVersion.length > 0
      ? body.sqlApiVersion
      : process.env.ONESTREAM_API_VERSION_SQL || "5.2.0";

  const resultDataTableName =
    typeof body.resultDataTableName === "string" ? body.resultDataTableName.trim() : "";

  const customSubst =
    typeof body.customSubstVarsAsCommaSeparatedPairs === "string"
      ? body.customSubstVarsAsCommaSeparatedPairs
      : "";

  try {
    normalizePat(body.pat);
    const result = await oneStreamExecuteSqlQueryRest({
      pat: body.pat,
      baseWebServerUrl: body.baseWebServerUrl,
      sqlApiVersion,
      applicationName: body.applicationName.trim(),
      sqlQuery: sqlQuery.trim(),
      dbLocation,
      resultDataTableName,
      xfExternalDbConnectionName: xfExternal,
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
    context.log("sqlCommand failed", e);
    return withCors(request, { status: 502, jsonBody: { error: message } });
  }
}

app.http("sqlCommand", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "sql",
  handler: sqlCommand,
});
