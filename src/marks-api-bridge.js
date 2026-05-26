// ==========================================================
//  МЭШ – Помощник учителя
//  Bridge: получает актуальные ответы API из page context.
//
//  ВАЖНО:
//  - обрабатываем реальные ответы списка marks;
//  - api-response складываем отдельно для отчета классного руководителя;
//  - events marks-mutated / refresh-error НЕ затирают старые marks;
//  - текущая подсветка продолжает работать от window.__MESH_HELPER_MARKS__.
// ==========================================================

(() => {
  const SOURCE = "mesh-helper-marks-hook";

  if (window.__meshHelperBridgeInstalled) return;
  window.__meshHelperBridgeInstalled = true;

  function injectHook() {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("src/marks-api-hook.js");
      script.dataset.meshHelper = "marks-hook";
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.warn("[МЭШ помощник][bridge] inject error", error);
    }
  }

  function extractList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.marks)) return payload.marks;
    if (Array.isArray(payload?.groups)) return payload.groups;
    if (Array.isArray(payload?.response)) return payload.response;
    if (Array.isArray(payload?.payload)) return payload.payload;
    if (Array.isArray(payload?.result)) return payload.result;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    if (Array.isArray(payload?.data?.groups)) return payload.data.groups;
    if (Array.isArray(payload?.payload?.items)) return payload.payload.items;
    if (Array.isArray(payload?.payload?.groups)) return payload.payload.groups;
    if (Array.isArray(payload?.response?.items)) return payload.response.items;
    if (Array.isArray(payload?.response?.groups)) return payload.response.groups;
    if (Array.isArray(payload?.result?.items)) return payload.result.items;
    if (Array.isArray(payload?.result?.groups)) return payload.result.groups;
    return [];
  }

  function extractMarks(payload) {
    return extractList(payload);
  }

  function ensureApiStore() {
    if (!window.__MESH_HELPER_API__) {
      window.__MESH_HELPER_API__ = {
        loadedAt: null,
        groups: [],
        studentProfiles: [],
        averageMarks: [],
        finalMarks: [],
        periods: [],
        marks: [],
        raw: {},
        urls: {}
      };
    }
    if (!Array.isArray(window.__MESH_HELPER_API__.finalMarks)) {
      window.__MESH_HELPER_API__.finalMarks = [];
    }
    return window.__MESH_HELPER_API__;
  }

  function apiKindFromUrl(url) {
    const value = String(url || "").toLowerCase();
    if (value.includes("/groups")) return "groups";
    if (value.includes("/student_profiles")) return "studentProfiles";
    if (value.includes("/average_marks_overall") || value.includes("/average_marks_theme_overall")) return "averageMarks";
    if (value.includes("/final_marks")) return "finalMarks";
    if (value.includes("/attestation_periods_schedules") || value.includes("/attestation_periods_schedule")) return "periods";
    if (value.includes("/marks")) return "marks";
    return "raw";
  }

  function storeApiResponse(url, payload, meta) {
    const store = ensureApiStore();
    const kind = apiKindFromUrl(url);
    const list = extractList(payload);
    const key = `${kind}:${String(url || "")}`;

    store.loadedAt = Date.now();
    store.raw[key] = payload;
    store.urls[kind] = String(url || "");

    if (kind !== "raw") {
      store[kind] = list.length ? list : payload;
    }

    window.dispatchEvent(new CustomEvent("mesh-helper-api-updated", {
      detail: {
        kind,
        count: Array.isArray(store[kind]) ? store[kind].length : 0,
        url: String(url || ""),
        at: meta?.at || Date.now()
      }
    }));
  }

  function buildStats(marks) {
    const stats = {};

    marks.forEach((mark) => {
      const studentId = Number(mark?.student_profile_id);
      if (!studentId) return;

      if (!stats[studentId]) {
        stats[studentId] = { total: 0, hidden: 0, dates: {} };
      }

      const value = String(mark?.name || "").trim();
      const date = String(mark?.date || "").trim();

      if (/^[1-5]$/.test(value)) {
        stats[studentId].total += 1;
        if (date) {
          stats[studentId].dates[date] = (stats[studentId].dates[date] || 0) + 1;
          if (stats[studentId].dates[date] > 1) stats[studentId].hidden += 1;
        }
      }
    });

    return stats;
  }

  function publishMarks(marks, meta) {
    const stats = buildStats(marks);

    window.__MESH_HELPER_MARKS__ = {
      loadedAt: Date.now(),
      count: marks.length,
      stats,
      marks,
      meta: meta || {}
    };

    storeApiResponse(meta?.url, marks, meta);

    window.dispatchEvent(new CustomEvent("mesh-helper-marks-updated", {
      detail: { count: marks.length, students: Object.keys(stats).length }
    }));

    console.log("[МЭШ помощник][bridge] marks обновлены:", marks.length, "учеников:", Object.keys(stats).length);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== SOURCE) return;

    try {
      if (data.type === "api-response") {
        storeApiResponse(data.url, data.payload, { type: data.type, url: data.url, at: data.at });
        return;
      }

      if (data.type !== "marks-response") {
        if (data.type === "marks-mutated") {
          console.log("[МЭШ помощник][bridge] изменение marks, жду refresh");
        }
        return;
      }

      const marks = extractMarks(data.payload);
      if (!Array.isArray(marks)) return;

      publishMarks(marks, { type: data.type, url: data.url, at: data.at });
    } catch (error) {
      console.warn("[МЭШ помощник][bridge] parse error", error);
    }
  });

  ensureApiStore();
  injectHook();
})();
