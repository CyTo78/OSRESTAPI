export type LogonParams = {
  pat: string;
  baseWebServerUrl: string;
  apiVersion: string;
};

export type SessionInfo = { XfBytes: string };

export class OneStreamRequestError extends Error {
  readonly statusCode: number;
  readonly responseBody: unknown;

  constructor(statusCode: number, message: string, responseBody: unknown) {
    super(message);
    this.name = "OneStreamRequestError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

function parseBaseWebServerUrl(input: string): URL {
  const trimmed = input.trim();
  try {
    const normalized = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
    return new URL(normalized);
  } catch {
    throw new Error("baseWebServerUrl must be a valid absolute URL (include https://)");
  }
}

export function normalizePat(pat: string): string {
  let p = pat.trim();
  if (/^bearer\s+/i.test(p)) {
    p = p.replace(/^bearer\s+/i, "").trim();
  }
  return p;
}

/** Path segment before `/api/…` (e.g. Onestreamapi, OneStreamApp). Override with ONESTREAM_WEBAPI_SEGMENT. */
function webApiSegment(): string {
  const s = process.env.ONESTREAM_WEBAPI_SEGMENT?.trim();
  const seg = (s || "Onestreamapi").replace(/^\/+|\/+$/g, "");
  return seg;
}

function apiEndpoint(
  baseWebServerUrl: string,
  route: string,
  apiVersion: string
): string {
  const base = baseWebServerUrl.trim().replace(/\/+$/, "");
  parseBaseWebServerUrl(base);
  const origin = new URL(base).origin;
  const segment = webApiSegment();
  return `${origin}/${segment}/api/${route}?api-version=${encodeURIComponent(apiVersion)}`;
}

async function postJsonBearer(
  bearerToken: string,
  url: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const d = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
    const message =
      d && "Message" in d
        ? String(d.Message)
        : d && "detail" in d
          ? String(d.detail)
          : `OneStream HTTP ${res.status}`;
    throw new OneStreamRequestError(
      res.status,
      message || `OneStream HTTP ${res.status}`,
      data
    );
  }

  return data;
}

async function postOneStream(pat: string, url: string, body: unknown): Promise<unknown> {
  return postJsonBearer(normalizePat(pat), url, body);
}

/**
 * POST .../Authentication/Logon
 */
export async function oneStreamLogon(params: LogonParams): Promise<unknown> {
  const baseWebServerUrl = params.baseWebServerUrl.trim().replace(/\/+$/, "");
  const pat = normalizePat(params.pat);
  if (!pat) {
    throw new Error("PAT is empty after trimming");
  }

  const logonUrl = apiEndpoint(
    baseWebServerUrl,
    "Authentication/Logon",
    params.apiVersion
  );

  return postOneStream(pat, logonUrl, { BaseWebServerUrl: baseWebServerUrl });
}

export type OpenApplicationParams = {
  pat: string;
  baseWebServerUrl: string;
  apiVersion: string;
  applicationName: string;
  logonSessionInfo: SessionInfo;
};

/**
 * POST .../Application/OpenApplication — SI must be from Authentication/Logon.
 */
export async function oneStreamOpenApplication(
  params: OpenApplicationParams
): Promise<{ applicationSessionInfo: SessionInfo; raw: unknown }> {
  const url = apiEndpoint(
    params.baseWebServerUrl,
    "Application/OpenApplication",
    params.apiVersion
  );
  const raw = await postOneStream(params.pat, url, {
    ApplicationName: params.applicationName,
    SI: params.logonSessionInfo,
  });

  const appSi = (raw as Record<string, unknown>)["Application SessionInfo"] as
    | SessionInfo
    | undefined;
  if (!appSi?.XfBytes) {
    throw new Error("Open application response missing Application SessionInfo.XfBytes");
  }
  return { applicationSessionInfo: appSi, raw };
}

/** Body for GetAdoDataSetForSqlCommand when using BaseWebServerUrl + SqlQuery (no SI). */
export type SqlQueryRestParams = {
  pat: string;
  baseWebServerUrl: string;
  sqlApiVersion: string;
  applicationName: string;
  sqlQuery: string;
  dbLocation: "Application" | "External";
  resultDataTableName: string;
  xfExternalDbConnectionName: string;
  customSubstVarsAsCommaSeparatedPairs: string;
};

/**
 * POST .../DataProvider/GetAdoDataSetForSqlCommand with PAT bearer and full JSON body
 * (BaseWebServerUrl, ApplicationName, SqlQuery, DbLocation, …).
 */
export async function oneStreamExecuteSqlQueryRest(
  params: SqlQueryRestParams
): Promise<unknown> {
  const base = params.baseWebServerUrl.trim().replace(/\/+$/, "");
  parseBaseWebServerUrl(base);

  const url = apiEndpoint(
    params.baseWebServerUrl,
    "DataProvider/GetAdoDataSetForSqlCommand",
    params.sqlApiVersion
  );

  const body = {
    BaseWebServerUrl: base,
    ApplicationName: params.applicationName,
    SqlQuery: params.sqlQuery,
    DbLocation: params.dbLocation,
    ResultDataTableName: params.resultDataTableName.trim(),
    XFExternalDBConnectionName: params.xfExternalDbConnectionName.trim(),
    CustomSubstVarsAsCommaSeparatedPairs:
      params.customSubstVarsAsCommaSeparatedPairs.trim(),
  };

  return postOneStream(params.pat, url, body);
}

export type ExecuteSequenceParams = {
  pat: string;
  baseWebServerUrl: string;
  apiVersion: string;
  workspaceName: string;
  applicationName: string;
  sequenceName: string;
  customSubstVarsAsCommaSeparatedPairs: string;
};

/**
 * POST .../DataManagement/ExecuteSequence (synchronous completion in API 5.2.0).
 */
export async function oneStreamExecuteSequence(
  params: ExecuteSequenceParams
): Promise<unknown> {
  const base = params.baseWebServerUrl.trim().replace(/\/+$/, "");
  parseBaseWebServerUrl(base);

  const url = apiEndpoint(
    params.baseWebServerUrl,
    "DataManagement/ExecuteSequence",
    params.apiVersion
  );

  const body: Record<string, string> = {
    BaseWebServerUrl: base,
    WorkspaceName: params.workspaceName.trim(),
    ApplicationName: params.applicationName.trim(),
    SequenceName: params.sequenceName.trim(),
  };
  const subst = params.customSubstVarsAsCommaSeparatedPairs.trim();
  if (subst) {
    body.CustomSubstVarsAsCommaSeparatedPairs = subst;
  }

  return postOneStream(params.pat, url, body);
}

export type ExecuteStepParams = {
  pat: string;
  baseWebServerUrl: string;
  apiVersion: string;
  applicationName: string;
  dataManagementGroupName: string;
  stepName: string;
  customSubstVarsAsCommaSeparatedPairs: string;
};

/**
 * POST .../DataManagement/ExecuteStep (API 5.2.0).
 */
export async function oneStreamExecuteStep(
  params: ExecuteStepParams
): Promise<unknown> {
  const base = params.baseWebServerUrl.trim().replace(/\/+$/, "");
  parseBaseWebServerUrl(base);

  const url = apiEndpoint(
    params.baseWebServerUrl,
    "DataManagement/ExecuteStep",
    params.apiVersion
  );

  const body: Record<string, string> = {
    BaseWebServerUrl: base,
    ApplicationName: params.applicationName.trim(),
    DataManagementGroupName: params.dataManagementGroupName.trim(),
    StepName: params.stepName.trim(),
  };
  const subst = params.customSubstVarsAsCommaSeparatedPairs.trim();
  if (subst) {
    body.CustomSubstVarsAsCommaSeparatedPairs = subst;
  }

  return postOneStream(params.pat, url, body);
}

export type GetAdoDataSetForAdapterParams = {
  /** PAT bearer (API 5.2.x). */
  pat: string;
  /**
   * Optional bearer from Logon when the platform returns it (e.g. `access_token`).
   * For API 7.x, if omitted or empty, the PAT is used as Bearer (same as other REST calls).
   */
  webApiAccessToken?: string;
  baseWebServerUrl: string;
  apiVersion: string;
  applicationName: string;
  adapterName: string;
  resultDataTableName: string;
  customSubstVarsAsCommaSeparatedPairs: string;
  /** API 7.2.0+; default false. Sent as string "True" / "False" per OneStream contract. */
  isSystemLevel?: boolean;
};

function isAdapterApiV7(apiVersion: string): boolean {
  const major = parseInt(String(apiVersion).trim().split(".")[0] || "0", 10);
  return major >= 7;
}

/**
 * POST .../DataProvider/GetAdoDataSetForAdapter.
 * API 5.2.x: PAT bearer, body includes WorkspaceName (empty).
 * API 7.2.0+: body includes IsSystemLevel. Bearer is webApiAccessToken when provided, else PAT.
 */
export async function oneStreamGetAdoDataSetForAdapter(
  params: GetAdoDataSetForAdapterParams
): Promise<unknown> {
  const base = params.baseWebServerUrl.trim().replace(/\/+$/, "");
  parseBaseWebServerUrl(base);

  const url = apiEndpoint(
    params.baseWebServerUrl,
    "DataProvider/GetAdoDataSetForAdapter",
    params.apiVersion
  );

  const v7 = isAdapterApiV7(params.apiVersion);

  if (v7) {
    const fromLogon = (params.webApiAccessToken || "").trim();
    const token = fromLogon || normalizePat(params.pat);
    if (!token) {
      throw new Error("PAT (or optional webApiAccessToken) is required for GetAdoDataSetForAdapter API 7.x");
    }
    const body: Record<string, string> = {
      BaseWebServerUrl: base,
      IsSystemLevel: params.isSystemLevel === true ? "True" : "False",
      AdapterName: params.adapterName.trim(),
      ApplicationName: params.applicationName.trim(),
    };
    const table = params.resultDataTableName.trim();
    if (table) {
      body.ResultDataTableName = table;
    }
    const subst = params.customSubstVarsAsCommaSeparatedPairs.trim();
    if (subst) {
      body.CustomSubstVarsAsCommaSeparatedPairs = subst;
    }
    return postJsonBearer(token, url, body);
  }

  const body: Record<string, string> = {
    BaseWebServerUrl: base,
    ApplicationName: params.applicationName.trim(),
    WorkspaceName: "",
    AdapterName: params.adapterName.trim(),
  };
  const table = params.resultDataTableName.trim();
  if (table) {
    body.ResultDataTableName = table;
  }
  const subst = params.customSubstVarsAsCommaSeparatedPairs.trim();
  if (subst) {
    body.CustomSubstVarsAsCommaSeparatedPairs = subst;
  }

  return postOneStream(params.pat, url, body);
}

export type GetAdoDataSetForCubeViewCommandParams = {
  pat: string;
  baseWebServerUrl: string;
  apiVersion: string;
  applicationName: string;
  cubeViewName: string;
  dataTablePerCubeViewRow: boolean;
  resultDataTableName: string;
  cubeViewDataTableOptions: Record<string, unknown> | null;
  customSubstVarsAsCommaSeparatedPairs: string;
};

/**
 * POST .../DataProvider/GetAdoDataSetForCubeViewCommand (API 5.2.0).
 */
export async function oneStreamGetAdoDataSetForCubeViewCommand(
  params: GetAdoDataSetForCubeViewCommandParams
): Promise<unknown> {
  const base = params.baseWebServerUrl.trim().replace(/\/+$/, "");
  parseBaseWebServerUrl(base);

  const url = apiEndpoint(
    params.baseWebServerUrl,
    "DataProvider/GetAdoDataSetForCubeViewCommand",
    params.apiVersion
  );

  const body: Record<string, unknown> = {
    BaseWebServerUrl: base,
    ApplicationName: params.applicationName.trim(),
    CubeViewName: params.cubeViewName.trim(),
    DataTablePerCubeViewRow: params.dataTablePerCubeViewRow,
  };
  const table = params.resultDataTableName.trim();
  if (table) {
    body.ResultDataTableName = table;
  }
  const subst = params.customSubstVarsAsCommaSeparatedPairs.trim();
  if (subst) {
    body.CustomSubstVarsAsCommaSeparatedPairs = subst;
  }
  const opts = params.cubeViewDataTableOptions;
  if (
    opts &&
    typeof opts === "object" &&
    !Array.isArray(opts) &&
    Object.keys(opts).length > 0
  ) {
    body.CubeViewDataTableOptions = opts;
  }

  return postOneStream(params.pat, url, body);
}

export type GetAdoDataSetForMethodCommandParams = {
  pat: string;
  baseWebServerUrl: string;
  apiVersion: string;
  applicationName: string;
  methodQuery: string;
  xfCommandMethodTypeId: string;
  resultDataTableName: string;
  customSubstVarsAsCommaSeparatedPairs: string;
};

/**
 * POST .../DataProvider/GetAdoDataSetForMethodCommand (API 5.2.0).
 */
export async function oneStreamGetAdoDataSetForMethodCommand(
  params: GetAdoDataSetForMethodCommandParams
): Promise<unknown> {
  const base = params.baseWebServerUrl.trim().replace(/\/+$/, "");
  parseBaseWebServerUrl(base);

  const url = apiEndpoint(
    params.baseWebServerUrl,
    "DataProvider/GetAdoDataSetForMethodCommand",
    params.apiVersion
  );

  const body: Record<string, unknown> = {
    BaseWebServerUrl: base,
    ApplicationName: params.applicationName.trim(),
    MethodQuery: params.methodQuery.trim(),
    /** OneStream REST validates this name (not XFCommandMethodTypeId). */
    XFCommandMethodType: params.xfCommandMethodTypeId.trim(),
  };
  const table = params.resultDataTableName.trim();
  if (table) {
    body.ResultDataTableName = table;
  }
  const subst = params.customSubstVarsAsCommaSeparatedPairs.trim();
  if (subst) {
    body.CustomSubstVarsAsCommaSeparatedPairs = subst;
  }

  return postOneStream(params.pat, url, body);
}
