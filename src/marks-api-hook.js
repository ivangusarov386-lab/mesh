// ==========================================================
//  МЭШ – Помощник учителя
//  Page hook: читает ответы marks из контекста страницы.
//
//  Оптимизировано:
//  - расширение больше НЕ делает самостоятельные повторные GET-запросы к МЭШ;
//  - только слушает реальные ответы, которые уже сделал сам сайт;
//  - это снижает риск 504 Gateway Time-out и тормозов интерфейса.
// ==========================================================

(() => {
  const SOURCE = "mesh-helper-marks-hook";
  const MARKS_LIST_PART = "/api/ej/core/teacher/v1/marks?";
  const MARKS_ANY_PART = "/api/ej/core/teacher/v1/marks";

  if (window.__meshHelperMarksHookInstalled) return;
  window.__meshHelperMarksHookInstalled = true;

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
    } catch (error) {}
  }

  function postMarks(url, payload) {
    saveDebugMarks(url, payload);
    post("marks-response", url, payload);
  }

  function postMutation(url, payload) {
    // Сообщаем расширению, что МЭШ изменил marks, но сами повторный GET не делаем.
    // МЭШ после сохранения обычно сам обновляет данные; мы подхватим его настоящий ответ.
    post("marks-mutated", url, payload || {});
  }

  function readJsonSafely(response, url, isList) {
    try {
      if (!response || response.status >= 400) return;

      response
        .clone()
        .json()
        .then((payload) => {
          if (isList) postMarks(url, payload);
          else postMutation(url, payload);
        })
        .catch(() => {});
    } catch (error) {}
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
          if (this.status >= 400) return;

          const body = this.responseText;
          const payload = body ? JSON.parse(body) : {};

          if (isMarksListUrl(url) && method === "GET") {
            postMarks(url, payload);
          } else if (method !== "GET") {
            postMutation(url, payload);
          }
        } catch (error) {}
      });

      return originalSend.apply(this, arguments);
    };
  }
})();
