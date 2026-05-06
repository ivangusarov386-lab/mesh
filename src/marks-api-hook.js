// ==========================================================
//  МЭШ – Помощник учителя
//  Page hook: читает ответы marks из контекста самой страницы.
//  ВАЖНО: сам ничего не запрашивает, только слушает ответы, которые уже получает МЭШ.
// ==========================================================

(() => {
  const SOURCE = "mesh-helper-marks-hook";
  const MARKS_PART = "/api/ej/core/teacher/v1/marks?";

  if (window.__meshHelperMarksHookInstalled) return;
  window.__meshHelperMarksHookInstalled = true;

  function isMarksUrl(url) {
    return String(url || "").includes(MARKS_PART);
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

  function postMarks(url, payload) {
    try {
      saveDebugMarks(url, payload);

      window.postMessage(
        {
          source: SOURCE,
          type: "marks-response",
          url: String(url || ""),
          payload
        },
        window.location.origin
      );
    } catch (error) {
      console.warn("[МЭШ помощник][marks hook] postMessage error", error);
    }
  }

  function readJsonSafely(response, url) {
    try {
      response
        .clone()
        .json()
        .then((payload) => postMarks(url, payload))
        .catch(() => {});
    } catch (error) {}
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function meshHelperFetchHook(input, init) {
      const response = await originalFetch.apply(this, arguments);

      try {
        const url = typeof input === "string" ? input : input?.url;
        if (isMarksUrl(url)) readJsonSafely(response, url);
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
      return originalOpen.apply(this, arguments);
    };

    OriginalXHR.prototype.send = function meshHelperXhrSend() {
      this.addEventListener("load", function () {
        try {
          if (!isMarksUrl(this.__meshHelperUrl)) return;
          const text = this.responseText;
          if (!text) return;
          postMarks(this.__meshHelperUrl, JSON.parse(text));
        } catch (error) {}
      });

      return originalSend.apply(this, arguments);
    };
  }

  console.log("[МЭШ помощник][marks hook] установлен");
})();
