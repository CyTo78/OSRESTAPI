(function () {
  try {
    var t0 = localStorage.getItem("onestream_ui_theme");
    if (t0 === "dark" || t0 === "light") {
      document.documentElement.setAttribute("data-theme", t0);
    }
  } catch (_) {
    /* ignore */
  }

  const LEGACY_API_KEY = "onestream_api_base";
  const SESSION = {
    PAT: "onestream_session_pat",
    BASE: "onestream_session_base",
    LOGON_SI: "onestream_session_logon_si",
    /** Bearer for DataProvider APIs that require Logon access_token (e.g. adapter 7.2.0). */
    WEBAPI_ACCESS_TOKEN: "onestream_session_webapi_access_token",
    APPS: "onestream_session_apps",
    API_VER: "onestream_session_api_ver",
    APP_CHOICE: "onestream_session_app_choice",
  };

  /** v1.2: localStorage keys are per browser origin (works the same on Azure Static Web Apps). */
  const TASK_HIST_PREFIX = "onestream_v1_hist:";
  const TASK_HIST_MAX = 10;
  const TASK_KIND_SQL = "sql";
  const TASK_KIND_SEQ = "seq";
  const TASK_KIND_STEP = "step";
  const TASK_KIND_ADAPTER = "adapter";
  const TASK_KIND_CUBE = "cube";
  const TASK_KIND_METHOD = "method";
  const SQL_HISTORY_LEGACY = "onestream_sql_query_history_v1";
  const SQL_HISTORY_KEY_PREFIX_V2 = "onestream_sql_query_history_v2:";

  /** Metadata SQL for Execute sequence (Application DB only). Adjust if your OneStream schema differs. */
  const DM_SQL_WORKSPACES =
    "SELECT DISTINCT Name, UniqueID FROM DashboardWorkspace WITH (NOLOCK) ORDER BY Name";
  /** DataMgmtSequence rows with no workspace use this identifier in many OneStream apps. */
  const DM_EMPTY_WORKSPACE_GUID = "00000000-0000-0000-0000-000000000000";
  const DP_SQL_ADAPTERS =
    "SELECT DISTINCT Name FROM DashboardAdapter WITH (NOLOCK) ORDER BY Name";
  const DP_SQL_CUBE_VIEWS =
    "select distinct name from cubeviewitem with (nolock) order by name";
  const DM_SQL_DM_GROUPS =
    "SELECT DISTINCT UniqueID, Name FROM DataMgmtGroup WITH (NOLOCK) ORDER BY Name";

  /**
   * Example method-query strings per method type. Keys must match <option value="…"> on
   * #dp-method-xf-type exactly. Edit here to add or change snippets; unknown types show no block.
   */
  const METHOD_QUERY_SNIPPETS = {
    BiBlendInfo:
      "{MyWorkflowProfileName}{Actual}{2026M1}{Empty String or Filter Expression}",
  };

  /** DataMgmtGroup.UniqueID matches DataMgmtStep.DataMgmtGroupID. */
  function dmSqlStepsForGroupId(dataMgmtGroupUniqueId) {
    var g = String(dataMgmtGroupUniqueId || "").trim();
    var esc = g.replace(/'/g, "''");
    return (
      "SELECT DISTINCT Name, DataMgmtGroupID FROM DataMgmtStep WITH (NOLOCK) WHERE DataMgmtGroupID = '" +
      esc +
      "' ORDER BY Name"
    );
  }

  /** DashboardWorkspace.UniqueID matches DataMgmtSequence.workspaceID. */
  function dmSqlSequencesForWorkspaceId(workspaceIdGuid) {
    var g = String(workspaceIdGuid || "").trim() || DM_EMPTY_WORKSPACE_GUID;
    var esc = g.replace(/'/g, "''");
    return (
      "SELECT DISTINCT Name FROM DataMgmtSequence WITH (NOLOCK) WHERE workspaceID = '" +
      esc +
      "' ORDER BY Name"
    );
  }

  /** Static HTML options for Method type; sort by visible label (name) on load. */
  function sortMethodTypeSelectByName() {
    var sel = document.getElementById("dp-method-xf-type");
    if (!sel || sel.options.length < 2) return;
    var opts = Array.prototype.slice.call(sel.options, 1);
    opts.sort(function (a, b) {
      return a.textContent
        .trim()
        .localeCompare(b.textContent.trim(), undefined, { sensitivity: "base" });
    });
    opts.forEach(function (opt) {
      sel.appendChild(opt);
    });
  }

  function methodQuerySnippetForType(typeId) {
    var k = String(typeId || "").trim();
    if (!k) return "";
    if (!Object.prototype.hasOwnProperty.call(METHOD_QUERY_SNIPPETS, k)) return "";
    var s = METHOD_QUERY_SNIPPETS[k];
    return typeof s === "string" && s.trim() ? s : "";
  }

  function updateMethodQuerySnippetUi() {
    var xfEl = document.getElementById("dp-method-xf-type");
    var wrap = document.getElementById("dp-method-snippet-block");
    var pre = document.getElementById("dp-method-query-snippet");
    if (!wrap || !pre) return;
    var snippet = methodQuerySnippetForType(xfEl ? xfEl.value : "");
    if (!snippet) {
      wrap.hidden = true;
      pre.textContent = "";
      return;
    }
    wrap.hidden = false;
    pre.textContent = snippet;
  }

  function rowField(row, names) {
    if (!row || typeof row !== "object") return undefined;
    var lower = {};
    Object.keys(row).forEach(function (k) {
      lower[String(k).toLowerCase()] = row[k];
    });
    for (var i = 0; i < names.length; i++) {
      var v = lower[String(names[i]).toLowerCase()];
      if (v !== undefined) return v;
    }
    return undefined;
  }

  var lastSqlPayload = null;
  var lastAdapterPayload = null;
  var lastCubeViewPayload = null;
  var lastMethodPayload = null;
  var resultViewMode = "table";
  var adapterResultViewMode = "table";
  var cubeViewResultViewMode = "table";
  var methodResultViewMode = "table";

  function syncThemeToggles() {
    var cur = document.documentElement.getAttribute("data-theme") || "light";
    var isDark = cur === "dark";
    document.querySelectorAll(".js-theme-toggle").forEach(function (btn) {
      btn.setAttribute("aria-pressed", isDark ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        isDark ? "Switch to standard (light) theme" : "Switch to dark theme"
      );
      btn.setAttribute(
        "title",
        isDark ? "Switch to standard (light) theme" : "Switch to dark theme"
      );
      var icon = btn.querySelector(".js-theme-toggle-icon");
      if (icon) {
        icon.className =
          "fa-solid js-theme-toggle-icon " + (isDark ? "fa-sun" : "fa-moon");
      }
    });
  }

  function setTheme(mode) {
    var m = mode === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", m);
    try {
      localStorage.setItem("onestream_ui_theme", m);
    } catch (_) {
      /* ignore */
    }
    syncThemeToggles();
  }

  function toggleTheme() {
    var cur = document.documentElement.getAttribute("data-theme") || "light";
    setTheme(cur === "dark" ? "light" : "dark");
  }

  document.querySelectorAll(".js-theme-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      toggleTheme();
    });
  });
  syncThemeToggles();

  function apiStorageKey() {
    try {
      return "onestream_api_base:" + (location.origin || "file");
    } catch (_) {
      return "onestream_api_base:fallback";
    }
  }

  function loadApiBase() {
    try {
      var key = apiStorageKey();
      var v = sessionStorage.getItem(key);
      if ((v === null || v === "") && location.protocol === "file:") {
        v = sessionStorage.getItem(LEGACY_API_KEY);
      }
      return v || "";
    } catch (_) {
      return "";
    }
  }

  function saveApiBase(value) {
    try {
      sessionStorage.setItem(apiStorageKey(), value);
    } catch (_) {
      /* ignore */
    }
  }

  function normalizeApiBase(raw) {
    if (!raw) return "";
    var s = raw.replace(/\/+$/, "");
    if (s.endsWith("/api")) s = s.slice(0, -4);
    return s;
  }

  function isCrossOrigin(absOrRel) {
    if (!absOrRel.startsWith("http")) return false;
    try {
      return new URL(absOrRel, location.href).origin !== location.origin;
    } catch {
      return true;
    }
  }

  function nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  /** Result toolbar line: status + round-trip time (browser → proxy → response body received). */
  function formatHttpMeta(res, elapsedMs) {
    var line = "HTTP " + res.status + " " + res.statusText;
    if (typeof elapsedMs === "number" && !isNaN(elapsedMs) && elapsedMs >= 0) {
      line += " · " + Math.round(elapsedMs) + " ms";
    }
    return line;
  }

  async function apiFetchJson(path, body) {
    var t0 = nowMs();
    var apiBaseInput = document.getElementById("api-base");
    var apiBaseRaw = apiBaseInput ? String(apiBaseInput.value || "").trim() : loadApiBase();
    var apiBase = normalizeApiBase(apiBaseRaw);
    var url = apiBase ? apiBase + path : path;
    var cross = isCrossOrigin(url);
    var init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
    init.credentials = cross ? "omit" : "same-origin";
    var res = await fetch(url, init);
    var text = await res.text();
    var data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    var elapsedMs = nowMs() - t0;
    return { res: res, data: data, elapsedMs: elapsedMs };
  }

  /** Some tenants return a separate web token on Logon; many PAT logons only return SessionInfo. */
  function tryExtractWebApiAccessToken(data) {
    if (!data || typeof data !== "object") return "";
    var keys = [
      "access_token",
      "accessToken",
      "AccessToken",
      "Access_Token",
      "webapi_access_token",
      "WebApiAccessToken",
    ];
    for (var i = 0; i < keys.length; i++) {
      var v = data[keys[i]];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  }

  function clearSession() {
    Object.values(SESSION).forEach(function (k) {
      try {
        sessionStorage.removeItem(k);
      } catch (_) {
        /* ignore */
      }
    });
  }

  function hasStoredSession() {
    try {
      return !!(
        sessionStorage.getItem(SESSION.PAT) &&
        sessionStorage.getItem(SESSION.BASE) &&
        sessionStorage.getItem(SESSION.LOGON_SI)
      );
    } catch (_) {
      return false;
    }
  }

  function showLogin() {
    document.body.classList.remove("mode-workspace");
    var login = document.getElementById("login-screen");
    var ws = document.getElementById("workspace");
    if (login) login.hidden = false;
    if (ws) ws.hidden = true;
    syncThemeToggles();
  }

  function showWorkspace() {
    document.body.classList.add("mode-workspace");
    var login = document.getElementById("login-screen");
    var ws = document.getElementById("workspace");
    if (login) login.hidden = true;
    if (ws) ws.hidden = false;
    syncThemeToggles();
  }

  function populateAppSelect(apps) {
    var sel = document.getElementById("app-select");
    if (!sel) return;
    var saved = "";
    try {
      saved = sessionStorage.getItem(SESSION.APP_CHOICE) || "";
    } catch (_) {
      /* ignore */
    }
    sel.innerHTML = '<option value="">— Select application —</option>';
    (apps || []).forEach(function (name) {
      var o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    });
    if (saved && apps && apps.indexOf(saved) !== -1) {
      sel.value = saved;
    }
    updateAppBanner();
  }

  function updateAppBanner() {
    var sel = document.getElementById("app-select");
    var banner = document.getElementById("banner-need-app");
    if (!banner || !sel) return;
    banner.hidden = !!sel.value;
  }

  function setActiveNav(task) {
    document.querySelectorAll(".nav-item").forEach(function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-task") === task);
    });
    var sqlPanel = document.getElementById("panel-sql");
    var dmPanel = document.getElementById("panel-dm-sequence");
    var dmStepPanel = document.getElementById("panel-dm-step");
    var dpAdapterPanel = document.getElementById("panel-dp-adapter");
    var dpCubePanel = document.getElementById("panel-dp-cube-view");
    var dpMethodPanel = document.getElementById("panel-dp-method-command");
    var changelogPanel = document.getElementById("panel-changelog");
    var ph = document.getElementById("panel-placeholder");
    var banner = document.getElementById("banner-need-app");
    var isSql = task === "sql";
    var isDmSeq = task === "dm-sequence";
    var isDmStep = task === "dm-step";
    var isDpAdapter = task === "dp-adapter";
    var isDpCube = task === "dp-cube-view";
    var isDpMethod = task === "dp-method-command";
    var isChangelog = task === "changelog";
    if (sqlPanel) sqlPanel.hidden = !isSql;
    if (dmPanel) dmPanel.hidden = !isDmSeq;
    if (dmStepPanel) dmStepPanel.hidden = !isDmStep;
    if (dpAdapterPanel) dpAdapterPanel.hidden = !isDpAdapter;
    if (dpCubePanel) dpCubePanel.hidden = !isDpCube;
    if (dpMethodPanel) dpMethodPanel.hidden = !isDpMethod;
    if (changelogPanel) changelogPanel.hidden = !isChangelog;
    if (ph)
      ph.hidden =
        isSql ||
        isDmSeq ||
        isDmStep ||
        isDpAdapter ||
        isDpCube ||
        isDpMethod ||
        isChangelog;
    if (banner) {
      if (isChangelog) banner.hidden = true;
      else updateAppBanner();
    }
    if (isDmSeq) {
      refreshDmSeqListsFromServer();
    }
    if (isDmStep) {
      refreshDmStepListsFromServer();
    }
    if (isDpAdapter) {
      refreshAdapterNamesFromServer();
    }
    if (isDpCube) {
      refreshCubeViewNamesFromServer();
    }
    if (isChangelog) {
      var mainPanel = document.querySelector(".main-panel");
      if (mainPanel) mainPanel.scrollTop = 0;
    }
  }

  function extractTableRows(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (
        Array.isArray(v) &&
        v.length > 0 &&
        v[0] !== null &&
        typeof v[0] === "object" &&
        !Array.isArray(v[0])
      ) {
        return { key: keys[i], rows: v };
      }
    }
    return null;
  }

  /** Run SQL against Application DB only (no side effects from ribbon External / result table). */
  async function runApplicationSqlMetadata(sqlQuery) {
    var sel = document.getElementById("app-select");
    var pat = sessionStorage.getItem(SESSION.PAT);
    var base = sessionStorage.getItem(SESSION.BASE);
    if (!sel || !sel.value || !pat || !base) {
      return { ok: false, values: [] };
    }
    try {
      var r = await apiFetchJson("/api/sql", {
        pat: pat,
        baseWebServerUrl: base,
        applicationName: sel.value,
        sqlQuery: sqlQuery,
        dbLocation: "Application",
        resultDataTableName: "",
        xfExternalDbConnectionName: "",
        customSubstVarsAsCommaSeparatedPairs: "",
        sqlApiVersion: "5.2.0",
      });
      if (!r.res.ok) {
        return { ok: false, values: [] };
      }
      var ex = extractTableRows(r.data);
      if (!ex || !ex.rows || !ex.rows.length) {
        return { ok: true, values: [] };
      }
      /** Preserve API row order (matches SQL ORDER BY); dedupe without re-sorting. */
      var ordered = [];
      var seen = {};
      ex.rows.forEach(function (row) {
        var v = rowField(row, ["Name", "name"]);
        if (v !== null && v !== undefined && String(v).trim() !== "") {
          var s = String(v).trim();
          if (!seen[s]) {
            seen[s] = true;
            ordered.push(s);
          }
        }
      });
      return { ok: true, values: ordered };
    } catch (_) {
      return { ok: false, values: [] };
    }
  }

  function ensureSelectHasValue(sel, val) {
    if (!sel || val === undefined || val === null) return;
    var v = String(val);
    if (!v) return;
    var has = Array.from(sel.options).some(function (o) {
      return o.value === v;
    });
    if (!has) {
      var ox = document.createElement("option");
      ox.value = v;
      ox.textContent = v;
      sel.appendChild(ox);
    }
    sel.value = v;
  }

  /** @param {{ id: string, name: string }[]} workspaces */
  function setDmWorkspaceSelectOptions(workspaces) {
    var sel = document.getElementById("dm-workspace");
    if (!sel) return;
    var keepId = String(sel.value || "").trim();
    var keepName =
      sel.selectedOptions[0] && sel.selectedOptions[0].value
        ? String(sel.selectedOptions[0].textContent || "").trim()
        : "";
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— None / not from list —";
    sel.appendChild(o0);
    (workspaces || []).forEach(function (w) {
      var o = document.createElement("option");
      o.value = w.id;
      o.textContent = w.name;
      sel.appendChild(o);
    });
    if (keepId && Array.from(sel.options).some(function (o) { return o.value === keepId; })) {
      sel.value = keepId;
    } else if (keepName) {
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].textContent.trim() === keepName) {
          sel.selectedIndex = i;
          break;
        }
      }
    } else {
      sel.value = "";
    }
  }

  function ensureDmWorkspaceSelectByName(sel, name) {
    if (!sel) return;
    if (!name) {
      sel.value = "";
      return;
    }
    var t = String(name).trim();
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].textContent.trim() === t) {
        sel.selectedIndex = i;
        return;
      }
    }
    sel.value = "";
  }

  function setDmSequenceSelectOptions(values, placeholderText) {
    var sel = document.getElementById("dm-sequence-name");
    if (!sel) return;
    var keep = String(sel.value || "").trim();
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = placeholderText || "— Select —";
    sel.appendChild(o0);
    (values || []).forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });
    if (keep) {
      ensureSelectHasValue(sel, keep);
    } else {
      sel.value = "";
    }
  }

  var dmSeqListLoadSeq = 0;
  async function refreshDmSequenceOptionsOnly() {
    var wsEl = document.getElementById("dm-workspace");
    if (!wsEl) return;
    var wsId = String(wsEl.value || "").trim();
    var filterGuid = wsId || DM_EMPTY_WORKSPACE_GUID;
    var mySeq = ++dmSeqListLoadSeq;
    var qr = await runApplicationSqlMetadata(dmSqlSequencesForWorkspaceId(filterGuid));
    if (mySeq !== dmSeqListLoadSeq) return;
    var placeholder = wsId
      ? "— Select sequence —"
      : "— Select sequence (no workspace; workspaceID = all-zero GUID) —";
    setDmSequenceSelectOptions(qr.values, placeholder);
  }

  async function runApplicationSqlWorkspaceList() {
    var sel = document.getElementById("app-select");
    var pat = sessionStorage.getItem(SESSION.PAT);
    var base = sessionStorage.getItem(SESSION.BASE);
    if (!sel || !sel.value || !pat || !base) {
      return { ok: false, workspaces: [] };
    }
    try {
      var r = await apiFetchJson("/api/sql", {
        pat: pat,
        baseWebServerUrl: base,
        applicationName: sel.value,
        sqlQuery: DM_SQL_WORKSPACES,
        dbLocation: "Application",
        resultDataTableName: "",
        xfExternalDbConnectionName: "",
        customSubstVarsAsCommaSeparatedPairs: "",
        sqlApiVersion: "5.2.0",
      });
      if (!r.res.ok) {
        return { ok: false, workspaces: [] };
      }
      var ex = extractTableRows(r.data);
      if (!ex || !ex.rows || !ex.rows.length) {
        return { ok: true, workspaces: [] };
      }
      var byId = {};
      ex.rows.forEach(function (row) {
        var id = rowField(row, ["UniqueID", "uniqueID", "uniqueId"]);
        var name = rowField(row, ["Name", "name"]);
        if (id != null && name != null && String(name).trim() !== "") {
          byId[String(id).trim()] = String(name).trim();
        }
      });
      var workspaces = Object.keys(byId).map(function (id) {
        return { id: id, name: byId[id] };
      });
      workspaces.sort(function (a, b) {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
      return { ok: true, workspaces: workspaces };
    } catch (_) {
      return { ok: false, workspaces: [] };
    }
  }

  async function refreshDmSeqListsFromServer() {
    var sel = document.getElementById("app-select");
    if (!sel || !sel.value || !hasStoredSession()) {
      setDmWorkspaceSelectOptions([]);
      setDmSequenceSelectOptions([], "— Select an application in the ribbon —");
      return;
    }
    var wr = await runApplicationSqlWorkspaceList();
    setDmWorkspaceSelectOptions(wr.ok ? wr.workspaces : []);
    await refreshDmSequenceOptionsOnly();
  }

  function getSelectedDmWorkspaceName() {
    var ws = document.getElementById("dm-workspace");
    if (!ws || !ws.value) return "";
    var opt = ws.selectedOptions[0];
    return opt ? String(opt.textContent || "").trim() : "";
  }

  /** @param {{ id: string, name: string }[]} groups */
  function setDmStepGroupSelectOptions(groups) {
    var sel = document.getElementById("dm-step-group");
    if (!sel) return;
    var keepId = String(sel.value || "").trim();
    var keepName =
      sel.selectedOptions[0] && sel.selectedOptions[0].value
        ? String(sel.selectedOptions[0].textContent || "").trim()
        : "";
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Select group —";
    sel.appendChild(o0);
    (groups || []).forEach(function (g) {
      var o = document.createElement("option");
      o.value = g.id;
      o.textContent = g.name;
      sel.appendChild(o);
    });
    if (keepId && Array.from(sel.options).some(function (o) { return o.value === keepId; })) {
      sel.value = keepId;
    } else if (keepName) {
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].textContent.trim() === keepName) {
          sel.selectedIndex = i;
          break;
        }
      }
    } else {
      sel.value = "";
    }
  }

  function ensureDmStepGroupSelectByName(sel, name) {
    if (!sel) return;
    if (!name) {
      sel.value = "";
      return;
    }
    var t = String(name).trim();
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].textContent.trim() === t) {
        sel.selectedIndex = i;
        return;
      }
    }
    sel.value = "";
  }

  function setDmStepNameSelectOptions(names, placeholderText) {
    var sel = document.getElementById("dm-step-name");
    if (!sel) return;
    var keep = String(sel.value || "").trim();
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = placeholderText || "— Select —";
    sel.appendChild(o0);
    (names || []).forEach(function (n) {
      var o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    if (keep) {
      ensureSelectHasValue(sel, keep);
    } else {
      sel.value = "";
    }
  }

  var dmStepListLoadSeq = 0;
  async function refreshDmStepNameOptionsOnly() {
    var gEl = document.getElementById("dm-step-group");
    if (!gEl) return;
    var gid = String(gEl.value || "").trim();
    if (!gid) {
      setDmStepNameSelectOptions([], "— Select a group first —");
      return;
    }
    var mySeq = ++dmStepListLoadSeq;
    var sel = document.getElementById("app-select");
    var pat = sessionStorage.getItem(SESSION.PAT);
    var base = sessionStorage.getItem(SESSION.BASE);
    if (!sel || !sel.value || !pat || !base) {
      setDmStepNameSelectOptions([], "— Select a group first —");
      return;
    }
    try {
      var res = await apiFetchJson("/api/sql", {
        pat: pat,
        baseWebServerUrl: base,
        applicationName: sel.value,
        sqlQuery: dmSqlStepsForGroupId(gid),
        dbLocation: "Application",
        resultDataTableName: "",
        xfExternalDbConnectionName: "",
        customSubstVarsAsCommaSeparatedPairs: "",
        sqlApiVersion: "5.2.0",
      });
      if (mySeq !== dmStepListLoadSeq) return;
      if (!res.res.ok) {
        setDmStepNameSelectOptions([], "— Could not load steps —");
        return;
      }
      var ex = extractTableRows(res.data);
      if (!ex || !ex.rows || !ex.rows.length) {
        setDmStepNameSelectOptions([], "— Select step —");
        return;
      }
      var seen = {};
      ex.rows.forEach(function (row) {
        var n = rowField(row, ["Name", "name"]);
        if (n != null && String(n).trim() !== "") {
          seen[String(n).trim()] = true;
        }
      });
      var names = Object.keys(seen).sort(function (a, b) {
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      });
      setDmStepNameSelectOptions(names, "— Select step —");
    } catch (_) {
      if (mySeq === dmStepListLoadSeq) {
        setDmStepNameSelectOptions([], "— Could not load steps —");
      }
    }
  }

  async function runApplicationSqlDmGroupList() {
    var sel = document.getElementById("app-select");
    var pat = sessionStorage.getItem(SESSION.PAT);
    var base = sessionStorage.getItem(SESSION.BASE);
    if (!sel || !sel.value || !pat || !base) {
      return { ok: false, groups: [] };
    }
    try {
      var r = await apiFetchJson("/api/sql", {
        pat: pat,
        baseWebServerUrl: base,
        applicationName: sel.value,
        sqlQuery: DM_SQL_DM_GROUPS,
        dbLocation: "Application",
        resultDataTableName: "",
        xfExternalDbConnectionName: "",
        customSubstVarsAsCommaSeparatedPairs: "",
        sqlApiVersion: "5.2.0",
      });
      if (!r.res.ok) {
        return { ok: false, groups: [] };
      }
      var ex = extractTableRows(r.data);
      if (!ex || !ex.rows || !ex.rows.length) {
        return { ok: true, groups: [] };
      }
      var byId = {};
      ex.rows.forEach(function (row) {
        var id = rowField(row, ["UniqueID", "uniqueID", "uniqueId"]);
        var name = rowField(row, ["Name", "name"]);
        if (id != null && name != null && String(name).trim() !== "") {
          byId[String(id).trim()] = String(name).trim();
        }
      });
      var groups = Object.keys(byId).map(function (id) {
        return { id: id, name: byId[id] };
      });
      groups.sort(function (a, b) {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
      return { ok: true, groups: groups };
    } catch (_) {
      return { ok: false, groups: [] };
    }
  }

  async function refreshDmStepListsFromServer() {
    var sel = document.getElementById("app-select");
    if (!sel || !sel.value || !hasStoredSession()) {
      setDmStepGroupSelectOptions([]);
      setDmStepNameSelectOptions([], "— Select an application in the ribbon —");
      return;
    }
    var gr = await runApplicationSqlDmGroupList();
    setDmStepGroupSelectOptions(gr.ok ? gr.groups : []);
    await refreshDmStepNameOptionsOnly();
  }

  function getSelectedDmGroupName() {
    var g = document.getElementById("dm-step-group");
    if (!g || !g.value) return "";
    var opt = g.selectedOptions[0];
    return opt ? String(opt.textContent || "").trim() : "";
  }

  function setDpAdapterNameOptions(names) {
    var sel = document.getElementById("dp-adapter-name");
    if (!sel) return;
    var keep = String(sel.value || "").trim();
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Select adapter —";
    sel.appendChild(o0);
    (names || []).forEach(function (n) {
      var o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    if (keep) {
      ensureSelectHasValue(sel, keep);
    } else {
      sel.value = "";
    }
  }

  async function refreshAdapterNamesFromServer() {
    var sel = document.getElementById("app-select");
    if (!sel || !sel.value || !hasStoredSession()) {
      setDpAdapterNameOptions([]);
      return;
    }
    var r = await runApplicationSqlMetadata(DP_SQL_ADAPTERS);
    setDpAdapterNameOptions(r.ok ? r.values : []);
  }

  function setDpCubeViewNameOptions(names) {
    var sel = document.getElementById("dp-cube-view-name");
    if (!sel) return;
    var keep = String(sel.value || "").trim();
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Select cube view —";
    sel.appendChild(o0);
    (names || []).forEach(function (n) {
      var o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    if (keep) {
      ensureSelectHasValue(sel, keep);
    } else {
      sel.value = "";
    }
  }

  async function refreshCubeViewNamesFromServer() {
    var sel = document.getElementById("app-select");
    if (!sel || !sel.value || !hasStoredSession()) {
      setDpCubeViewNameOptions([]);
      return;
    }
    var r = await runApplicationSqlMetadata(DP_SQL_CUBE_VIEWS);
    setDpCubeViewNameOptions(r.ok ? r.values : []);
  }

  function renderTableInto(container, rows) {
    container.innerHTML = "";
    if (!rows || !rows.length) {
      var p = document.createElement("p");
      p.style.padding = "0.65rem";
      p.style.margin = "0";
      p.style.color = "var(--color-text-muted)";
      p.style.fontSize = "0.85rem";
      p.textContent =
        "No table could be built (no array of row objects in the response). Use JSON view.";
      container.appendChild(p);
      return;
    }
    var keys = Object.keys(rows[0]);
    var table = document.createElement("table");
    var thead = document.createElement("thead");
    var thr = document.createElement("tr");
    keys.forEach(function (k) {
      var th = document.createElement("th");
      th.textContent = k;
      thr.appendChild(th);
    });
    thead.appendChild(thr);
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      keys.forEach(function (k) {
        var td = document.createElement("td");
        var v = row[k];
        if (v === null || v === undefined) {
          td.textContent = "";
        } else if (typeof v === "object") {
          td.textContent = JSON.stringify(v);
        } else {
          td.textContent = String(v);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var scrollInner = document.createElement("div");
    scrollInner.className = "result-table-scroll-inner";
    scrollInner.appendChild(table);
    container.appendChild(scrollInner);
  }

  function setResultView(mode) {
    resultViewMode = mode === "table" ? "table" : "json";
    var bj = document.getElementById("view-json");
    var bt = document.getElementById("view-table");
    var pre = document.getElementById("sql-result-json");
    var wrap = document.getElementById("sql-result-table-wrap");
    if (bj) bj.classList.toggle("is-on", resultViewMode === "json");
    if (bt) bt.classList.toggle("is-on", resultViewMode === "table");
    if (pre) pre.style.display = resultViewMode === "json" ? "block" : "none";
    if (wrap) wrap.hidden = resultViewMode !== "table";
  }

  function displaySqlResult(res, data, elapsedMs) {
    var shell = document.getElementById("sql-result");
    var meta = document.getElementById("sql-result-meta");
    var pre = document.getElementById("sql-result-json");
    var wrap = document.getElementById("sql-result-table-wrap");
    if (!shell || !meta || !pre || !wrap) return;

    lastSqlPayload = {
      status: res.status,
      statusText: res.statusText,
      data: data,
    };

    meta.textContent = formatHttpMeta(res, elapsedMs);
    try {
      pre.textContent = JSON.stringify(data, null, 2);
    } catch {
      pre.textContent = String(data);
    }

    var extracted = extractTableRows(data);
    wrap.innerHTML = "";
    if (extracted && extracted.rows) {
      renderTableInto(wrap, extracted.rows);
    } else {
      renderTableInto(wrap, []);
    }

    shell.hidden = false;
    setResultView(resultViewMode);
  }

  function setAdapterResultView(mode) {
    adapterResultViewMode = mode === "table" ? "table" : "json";
    var bj = document.getElementById("adapter-view-json");
    var bt = document.getElementById("adapter-view-table");
    var pre = document.getElementById("adapter-result-json");
    var wrap = document.getElementById("adapter-result-table-wrap");
    if (bj) bj.classList.toggle("is-on", adapterResultViewMode === "json");
    if (bt) bt.classList.toggle("is-on", adapterResultViewMode === "table");
    if (pre) pre.style.display = adapterResultViewMode === "json" ? "block" : "none";
    if (wrap) wrap.hidden = adapterResultViewMode !== "table";
  }

  function displayAdapterResult(res, data, elapsedMs) {
    var shell = document.getElementById("adapter-result");
    var meta = document.getElementById("adapter-result-meta");
    var pre = document.getElementById("adapter-result-json");
    var wrap = document.getElementById("adapter-result-table-wrap");
    if (!shell || !meta || !pre || !wrap) return;

    lastAdapterPayload = {
      status: res.status,
      statusText: res.statusText,
      data: data,
    };

    meta.textContent = formatHttpMeta(res, elapsedMs);
    try {
      pre.textContent = JSON.stringify(data, null, 2);
    } catch {
      pre.textContent = String(data);
    }

    var extracted = extractTableRows(data);
    wrap.innerHTML = "";
    if (extracted && extracted.rows) {
      renderTableInto(wrap, extracted.rows);
    } else {
      renderTableInto(wrap, []);
    }

    shell.hidden = false;
    setAdapterResultView(adapterResultViewMode);
  }

  function getAdapterExportRows() {
    if (!lastAdapterPayload || !lastAdapterPayload.data) return null;
    var ex = extractTableRows(lastAdapterPayload.data);
    return ex && ex.rows && ex.rows.length ? ex.rows : null;
  }

  function setCubeViewResultView(mode) {
    cubeViewResultViewMode = mode === "table" ? "table" : "json";
    var bj = document.getElementById("cubeview-view-json");
    var bt = document.getElementById("cubeview-view-table");
    var pre = document.getElementById("cubeview-result-json");
    var wrap = document.getElementById("cubeview-result-table-wrap");
    if (bj) bj.classList.toggle("is-on", cubeViewResultViewMode === "json");
    if (bt) bt.classList.toggle("is-on", cubeViewResultViewMode === "table");
    if (pre) pre.style.display = cubeViewResultViewMode === "json" ? "block" : "none";
    if (wrap) wrap.hidden = cubeViewResultViewMode !== "table";
  }

  function displayCubeViewResult(res, data, elapsedMs) {
    var shell = document.getElementById("cubeview-result");
    var meta = document.getElementById("cubeview-result-meta");
    var pre = document.getElementById("cubeview-result-json");
    var wrap = document.getElementById("cubeview-result-table-wrap");
    if (!shell || !meta || !pre || !wrap) return;

    lastCubeViewPayload = {
      status: res.status,
      statusText: res.statusText,
      data: data,
    };

    meta.textContent = formatHttpMeta(res, elapsedMs);
    try {
      pre.textContent = JSON.stringify(data, null, 2);
    } catch {
      pre.textContent = String(data);
    }

    var extracted = extractTableRows(data);
    wrap.innerHTML = "";
    if (extracted && extracted.rows) {
      renderTableInto(wrap, extracted.rows);
    } else {
      renderTableInto(wrap, []);
    }

    shell.hidden = false;
    setCubeViewResultView(cubeViewResultViewMode);
  }

  function getCubeViewExportRows() {
    if (!lastCubeViewPayload || !lastCubeViewPayload.data) return null;
    var ex = extractTableRows(lastCubeViewPayload.data);
    return ex && ex.rows && ex.rows.length ? ex.rows : null;
  }

  function setMethodResultView(mode) {
    methodResultViewMode = mode === "table" ? "table" : "json";
    var bj = document.getElementById("method-view-json");
    var bt = document.getElementById("method-view-table");
    var pre = document.getElementById("method-result-json");
    var wrap = document.getElementById("method-result-table-wrap");
    if (bj) bj.classList.toggle("is-on", methodResultViewMode === "json");
    if (bt) bt.classList.toggle("is-on", methodResultViewMode === "table");
    if (pre) pre.style.display = methodResultViewMode === "json" ? "block" : "none";
    if (wrap) wrap.hidden = methodResultViewMode !== "table";
  }

  function displayMethodResult(res, data, elapsedMs) {
    var shell = document.getElementById("method-result");
    var meta = document.getElementById("method-result-meta");
    var pre = document.getElementById("method-result-json");
    var wrap = document.getElementById("method-result-table-wrap");
    if (!shell || !meta || !pre || !wrap) return;

    lastMethodPayload = {
      status: res.status,
      statusText: res.statusText,
      data: data,
    };

    meta.textContent = formatHttpMeta(res, elapsedMs);
    try {
      pre.textContent = JSON.stringify(data, null, 2);
    } catch {
      pre.textContent = String(data);
    }

    var extracted = extractTableRows(data);
    wrap.innerHTML = "";
    if (extracted && extracted.rows) {
      renderTableInto(wrap, extracted.rows);
    } else {
      renderTableInto(wrap, []);
    }

    shell.hidden = false;
    setMethodResultView(methodResultViewMode);
  }

  function getMethodExportRows() {
    if (!lastMethodPayload || !lastMethodPayload.data) return null;
    var ex = extractTableRows(lastMethodPayload.data);
    return ex && ex.rows && ex.rows.length ? ex.rows : null;
  }

  function displaySimpleJsonResult(res, data, shellId, metaId, preId, elapsedMs) {
    var shell = document.getElementById(shellId);
    var meta = document.getElementById(metaId);
    var pre = document.getElementById(preId);
    if (!shell || !meta || !pre) return;

    meta.textContent = formatHttpMeta(res, elapsedMs);
    try {
      pre.textContent =
        typeof data === "string" ? data : JSON.stringify(data, null, 2);
    } catch {
      pre.textContent = String(data);
    }
    shell.hidden = false;
  }

  function displayDmResult(res, data, elapsedMs) {
    displaySimpleJsonResult(res, data, "dm-result", "dm-result-meta", "dm-result-json", elapsedMs);
  }

  function downloadBlob(filename, mime, text) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  function getExportRows() {
    if (!lastSqlPayload || !lastSqlPayload.data) return null;
    var ex = extractTableRows(lastSqlPayload.data);
    return ex && ex.rows && ex.rows.length ? ex.rows : null;
  }

  /** Semicolon-separated values (common for Excel in European locales). */
  var CSV_FIELD_SEP = ";";

  function rowsToCsv(rows) {
    if (!rows || !rows.length) return "";
    var keys = Object.keys(rows[0]);
    var lines = [keys.map(csvEscape).join(CSV_FIELD_SEP)];
    rows.forEach(function (row) {
      lines.push(
        keys
          .map(function (k) {
            return csvEscape(row[k]);
          })
          .join(CSV_FIELD_SEP)
      );
    });
    return lines.join("\r\n");
  }

  function csvEscape(val) {
    if (val === null || val === undefined) return "";
    var s = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (/[";\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-xlsx="1"]')) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.setAttribute("data-xlsx", "1");
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Could not load " + src));
      };
      document.head.appendChild(s);
    });
  }

  document.getElementById("view-json")?.addEventListener("click", function () {
    setResultView("json");
  });
  document.getElementById("view-table")?.addEventListener("click", function () {
    setResultView("table");
  });

  document.getElementById("export-json")?.addEventListener("click", function () {
    if (!lastSqlPayload) return;
    var payload = {
      httpStatus: lastSqlPayload.status,
      httpStatusText: lastSqlPayload.statusText,
      body: lastSqlPayload.data,
    };
    downloadBlob(
      "onestream-result.json",
      "application/json;charset=utf-8",
      JSON.stringify(payload, null, 2)
    );
  });

  document.getElementById("export-csv")?.addEventListener("click", function () {
    var rows = getExportRows();
    if (!rows) {
      alert("No tabular rows to export. Switch to JSON export or use a response that includes a row array.");
      return;
    }
    downloadBlob("onestream-result.csv", "text/csv;charset=utf-8", rowsToCsv(rows));
  });

  document.getElementById("export-xlsx")?.addEventListener("click", async function () {
    var rows = getExportRows();
    if (!rows) {
      alert("No tabular rows to export. Use JSON export instead.");
      return;
    }
    try {
      await loadScript(
        "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
      );
      var XLSX = window.XLSX;
      if (!XLSX || !XLSX.utils) {
        alert("Excel library failed to load.");
        return;
      }
      var ws = XLSX.utils.json_to_sheet(rows);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Result");
      XLSX.writeFile(wb, "onestream-result.xlsx");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  });

  document.getElementById("adapter-view-json")?.addEventListener("click", function () {
    setAdapterResultView("json");
  });
  document.getElementById("adapter-view-table")?.addEventListener("click", function () {
    setAdapterResultView("table");
  });

  document.getElementById("adapter-export-json")?.addEventListener("click", function () {
    if (!lastAdapterPayload) return;
    var payload = {
      httpStatus: lastAdapterPayload.status,
      httpStatusText: lastAdapterPayload.statusText,
      body: lastAdapterPayload.data,
    };
    downloadBlob(
      "onestream-adapter-result.json",
      "application/json;charset=utf-8",
      JSON.stringify(payload, null, 2)
    );
  });

  document.getElementById("adapter-export-csv")?.addEventListener("click", function () {
    var rows = getAdapterExportRows();
    if (!rows) {
      alert("No tabular rows to export. Switch to JSON export or use a response that includes a row array.");
      return;
    }
    downloadBlob("onestream-adapter-result.csv", "text/csv;charset=utf-8", rowsToCsv(rows));
  });

  document.getElementById("adapter-export-xlsx")?.addEventListener("click", async function () {
    var rows = getAdapterExportRows();
    if (!rows) {
      alert("No tabular rows to export. Use JSON export instead.");
      return;
    }
    try {
      await loadScript(
        "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
      );
      var XLSX = window.XLSX;
      if (!XLSX || !XLSX.utils) {
        alert("Excel library failed to load.");
        return;
      }
      var ws = XLSX.utils.json_to_sheet(rows);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Result");
      XLSX.writeFile(wb, "onestream-adapter-result.xlsx");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  });

  document.getElementById("cubeview-view-json")?.addEventListener("click", function () {
    setCubeViewResultView("json");
  });
  document.getElementById("cubeview-view-table")?.addEventListener("click", function () {
    setCubeViewResultView("table");
  });

  document.getElementById("cubeview-export-json")?.addEventListener("click", function () {
    if (!lastCubeViewPayload) return;
    var payload = {
      httpStatus: lastCubeViewPayload.status,
      httpStatusText: lastCubeViewPayload.statusText,
      body: lastCubeViewPayload.data,
    };
    downloadBlob(
      "onestream-cubeview-result.json",
      "application/json;charset=utf-8",
      JSON.stringify(payload, null, 2)
    );
  });

  document.getElementById("cubeview-export-csv")?.addEventListener("click", function () {
    var rows = getCubeViewExportRows();
    if (!rows) {
      alert("No tabular rows to export. Switch to JSON export or use a response that includes a row array.");
      return;
    }
    downloadBlob("onestream-cubeview-result.csv", "text/csv;charset=utf-8", rowsToCsv(rows));
  });

  document.getElementById("cubeview-export-xlsx")?.addEventListener("click", async function () {
    var rows = getCubeViewExportRows();
    if (!rows) {
      alert("No tabular rows to export. Use JSON export instead.");
      return;
    }
    try {
      await loadScript(
        "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
      );
      var XLSX = window.XLSX;
      if (!XLSX || !XLSX.utils) {
        alert("Excel library failed to load.");
        return;
      }
      var ws = XLSX.utils.json_to_sheet(rows);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Result");
      XLSX.writeFile(wb, "onestream-cubeview-result.xlsx");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  });

  document.getElementById("method-view-json")?.addEventListener("click", function () {
    setMethodResultView("json");
  });
  document.getElementById("method-view-table")?.addEventListener("click", function () {
    setMethodResultView("table");
  });

  document.getElementById("method-export-json")?.addEventListener("click", function () {
    if (!lastMethodPayload) return;
    var payload = {
      httpStatus: lastMethodPayload.status,
      httpStatusText: lastMethodPayload.statusText,
      body: lastMethodPayload.data,
    };
    downloadBlob(
      "onestream-method-result.json",
      "application/json;charset=utf-8",
      JSON.stringify(payload, null, 2)
    );
  });

  document.getElementById("method-export-csv")?.addEventListener("click", function () {
    var rows = getMethodExportRows();
    if (!rows) {
      alert("No tabular rows to export. Switch to JSON export or use a response that includes a row array.");
      return;
    }
    downloadBlob("onestream-method-result.csv", "text/csv;charset=utf-8", rowsToCsv(rows));
  });

  document.getElementById("method-export-xlsx")?.addEventListener("click", async function () {
    var rows = getMethodExportRows();
    if (!rows) {
      alert("No tabular rows to export. Use JSON export instead.");
      return;
    }
    try {
      await loadScript(
        "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
      );
      var XLSX = window.XLSX;
      if (!XLSX || !XLSX.utils) {
        alert("Excel library failed to load.");
        return;
      }
      var ws = XLSX.utils.json_to_sheet(rows);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Result");
      XLSX.writeFile(wb, "onestream-method-result.xlsx");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  });

  var loginForm = document.getElementById("logon-form");
  var loginResult = document.getElementById("login-result");
  var patField = document.getElementById("pat-field");
  var patToggle = document.getElementById("pat-toggle");
  var apiBaseInput = document.getElementById("api-base");
  var apiBaseClear = document.getElementById("api-base-clear");

  if (apiBaseInput) {
    apiBaseInput.value = loadApiBase();
    if (location.protocol === "file:" && !apiBaseInput.value.trim()) {
      apiBaseInput.value = "http://127.0.0.1:7071";
    }
  }

  if (apiBaseClear && apiBaseInput) {
    apiBaseClear.addEventListener("click", function () {
      apiBaseInput.value = "";
      saveApiBase("");
      try {
        sessionStorage.removeItem(LEGACY_API_KEY);
      } catch (_) {
        /* ignore */
      }
    });
  }

  if (patToggle && patField) {
    patToggle.addEventListener("click", function () {
      var showing = patField.type === "text";
      patField.type = showing ? "password" : "text";
      patToggle.textContent = showing ? "Show" : "Hide";
      patToggle.setAttribute("aria-pressed", showing ? "false" : "true");
    });
  }

  if (loginForm && loginResult) {
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fd = new FormData(loginForm);
      var baseWebServerUrl = String(fd.get("baseWebServerUrl") || "").trim();
      var pat = String(fd.get("pat") || "").trim();
      if (/^bearer\s+/i.test(pat)) pat = pat.replace(/^bearer\s+/i, "").trim();

      var apiBaseRaw = apiBaseInput ? String(apiBaseInput.value || "").trim() : "";
      var apiBase = normalizeApiBase(apiBaseRaw);
      if (apiBaseInput && apiBaseRaw !== apiBase) apiBaseInput.value = apiBase;
      saveApiBase(apiBase);

      if (location.protocol === "file:" && !apiBase) {
        loginResult.innerHTML =
          "<p>Set API proxy URL or use <code>npm run dev</code>.</p>";
        return;
      }
      if (location.protocol === "https:" && apiBase.startsWith("http:")) {
        loginResult.innerHTML = "<p>Mixed content blocked.</p>";
        return;
      }

      loginResult.textContent = "Signing in…";
      try {
        var r = await apiFetchJson("/api/logon", {
          baseWebServerUrl: baseWebServerUrl,
          pat: pat,
        });
        if (!r.res.ok) {
          loginResult.innerHTML =
            "<pre style=\"white-space:pre-wrap;word-break:break-word;font-size:0.85rem\">" +
            escapeHtml(JSON.stringify(r.data, null, 2)) +
            "</pre>";
          return;
        }
        var data = r.data;
        var logonSi = data["Logon SessionInfo"];
        var apps = data["Authorized applications"];
        if (!logonSi || !logonSi.XfBytes) {
          loginResult.textContent = "Missing Logon SessionInfo.";
          return;
        }
        var webTok = tryExtractWebApiAccessToken(data);
        try {
          sessionStorage.setItem(SESSION.PAT, pat);
          sessionStorage.setItem(SESSION.BASE, baseWebServerUrl);
          sessionStorage.setItem(SESSION.LOGON_SI, JSON.stringify(logonSi));
          sessionStorage.setItem(SESSION.APPS, JSON.stringify(apps || []));
          sessionStorage.setItem(SESSION.API_VER, "7.2.0");
          if (webTok) {
            sessionStorage.setItem(SESSION.WEBAPI_ACCESS_TOKEN, webTok);
          } else {
            sessionStorage.removeItem(SESSION.WEBAPI_ACCESS_TOKEN);
          }
        } catch (err) {
          loginResult.textContent = "Could not save session: " + String(err);
          return;
        }
        loginResult.textContent = "";
        populateAppSelect(apps);
        setActiveNav("sql");
        updateSqlDbLocationUi();
        refreshAllTaskHistories();
        showWorkspace();
      } catch (err) {
        loginResult.innerHTML =
          "<p><strong>Failed to fetch</strong></p><p>" +
          escapeHtml(err instanceof Error ? err.message : String(err)) +
          "</p>";
      }
    });
  }

  var appSelect = document.getElementById("app-select");
  if (appSelect) {
    appSelect.addEventListener("change", function () {
      try {
        sessionStorage.setItem(SESSION.APP_CHOICE, appSelect.value);
      } catch (_) {
        /* ignore */
      }
      updateAppBanner();
      refreshAllTaskHistories();
      var dmPanel = document.getElementById("panel-dm-sequence");
      if (dmPanel && !dmPanel.hidden) {
        refreshDmSeqListsFromServer();
      }
      var dmStepPanel = document.getElementById("panel-dm-step");
      if (dmStepPanel && !dmStepPanel.hidden) {
        refreshDmStepListsFromServer();
      }
      var dpAdapterPanel = document.getElementById("panel-dp-adapter");
      if (dpAdapterPanel && !dpAdapterPanel.hidden) {
        refreshAdapterNamesFromServer();
      }
      var dpCubePanel = document.getElementById("panel-dp-cube-view");
      if (dpCubePanel && !dpCubePanel.hidden) {
        refreshCubeViewNamesFromServer();
      }
    });
  }

  document.getElementById("btn-disconnect")?.addEventListener("click", function () {
    clearSession();
    if (patField) patField.value = "";
    lastSqlPayload = null;
    lastAdapterPayload = null;
    lastCubeViewPayload = null;
    lastMethodPayload = null;
    var shell = document.getElementById("sql-result");
    if (shell) shell.hidden = true;
    var dmShell = document.getElementById("dm-result");
    if (dmShell) dmShell.hidden = true;
    var dmStepShell = document.getElementById("dm-step-result");
    if (dmStepShell) dmStepShell.hidden = true;
    var adapterShell = document.getElementById("adapter-result");
    if (adapterShell) adapterShell.hidden = true;
    var cubeShell = document.getElementById("cubeview-result");
    if (cubeShell) cubeShell.hidden = true;
    var methodShell = document.getElementById("method-result");
    if (methodShell) methodShell.hidden = true;
    showLogin();
  });

  document.querySelectorAll(".nav-item[data-task]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.disabled) return;
      var task = btn.getAttribute("data-task");
      setActiveNav(task || "sql");
    });
  });

  /** Fingerprint PAT + BaseWebServerUrl so history is scoped per sign-in identity (not stored in plaintext). */
  function userHistFingerprint() {
    try {
      var pat = sessionStorage.getItem(SESSION.PAT) || "";
      var base = sessionStorage.getItem(SESSION.BASE) || "";
      if (!pat) return "";
      var s = pat + "\x1e" + base;
      var h = 2166136261 >>> 0;
      for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h.toString(16);
    } catch (_) {
      return "";
    }
  }

  function taskHistStorageKey(kind, appName) {
    var fp = userHistFingerprint();
    if (!fp || !appName) return null;
    return TASK_HIST_PREFIX + kind + ":" + fp + ":" + encodeURIComponent(appName);
  }

  /** Migrate older SQL-only keys (per app, no user split) into v1 hist once. */
  function migrateSqlHistoryIntoV1(appName) {
    if (!appName) return;
    var newKey = taskHistStorageKey(TASK_KIND_SQL, appName);
    if (!newKey) return;
    try {
      if (localStorage.getItem(newKey)) return;
      var v2 = localStorage.getItem(SQL_HISTORY_KEY_PREFIX_V2 + appName);
      if (v2) {
        localStorage.setItem(newKey, v2);
        localStorage.removeItem(SQL_HISTORY_KEY_PREFIX_V2 + appName);
        return;
      }
      var leg = localStorage.getItem(SQL_HISTORY_LEGACY);
      if (!leg) return;
      var list = JSON.parse(leg);
      if (Array.isArray(list) && list.length) {
        localStorage.setItem(newKey, JSON.stringify(list.slice(0, TASK_HIST_MAX)));
      }
      localStorage.removeItem(SQL_HISTORY_LEGACY);
    } catch (_) {
      /* ignore */
    }
  }

  function readTaskHistoryList(kind, appName) {
    if (kind === TASK_KIND_SQL) {
      migrateSqlHistoryIntoV1(appName);
    }
    var key = taskHistStorageKey(kind, appName);
    if (!key) return [];
    try {
      var list = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function pushTaskHistory(kind, appName, payload) {
    var key = taskHistStorageKey(kind, appName);
    if (!key) return;
    var ser =
      kind === TASK_KIND_SQL
        ? String(payload || "").trim()
        : JSON.stringify(payload);
    if (!ser) return;
    try {
      var list = readTaskHistoryList(kind, appName);
      list = list.filter(function (x) {
        return x !== ser;
      });
      list.unshift(ser);
      list = list.slice(0, TASK_HIST_MAX);
      localStorage.setItem(key, JSON.stringify(list));
    } catch (_) {
      /* ignore */
    }
    refreshAllTaskHistories();
  }

  /** Read CustomSubstVars from history JSON (current key + legacy per-task shapes). */
  function histSubstValue(o, cubeLegacyS) {
    if (!o || typeof o !== "object") return "";
    if (typeof o.customSubstVars === "string") return o.customSubstVars;
    if (cubeLegacyS && typeof o.s === "string") return o.s;
    if (!cubeLegacyS && typeof o.v === "string") return o.v;
    return "";
  }

  function formatHistoryChip(kind, ser) {
    if (kind === TASK_KIND_SQL) {
      return ser.length > 48 ? ser.slice(0, 47) + "…" : ser;
    }
    try {
      var o = JSON.parse(ser);
      if (kind === TASK_KIND_SEQ) return (o.w || "") + " · " + (o.s || "");
      if (kind === TASK_KIND_STEP) return (o.g || "") + " · " + (o.s || "");
      if (kind === TASK_KIND_ADAPTER) return o.a || ser.slice(0, 40);
      if (kind === TASK_KIND_CUBE) return o.v || ser.slice(0, 40);
      if (kind === TASK_KIND_METHOD) {
        var t0 = o.t || "";
        var q0 = o.q || "";
        var chip = (t0 ? t0 + " · " : "") + q0;
        return chip.length > 48 ? chip.slice(0, 47) + "…" : chip || ser.slice(0, 40);
      }
    } catch (_) {
      /* fall through */
    }
    return ser.length > 48 ? ser.slice(0, 47) + "…" : ser;
  }

  function renderHistoryStrip(kind, listId, emptyNeedAppMsg, emptyNoneMsg, onPick) {
    var host = document.getElementById(listId);
    if (!host) return;
    host.innerHTML = "";
    var sel = document.getElementById("app-select");
    var appName = sel && sel.value ? String(sel.value) : "";
    if (!appName) {
      var needApp = document.createElement("span");
      needApp.style.fontSize = "0.75rem";
      needApp.style.color = "var(--color-text-muted)";
      needApp.textContent = emptyNeedAppMsg;
      host.appendChild(needApp);
      return;
    }
    if (!userHistFingerprint()) {
      var needSignIn = document.createElement("span");
      needSignIn.style.fontSize = "0.75rem";
      needSignIn.style.color = "var(--color-text-muted)";
      needSignIn.textContent = "Sign in to save recent runs.";
      host.appendChild(needSignIn);
      return;
    }
    var list = readTaskHistoryList(kind, appName);
    if (!list.length) {
      var empty = document.createElement("span");
      empty.style.fontSize = "0.75rem";
      empty.style.color = "var(--color-text-muted)";
      empty.textContent = emptyNoneMsg;
      host.appendChild(empty);
      return;
    }
    list.forEach(function (ser) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary outline";
      btn.title = kind === TASK_KIND_SQL ? ser : ser;
      btn.textContent = formatHistoryChip(kind, ser);
      btn.addEventListener("click", function () {
        onPick(ser);
      });
      host.appendChild(btn);
    });
  }

  function refreshAllTaskHistories() {
    renderHistoryStrip(
      TASK_KIND_SQL,
      "sql-history-list",
      "Select an application to see recent SQL for that app.",
      "None yet — successful runs are saved here.",
      function (ser) {
        var ta = document.getElementById("sql-input");
        if (ta) ta.value = ser;
        ta?.focus();
      }
    );
    renderHistoryStrip(
      TASK_KIND_SEQ,
      "dm-seq-history-list",
      "Select an application to see recent sequences.",
      "None yet — successful runs are saved here.",
      function (ser) {
        try {
          var o = JSON.parse(ser);
          var ws = document.getElementById("dm-workspace");
          var sq = document.getElementById("dm-sequence-name");
          var sv = document.getElementById("dm-subst-vars");
          if (ws && o.w) {
            ensureDmWorkspaceSelectByName(ws, o.w);
            refreshDmSequenceOptionsOnly().then(function () {
              if (sq && o.s) ensureSelectHasValue(sq, o.s);
            });
          } else {
            if (ws) ws.value = "";
            if (sq) sq.value = "";
            if (ws && !o.w) refreshDmSequenceOptionsOnly();
          }
          if (sv) sv.value = histSubstValue(o, false);
          ws?.focus();
        } catch (_) {
          /* ignore */
        }
      }
    );
    renderHistoryStrip(
      TASK_KIND_STEP,
      "dm-step-history-list",
      "Select an application to see recent steps.",
      "None yet — successful runs are saved here.",
      function (ser) {
        try {
          var o = JSON.parse(ser);
          var g = document.getElementById("dm-step-group");
          var s = document.getElementById("dm-step-name");
          var v = document.getElementById("dm-step-subst-vars");
          if (g && o.g) {
            ensureDmStepGroupSelectByName(g, o.g);
            refreshDmStepNameOptionsOnly().then(function () {
              if (s && o.s) ensureSelectHasValue(s, o.s);
            });
          } else {
            if (g) g.value = "";
            if (s) s.value = "";
            if (g && !o.g) refreshDmStepNameOptionsOnly();
          }
          if (v) v.value = histSubstValue(o, false);
          g?.focus();
        } catch (_) {
          /* ignore */
        }
      }
    );
    renderHistoryStrip(
      TASK_KIND_ADAPTER,
      "adapter-history-list",
      "Select an application to see recent adapters.",
      "None yet — successful runs are saved here.",
      function (ser) {
        try {
          var o = JSON.parse(ser);
          var a = document.getElementById("dp-adapter-name");
          var r = document.getElementById("dp-adapter-result-table");
          var v = document.getElementById("dp-adapter-subst-vars");
          if (a && o.a) ensureSelectHasValue(a, o.a);
          else if (a) a.value = "";
          if (r) r.value = o.r || "";
          if (v) v.value = histSubstValue(o, false);
          a?.focus();
        } catch (_) {
          /* ignore */
        }
      }
    );
    renderHistoryStrip(
      TASK_KIND_CUBE,
      "cube-history-list",
      "Select an application to see recent cube views.",
      "None yet — successful runs are saved here.",
      function (ser) {
        try {
          var o = JSON.parse(ser);
          var n = document.getElementById("dp-cube-view-name");
          var pr = document.getElementById("dp-cube-per-row");
          var r = document.getElementById("dp-cube-result-table");
          var v = document.getElementById("dp-cube-subst-vars");
          var opts = document.getElementById("dp-cube-table-options");
          if (n && o.v) ensureSelectHasValue(n, o.v);
          else if (n) n.value = "";
          if (pr) pr.checked = !!o.p;
          if (r) r.value = o.r || "";
          if (v) v.value = histSubstValue(o, true);
          if (opts) opts.value = o.o || "";
          n?.focus();
        } catch (_) {
          /* ignore */
        }
      }
    );
    renderHistoryStrip(
      TASK_KIND_METHOD,
      "method-history-list",
      "Select an application to see recent method commands.",
      "None yet — successful runs are saved here.",
      function (ser) {
        try {
          var o = JSON.parse(ser);
          var q = document.getElementById("dp-method-query");
          var t = document.getElementById("dp-method-xf-type");
          var r = document.getElementById("dp-method-result-table");
          var sv = document.getElementById("dp-method-subst-vars");
          if (t) t.value = o.t || "";
          if (q) q.value = o.q || "";
          if (r) r.value = o.r || "";
          if (sv) sv.value = histSubstValue(o, false);
          updateMethodQuerySnippetUi();
          t?.focus();
        } catch (_) {
          /* ignore */
        }
      }
    );
  }

  function updateSqlDbLocationUi() {
    var loc = document.getElementById("sql-db-location");
    var wrap = document.getElementById("sql-external-wrap");
    var ext = document.getElementById("sql-external-conn");
    if (!loc || !wrap) return;
    var isExt = loc.value === "External";
    wrap.hidden = !isExt;
    if (ext) {
      ext.required = isExt;
      if (!isExt) ext.value = "";
    }
  }

  document.getElementById("sql-db-location")?.addEventListener("change", updateSqlDbLocationUi);

  document.getElementById("btn-run-sql")?.addEventListener("click", async function () {
    var sel = document.getElementById("app-select");
    var sqlEl = document.getElementById("sql-input");
    var shell = document.getElementById("sql-result");
    var meta = document.getElementById("sql-result-meta");
    var pre = document.getElementById("sql-result-json");
    var dbLoc = document.getElementById("sql-db-location");
    var extConn = document.getElementById("sql-external-conn");
    var resultTable = document.getElementById("sql-result-table");
    var substVars = document.getElementById("sql-subst-vars");
    if (!sel || !sqlEl || !shell || !meta || !pre || !dbLoc) return;

    if (!sel.value) {
      updateAppBanner();
      var b = document.getElementById("banner-need-app");
      if (b) {
        b.hidden = false;
      }
      sel.focus();
      return;
    }

    var pat = sessionStorage.getItem(SESSION.PAT);
    var base = sessionStorage.getItem(SESSION.BASE);
    var siJson = sessionStorage.getItem(SESSION.LOGON_SI);
    if (!pat || !base || !siJson) {
      showLogin();
      return;
    }

    var dbLocation = dbLoc.value === "External" ? "External" : "Application";
    var xfExternal = extConn ? String(extConn.value || "").trim() : "";
    if (dbLocation === "External" && !xfExternal) {
      shell.hidden = false;
      meta.textContent = "Validation";
      pre.textContent =
        "DbLocation is External: set XFExternalDBConnectionName.";
      pre.style.display = "block";
      document.getElementById("sql-result-table-wrap").hidden = true;
      extConn?.focus();
      return;
    }

    var sqlQuery = String(sqlEl.value || "").trim();
    if (!sqlQuery) {
      shell.hidden = false;
      meta.textContent = "Validation";
      pre.textContent = "Enter a SqlQuery.";
      pre.style.display = "block";
      return;
    }

    var resultDataTableName = resultTable ? String(resultTable.value || "").trim() : "";
    var customSubstVarsAsCommaSeparatedPairs = substVars
      ? String(substVars.value || "").trim()
      : "";

    shell.hidden = false;
    meta.textContent = "…";
    pre.textContent = "Running…";
    pre.style.display = "block";
    document.getElementById("sql-result-table-wrap").hidden = true;

    try {
      var r = await apiFetchJson("/api/sql", {
        pat: pat,
        baseWebServerUrl: base,
        applicationName: sel.value,
        sqlQuery: sqlQuery,
        dbLocation: dbLocation,
        resultDataTableName: resultDataTableName,
        xfExternalDbConnectionName: xfExternal,
        customSubstVarsAsCommaSeparatedPairs: customSubstVarsAsCommaSeparatedPairs,
        sqlApiVersion: "5.2.0",
      });
      displaySqlResult(r.res, r.data, r.elapsedMs);
      if (r.res.ok) {
        pushTaskHistory(TASK_KIND_SQL, sel.value, sqlQuery);
      }
    } catch (err) {
      lastSqlPayload = null;
      meta.textContent = "Error";
      pre.textContent = err instanceof Error ? err.message : String(err);
      pre.style.display = "block";
    }
  });

  document.getElementById("dm-workspace")?.addEventListener("change", function () {
    refreshDmSequenceOptionsOnly();
  });

  document.getElementById("btn-run-dm-sequence")?.addEventListener("click", async function () {
    var sel = document.getElementById("app-select");
    var shell = document.getElementById("dm-result");
    var meta = document.getElementById("dm-result-meta");
    var pre = document.getElementById("dm-result-json");
    var ws = document.getElementById("dm-workspace");
    var seq = document.getElementById("dm-sequence-name");
    var subst = document.getElementById("dm-subst-vars");
    if (!sel || !shell || !meta || !pre) return;

    if (!sel.value) {
      updateAppBanner();
      var b = document.getElementById("banner-need-app");
      if (b) b.hidden = false;
      sel.focus();
      return;
    }

    var workspaceName = getSelectedDmWorkspaceName();
    var sequenceName = seq ? String(seq.value || "").trim() : "";
    if (!sequenceName) {
      shell.hidden = false;
      meta.textContent = "Validation";
      pre.textContent = "Select a sequence from the list.";
      seq?.focus();
      return;
    }

    var pat = sessionStorage.getItem(SESSION.PAT);
    var base = sessionStorage.getItem(SESSION.BASE);
    var siJson = sessionStorage.getItem(SESSION.LOGON_SI);
    if (!pat || !base || !siJson) {
      showLogin();
      return;
    }

    shell.hidden = false;
    meta.textContent = "…";
    pre.textContent = "Running…";

    try {
      var r = await apiFetchJson("/api/execute-sequence", {
        pat: pat,
        baseWebServerUrl: base,
        applicationName: sel.value,
        workspaceName: workspaceName,
        sequenceName: sequenceName,
        customSubstVarsAsCommaSeparatedPairs: subst
          ? String(subst.value || "").trim()
          : "",
        apiVersion: "5.2.0",
      });
      displayDmResult(r.res, r.data, r.elapsedMs);
      if (r.res.ok) {
        var seqSubst = subst ? String(subst.value || "").trim() : "";
        pushTaskHistory(TASK_KIND_SEQ, sel.value, {
          w: workspaceName || "",
          s: sequenceName,
          customSubstVars: seqSubst,
        });
      }
    } catch (err) {
      meta.textContent = "Error";
      pre.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  document.getElementById("dm-step-group")?.addEventListener("change", function () {
    refreshDmStepNameOptionsOnly();
  });

  document.getElementById("btn-run-dm-step")?.addEventListener("click", async function () {
    var sel = document.getElementById("app-select");
    var shell = document.getElementById("dm-step-result");
    var meta = document.getElementById("dm-step-result-meta");
    var pre = document.getElementById("dm-step-result-json");
    var stepEl = document.getElementById("dm-step-name");
    var subst = document.getElementById("dm-step-subst-vars");
    if (!sel || !shell || !meta || !pre) return;

    if (!sel.value) {
      updateAppBanner();
      var b = document.getElementById("banner-need-app");
      if (b) b.hidden = false;
      sel.focus();
      return;
    }

    var groupName = getSelectedDmGroupName();
    var stepName = stepEl ? String(stepEl.value || "").trim() : "";
    if (!groupName) {
      shell.hidden = false;
      meta.textContent = "Validation";
      pre.textContent = "Select a data management group from the list.";
      document.getElementById("dm-step-group")?.focus();
      return;
    }
    if (!stepName) {
      shell.hidden = false;
      meta.textContent = "Validation";
      pre.textContent = "Step name is required.";
      stepEl?.focus();
      return;
    }

    var pat = sessionStorage.getItem(SESSION.PAT);
    var base = sessionStorage.getItem(SESSION.BASE);
    var siJson = sessionStorage.getItem(SESSION.LOGON_SI);
    if (!pat || !base || !siJson) {
      showLogin();
      return;
    }

    shell.hidden = false;
    meta.textContent = "…";
    pre.textContent = "Running…";

    try {
      var r = await apiFetchJson("/api/execute-step", {
        pat: pat,
        baseWebServerUrl: base,
        applicationName: sel.value,
        dataManagementGroupName: groupName,
        stepName: stepName,
        customSubstVarsAsCommaSeparatedPairs: subst
          ? String(subst.value || "").trim()
          : "",
        apiVersion: "5.2.0",
      });
      displaySimpleJsonResult(
        r.res,
        r.data,
        "dm-step-result",
        "dm-step-result-meta",
        "dm-step-result-json",
        r.elapsedMs
      );
      if (r.res.ok) {
        var stepSubst = subst ? String(subst.value || "").trim() : "";
        pushTaskHistory(TASK_KIND_STEP, sel.value, {
          g: groupName,
          s: stepName,
          customSubstVars: stepSubst,
        });
      }
    } catch (err) {
      meta.textContent = "Error";
      pre.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  document.getElementById("btn-run-adapter-dataset")?.addEventListener("click", async function () {
    var sel = document.getElementById("app-select");
    var shell = document.getElementById("adapter-result");
    var meta = document.getElementById("adapter-result-meta");
    var pre = document.getElementById("adapter-result-json");
    var wrap = document.getElementById("adapter-result-table-wrap");
    var adapterEl = document.getElementById("dp-adapter-name");
    var resultTableEl = document.getElementById("dp-adapter-result-table");
    var substEl = document.getElementById("dp-adapter-subst-vars");
    if (!sel || !shell || !meta || !pre || !wrap) return;

    if (!sel.value) {
      updateAppBanner();
      var b = document.getElementById("banner-need-app");
      if (b) b.hidden = false;
      sel.focus();
      return;
    }

    var adapterName = adapterEl ? String(adapterEl.value || "").trim() : "";
    if (!adapterName) {
      shell.hidden = false;
      meta.textContent = "Validation";
      pre.textContent = "Select an adapter from the list.";
      pre.style.display = "block";
      wrap.hidden = true;
      adapterEl?.focus();
      return;
    }

    var pat = sessionStorage.getItem(SESSION.PAT);
    var base = sessionStorage.getItem(SESSION.BASE);
    var siJson = sessionStorage.getItem(SESSION.LOGON_SI);
    if (!pat || !base || !siJson) {
      showLogin();
      return;
    }
    var logonSessionInfo;
    try {
      logonSessionInfo = JSON.parse(siJson);
    } catch (_) {
      showLogin();
      return;
    }
    if (!logonSessionInfo || !logonSessionInfo.XfBytes) {
      showLogin();
      return;
    }

    var resultDataTableName = resultTableEl ? String(resultTableEl.value || "").trim() : "";
    var customSubstVarsAsCommaSeparatedPairs = substEl
      ? String(substEl.value || "").trim()
      : "";

    shell.hidden = false;
    meta.textContent = "…";
    pre.textContent = "Running…";
    pre.style.display = "block";
    wrap.hidden = true;

    try {
      var adapterBody = {
        pat: pat,
        baseWebServerUrl: base,
        applicationName: sel.value,
        adapterName: adapterName,
        resultDataTableName: resultDataTableName,
        customSubstVarsAsCommaSeparatedPairs: customSubstVarsAsCommaSeparatedPairs,
        apiVersion: "7.2.0",
        logonSessionInfo: logonSessionInfo,
      };
      var webTokStored = sessionStorage.getItem(SESSION.WEBAPI_ACCESS_TOKEN);
      if (webTokStored && String(webTokStored).trim() !== "") {
        adapterBody.webApiAccessToken = String(webTokStored).trim();
      }
      var r = await apiFetchJson("/api/adapter-dataset", adapterBody);
      displayAdapterResult(r.res, r.data, r.elapsedMs);
      if (r.res.ok) {
        pushTaskHistory(TASK_KIND_ADAPTER, sel.value, {
          a: adapterName,
          r: resultDataTableName,
          customSubstVars: customSubstVarsAsCommaSeparatedPairs,
        });
      }
    } catch (err) {
      lastAdapterPayload = null;
      meta.textContent = "Error";
      pre.textContent = err instanceof Error ? err.message : String(err);
      pre.style.display = "block";
    }
  });

  document.getElementById("btn-run-cube-view-command")?.addEventListener("click", async function () {
    var sel = document.getElementById("app-select");
    var shell = document.getElementById("cubeview-result");
    var meta = document.getElementById("cubeview-result-meta");
    var pre = document.getElementById("cubeview-result-json");
    var wrap = document.getElementById("cubeview-result-table-wrap");
    var nameEl = document.getElementById("dp-cube-view-name");
    var perRowEl = document.getElementById("dp-cube-per-row");
    var resultTableEl = document.getElementById("dp-cube-result-table");
    var substEl = document.getElementById("dp-cube-subst-vars");
    var optsEl = document.getElementById("dp-cube-table-options");
    if (!sel || !shell || !meta || !pre || !wrap) return;

    if (!sel.value) {
      updateAppBanner();
      var b = document.getElementById("banner-need-app");
      if (b) b.hidden = false;
      sel.focus();
      return;
    }

    var cubeViewName = nameEl ? String(nameEl.value || "").trim() : "";
    if (!cubeViewName) {
      shell.hidden = false;
      meta.textContent = "Validation";
      pre.textContent = "Select a cube view from the list.";
      pre.style.display = "block";
      wrap.hidden = true;
      nameEl?.focus();
      return;
    }

    var optsStr = optsEl ? String(optsEl.value || "").trim() : "";
    var cubeViewDataTableOptions = null;
    if (optsStr) {
      try {
        var parsed = JSON.parse(optsStr);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          shell.hidden = false;
          meta.textContent = "Validation";
          pre.textContent =
            "CubeViewDataTableOptions must be a JSON object, e.g. { \"IncludeMemberDetails\": true }.";
          pre.style.display = "block";
          wrap.hidden = true;
          optsEl?.focus();
          return;
        }
        if (Object.keys(parsed).length > 0) {
          cubeViewDataTableOptions = parsed;
        }
      } catch {
        shell.hidden = false;
        meta.textContent = "Validation";
        pre.textContent = "CubeViewDataTableOptions is not valid JSON.";
        pre.style.display = "block";
        wrap.hidden = true;
        optsEl?.focus();
        return;
      }
    }

    var pat = sessionStorage.getItem(SESSION.PAT);
    var base = sessionStorage.getItem(SESSION.BASE);
    var siJson = sessionStorage.getItem(SESSION.LOGON_SI);
    if (!pat || !base || !siJson) {
      showLogin();
      return;
    }

    var dataTablePerCubeViewRow = !!(perRowEl && perRowEl.checked);
    var resultDataTableName = resultTableEl ? String(resultTableEl.value || "").trim() : "";
    var customSubstVarsAsCommaSeparatedPairs = substEl ? String(substEl.value || "").trim() : "";

    shell.hidden = false;
    meta.textContent = "…";
    pre.textContent = "Running…";
    pre.style.display = "block";
    wrap.hidden = true;

    try {
      var r = await apiFetchJson("/api/cube-view-command", {
        pat: pat,
        baseWebServerUrl: base,
        applicationName: sel.value,
        cubeViewName: cubeViewName,
        dataTablePerCubeViewRow: dataTablePerCubeViewRow,
        resultDataTableName: resultDataTableName,
        cubeViewDataTableOptions: cubeViewDataTableOptions,
        customSubstVarsAsCommaSeparatedPairs: customSubstVarsAsCommaSeparatedPairs,
        apiVersion: "5.2.0",
      });
      displayCubeViewResult(r.res, r.data, r.elapsedMs);
      if (r.res.ok) {
        pushTaskHistory(TASK_KIND_CUBE, sel.value, {
          v: cubeViewName,
          p: dataTablePerCubeViewRow,
          r: resultDataTableName,
          customSubstVars: customSubstVarsAsCommaSeparatedPairs,
          o: optsStr,
        });
      }
    } catch (err) {
      lastCubeViewPayload = null;
      meta.textContent = "Error";
      pre.textContent = err instanceof Error ? err.message : String(err);
      pre.style.display = "block";
    }
  });

  document.getElementById("btn-run-method-command")?.addEventListener("click", async function () {
    var sel = document.getElementById("app-select");
    var shell = document.getElementById("method-result");
    var meta = document.getElementById("method-result-meta");
    var pre = document.getElementById("method-result-json");
    var wrap = document.getElementById("method-result-table-wrap");
    var queryEl = document.getElementById("dp-method-query");
    var xfEl = document.getElementById("dp-method-xf-type");
    var resultTableEl = document.getElementById("dp-method-result-table");
    var substEl = document.getElementById("dp-method-subst-vars");
    if (!sel || !shell || !meta || !pre || !wrap) return;

    if (!sel.value) {
      updateAppBanner();
      var b = document.getElementById("banner-need-app");
      if (b) b.hidden = false;
      sel.focus();
      return;
    }

    var methodQuery = queryEl ? String(queryEl.value || "").trim() : "";
    var xfCommandMethodTypeId = xfEl ? String(xfEl.value || "").trim() : "";
    if (!methodQuery) {
      shell.hidden = false;
      meta.textContent = "Validation";
      pre.textContent = "Method query is required.";
      pre.style.display = "block";
      wrap.hidden = true;
      queryEl?.focus();
      return;
    }
    if (!xfCommandMethodTypeId) {
      shell.hidden = false;
      meta.textContent = "Validation";
      pre.textContent = "Select a method type.";
      pre.style.display = "block";
      wrap.hidden = true;
      xfEl?.focus();
      return;
    }

    var pat = sessionStorage.getItem(SESSION.PAT);
    var base = sessionStorage.getItem(SESSION.BASE);
    var siJson = sessionStorage.getItem(SESSION.LOGON_SI);
    if (!pat || !base || !siJson) {
      showLogin();
      return;
    }

    var resultDataTableName = resultTableEl ? String(resultTableEl.value || "").trim() : "";
    var customSubstVarsAsCommaSeparatedPairs = substEl ? String(substEl.value || "").trim() : "";

    shell.hidden = false;
    meta.textContent = "…";
    pre.textContent = "Running…";
    pre.style.display = "block";
    wrap.hidden = true;

    try {
      var r = await apiFetchJson("/api/method-command", {
        pat: pat,
        baseWebServerUrl: base,
        applicationName: sel.value,
        methodQuery: methodQuery,
        xfCommandMethodTypeId: xfCommandMethodTypeId,
        resultDataTableName: resultDataTableName,
        customSubstVarsAsCommaSeparatedPairs: customSubstVarsAsCommaSeparatedPairs,
        apiVersion: "5.2.0",
      });
      displayMethodResult(r.res, r.data, r.elapsedMs);
      if (r.res.ok) {
        pushTaskHistory(TASK_KIND_METHOD, sel.value, {
          t: xfCommandMethodTypeId,
          q: methodQuery,
          r: resultDataTableName,
          customSubstVars: customSubstVarsAsCommaSeparatedPairs,
        });
      }
    } catch (err) {
      lastMethodPayload = null;
      meta.textContent = "Error";
      pre.textContent = err instanceof Error ? err.message : String(err);
      pre.style.display = "block";
    }
  });

  document.getElementById("dp-method-xf-type")?.addEventListener("change", function () {
    updateMethodQuerySnippetUi();
  });
  document.getElementById("btn-dp-method-insert-snippet")?.addEventListener("click", function () {
    var xfEl = document.getElementById("dp-method-xf-type");
    var ta = document.getElementById("dp-method-query");
    var snippet = methodQuerySnippetForType(xfEl ? xfEl.value : "");
    if (!ta || !snippet) return;
    ta.value = snippet;
    ta.focus();
  });

  sortMethodTypeSelectByName();
  updateMethodQuerySnippetUi();

  if (hasStoredSession()) {
    try {
      var apps = JSON.parse(sessionStorage.getItem(SESSION.APPS) || "[]");
      populateAppSelect(Array.isArray(apps) ? apps : []);
    } catch {
      populateAppSelect([]);
    }
    setActiveNav("sql");
    updateSqlDbLocationUi();
    refreshAllTaskHistories();
    showWorkspace();
  } else {
    showLogin();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
