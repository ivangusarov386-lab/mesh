// ==========================================================
//  МЭШ – Помощник учителя
//  Page hook: читает ответы marks из контекста страницы.
//
//  ВАЖНО:
//  - GET marks = источник актуального списка оценок;
//  - POST/PATCH/DELETE marks = сигнал, что список нужно обновить;
//  - после изменения оценки перезапрашиваем последний GET marks URL.
// ==========================================================

(() => {
  const SOURCE = "mesh-helper-marks-hook";
  const MARKS_LIST_PART = "/api/ej/core/teacher/v1/marks?";
  const MARKS_ANY_PART = "/api/ej/core/teacher/v1/marks";

  if (window.__meshHelperMarksHookInstalled) return;
  window.__meshHelperMarksHookInstalled = true;

  let lastMarksListUrl = "";
  let refreshTimer = null;
  let refreshing = false;

  function isMarksListUrl(url) {
    return String(url || "").includes(MARKS_LIST_PART);
  }

  function isAnyMarksUrl(url) {
    return String(url || "").includes(MARKS_ANY_PART);
  }

  function extractMarks(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.marks)) return payload.marks;
    if (Array.isArray(payload?.response)) return payload.response;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    if (Array.isArray(payload?.payload?.items)) return payload.payload.items;
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
      window.postMessage(
        {
          source: SOURCE,
          type,
          url: String(url || ""),
          payload,
          at: Date.now()
        },
        window.location.origin
      );
    } catch (error) {
      console.warn("[МЭШ помощник][marks hook] postMessage error", error);
    }
  }

  function postMarks(url, payload) {
    if (isMarksListUrl(url)) lastMarksListUrl = String(url || "");
    saveDebugMarks(url, payload);
    post("marks-response", url, payload);
  }

  function postMutation(url, payload) {
    post("marks-mutated", url, payload || {});
  }

  async function refreshLastMarksList(reason) {
    if (!lastMarksListUrl || refreshing) return;

    refreshing = true;
    try {
      const response = await window.fetch(lastMarksListUrl, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        }
      });

      const payload = await response.clone().json();
      post("marks-refresh", lastMarksListUrl, { reason });
      postMarks(lastMarksListUrl, payload);
    } catch (error) {
      post("marks-refresh-error", lastMarksListUrl, { reason, message: String(error?.message || error) });
    } finally {
      refreshing = false;
    }
  }

  function scheduleRefresh(reason, delay) {
    if (!lastMarksListUrl) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshLastMarksList(reason), delay);
  }

  function scheduleMutationRefresh(url) {
    postMutation(url, { refreshScheduled: true });
    scheduleRefresh("after-mutation-250", 250);
    setTimeout(() => refreshLastMarksList("after-mutation-900"), 900);
    setTimeout(() => refreshLastMarksList("after-mutation-1800"), 1800);
  }

  function readJsonSafely(response, url, isList) {
    try {
      response
        .clone()
        .json()
        .then((payload) => {
          if (isList) postMarks(url, payload);
          else postMutation(url, payload);
        })
        .catch(() => {
          if (!isList) postMutation(url, {});
        });
    } catch (error) {
      if (!isList) postMutation(url, {});
    }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function meshHelperFetchHook(input, init) {
      const response = await originalFetch.apply(this, arguments);

      try {
        const url = typeof input === "string" ? input : input?.url;
        const method = String(init?.method || input?.method || "GET").toUpperCase();

        if (isMarksListUrl(url) && method === "GET") {
          readJsonSafely(response, url, true);
        } else if (isAnyMarksUrl(url) && method !== "GET") {
          readJsonSafely(response, url, false);
          scheduleMutationRefresh(url);
        }
      } catch (error) {}

      return response;
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
      this.addEventListener("load", function () {
        try {
          const url = this.__meshHelperUrl;
          const method = this.__meshHelperMethod || "GET";
          if (!isAnyMarksUrl(url)) return;

          const text = this.responseText;
          const payload = text ? JSON.parse(text) : {};

          if (isMarksListUrl(url) && method === "GET") {
            postMarks(url, payload);
          } else if (method !== "GET") {
            postMutation(url, payload);
            scheduleMutationRefresh(url);
          }
        } catch (error) {
          if (isAnyMarksUrl(this.__meshHelperUrl) && this.__meshHelperMethod !== "GET") {
            postMutation(this.__meshHelperUrl, {});
            scheduleMutationRefresh(this.__meshHelperUrl);
          }
        }
      });

      return originalSend.apply(this, arguments);
    };
  }

  console.log("[МЭШ помощник][marks hook] установлен");
})();
