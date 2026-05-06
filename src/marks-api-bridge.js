// ==========================================================
//  МЭШ – Помощник учителя
//  Bridge: получает marks из page context.
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

  function extractMarks(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.marks)) return payload.marks;
    if (Array.isArray(payload?.response)) return payload.response;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    return [];
  }

  function buildStats(marks) {
    const stats = {};

    marks.forEach((mark) => {
      const studentId = Number(mark?.student_profile_id);
      if (!studentId) return;

      if (!stats[studentId]) {
        stats[studentId] = {
          total: 0,
          hidden: 0,
          dates: {}
        };
      }

      const value = String(mark?.name || "").trim();
      const date = String(mark?.date || "").trim();

      if (/^[1-5]$/.test(value)) {
        stats[studentId].total += 1;

        if (date) {
          stats[studentId].dates[date] = (stats[studentId].dates[date] || 0) + 1;

          if (stats[studentId].dates[date] > 1) {
            stats[studentId].hidden += 1;
          }
        }
      }
    });

    return stats;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== SOURCE) return;

    try {
      const marks = extractMarks(data.payload);
      const stats = buildStats(marks);

      window.__MESH_HELPER_MARKS__ = {
        loadedAt: Date.now(),
        count: marks.length,
        stats,
        marks
      };

      console.log("[МЭШ помощник][bridge] marks получены:", marks.length);
      console.log("[МЭШ помощник][bridge] students:", Object.keys(stats).length);
      console.log("[МЭШ помощник][bridge] sample:", marks.slice(0, 5));
    } catch (error) {
      console.warn("[МЭШ помощник][bridge] parse error", error);
    }
  });

  injectHook();
})();
