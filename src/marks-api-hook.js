(() => {
  const SOURCE = "mesh-helper-marks-hook";
  const API_PREFIX = "/api/ej/core/teacher/v1/";
  const MARKS_LIST_PART = "/api/ej/core/teacher/v1/marks?";
  const MARKS_ANY_PART = "/api/ej/core/teacher/v1/marks";
  const EXTRA_PARTS = [
    "/groups",
    "/student_profiles",
    "/average_marks_overall",
    "/average_marks_theme_overall",
    "/attestation_periods_schedules",
    "/attestation_periods_schedule",
    "/final_marks"
  ];

  if (window.__meshHelperMarksHookInstalled) return;
  window.__meshHelperMarksHookInstalled = true;

  function normalizeUrl(input) {
    try {
      if (typeof input === "string") return input;
      if (input?.url) return String(input.url);
    } catch (error) {}
    return "";
  }

  function isMarksListUrl(url) {
    return String(url || "").includes(MARKS_LIST_PART) || /(^|\/)marks\?/.test(String(url || ""));
  }

  function isAnyMarksUrl(url) {
    return String(url || "").includes(MARKS_ANY_PART) || /(^|\/)marks(\?|$)/.test(String(url || ""));
  }

  function isExtraApiUrl(url) {
    const value = String(url || "");
    const lower = value.toLowerCase();

    if (value.includes(API_PREFIX)) {
      return EXTRA_PARTS.some((part) => value.includes(API_PREFIX + part.replace(/^\//, "")) || value.includes(part));
    }

    return [
      /(^|\/)groups\?/, /(^|\/)student_profiles\?/, /(^|\/)average_marks_overall\?/, /(^|\/)average_marks_theme_overall\?/, /(^|\/)attestation_periods_schedules\?/, /(^|\/)attestation_periods_schedule\?/, /(^|\/)final_marks\?/
    ].some((pattern) => pattern.test(lower));
  }

  function isTargetUrl(url) {
    return isAnyMarksUrl(url) || isExtraApiUrl(url);
  }

  function extractMarks(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.marks)) return payload.marks;
    if (Array.isArray(payload?.response)) return payload.response;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    if (Array.isArray(payload?.payload?.items)) return payload.payload.items;
    if (Array.isArray(payload?.response?.items)) return payload.response.items;
    if (Array.isArray(payload?.result?.items)) return payload.result.items;
    return [];
  }

  function saveDebugMarks(url, payload) {
    try {
      const marks = extractMarks(payload);
      if (!marks.length) return;
      window.__MESH_HELPER_MARKS_DEBUG__ = {
        loadedAt: Date.now(),
        url: String(url || ""),
        count: marks.length,
        marks,
        byStudent(studentProfileId) {
          const id = Number(studentProfileId);
          return this.marks.filter((mark) => Number(mark?.student_profile_id) === id);
        }
      };
    } catch (error) {}
  }

  function post(type, url, payload) {
    try {
      window.postMessage({ source: SOURCE, type, url: String(url || ""), payload, at: Date.now() }, window.location.origin);
    } catch (error) {}
  }

  function postMarks(url, payload) {
    saveDebugMarks(url, payload);
    post("marks-response", url, payload);
    post("api-response", url, payload);
  }

  function postMutation(url, payload) {
    post("marks-mutated", url, payload || {});
  }

  function readJsonSafely(response, url, kind) {
    try {
      if (!response || response.status >= 400) return;
      response.clone().json().then((payload) => {
        if (kind === "marks") postMarks(url, payload);
        else if (kind === "api") post("api-response", url, payload);
        else postMutation(url, payload);
      }).catch(() => {});
    } catch (error) {}
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function meshHelperFetchHook(input, init) {
      const url = normalizeUrl(input);
      if (!isTargetUrl(url)) return originalFetch.apply(this, arguments);
      const method = String(init?.method || input?.method || "GET").toUpperCase();
      return originalFetch.apply(this, arguments).then((response) => {
        try {
          if (isMarksListUrl(url) && method === "GET") readJsonSafely(response, url, "marks");
          else if (method === "GET" && isExtraApiUrl(url)) readJsonSafely(response, url, "api");
          else if (method !== "GET" && isAnyMarksUrl(url)) readJsonSafely(response, url, "mutation");
        } catch (error) {}
        return response;
      });
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === "function") {
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;
    OriginalXHR.prototype.open = function meshHelperXhrOpen(method, url) {
      this.__meshHelperUrl = url;
      this.__meshHelperMethod = String(method || "GET").toUpperCase();
      return originalOpen.apply(this, arguments);
    };
    OriginalXHR.prototype.send = function meshHelperXhrSend() {
      if (!isTargetUrl(this.__meshHelperUrl)) return originalSend.apply(this, arguments);
      this.addEventListener("load", function () {
        try {
          const url = this.__meshHelperUrl;
          const method = this.__meshHelperMethod || "GET";
          if (!isTargetUrl(url) || this.status >= 400) return;
          const payload = this.responseText ? JSON.parse(this.responseText) : {};
          if (isMarksListUrl(url) && method === "GET") postMarks(url, payload);
          else if (method === "GET" && isExtraApiUrl(url)) post("api-response", url, payload);
          else if (method !== "GET" && isAnyMarksUrl(url)) postMutation(url, payload);
        } catch (error) {}
      });
      return originalSend.apply(this, arguments);
    };
  }
})();
