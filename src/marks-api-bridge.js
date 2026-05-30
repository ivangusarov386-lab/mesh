// ==========================================================
//  МЭШ – Помощник учителя
//  Bridge: получает актуальные ответы API из page context.
//
//  ВАЖНО:
//  - ответы API теперь НАКАПЛИВАЮТСЯ, а не затирают друг друга;
//  - это критично для выгрузки «Мой класс» по нескольким предметам;
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

  function deepFindArray(payload, names = []) {
    const seen = new Set();
    const queue = [payload];

    while (queue.length) {
      const item = queue.shift();
      if (!item || typeof item !== "object" || seen.has(item)) continue;
      seen.add(item);

      if (Array.isArray(item)) return item;

      for (const name of names) {
        if (Array.isArray(item?.[name])) return item[name];
      }

      Object.values(item).forEach((value) => {
        if (value && typeof value === "object") queue.push(value);
      });
    }

    return [];
  }

  function extractList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.marks)) return payload.marks;
    if (Array.isArray(payload?.groups)) return payload.groups;
    if (Array.isArray(payload?.student_profiles)) return payload.student_profiles;
    if (Array.isArray(payload?.studentProfiles)) return payload.studentProfiles;
    if (Array.isArray(payload?.response)) return payload.response;
    if (Array.isArray(payload?.payload)) return payload.payload;
    if (Array.isArray(payload?.result)) return payload.result;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    if (Array.isArray(payload?.data?.groups)) return payload.data.groups;
    if (Array.isArray(payload?.data?.marks)) return payload.data.marks;
    if (Array.isArray(payload?.data?.student_profiles)) return payload.data.student_profiles;
    if (Array.isArray(payload?.payload?.items)) return payload.payload.items;
    if (Array.isArray(payload?.payload?.groups)) return payload.payload.groups;
    if (Array.isArray(payload?.payload?.marks)) return payload.payload.marks;
    if (Array.isArray(payload?.response?.items)) return payload.response.items;
    if (Array.isArray(payload?.response?.groups)) return payload.response.groups;
    if (Array.isArray(payload?.response?.marks)) return payload.response.marks;
    if (Array.isArray(payload?.result?.items)) return payload.result.items;
    if (Array.isArray(payload?.result?.groups)) return payload.result.groups;
    if (Array.isArray(payload?.result?.marks)) return payload.result.marks;
    return deepFindArray(payload, ["items", "data", "result", "payload", "response", "marks", "groups", "student_profiles", "studentProfiles"]);
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
        urls: {},
        debug: {}
      };
    }
    ["groups", "studentProfiles", "averageMarks", "finalMarks", "periods", "marks"].forEach((key) => {
      if (!Array.isArray(window.__MESH_HELPER_API__[key])) window.__MESH_HELPER_API__[key] = [];
    });
    if (!window.__MESH_HELPER_API__.debug) window.__MESH_HELPER_API__.debug = {};
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

  function firstId(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  }

  function stableKey(item, index, prefix) {
    const isAverage = String(prefix || "").includes("averageMarks");
    if (isAverage) {
      return String([
        "avg",
        firstId(item?.student_profile, item?.student_profile_id, item?.studentProfileId, item?.profile_id, item?.student?.id, item?.student_profile?.id, item?.id),
        firstId(item?.subject_id, item?.subjectId, item?.subject?.id),
        firstId(item?.group_id, item?.groupId, item?.journal_id, item?.journalId, item?.education_group_id, item?.educationGroupId),
        item?.period_id || item?.periodId || item?.attestation_period_id || item?.attestationPeriodId || "period",
        index
      ].join(":"));
    }

    return String(
      item?.id || item?.mark_id || item?.markId ||
      item?.student_profile_id || item?.studentProfileId ||
      item?.profile_id || item?.profileId ||
      item?.student_id || item?.studentId ||
      item?.person_id || item?.personId ||
      item?.journal_id || item?.journalId || item?.group_id || item?.groupId || item?.education_group_id || item?.educationGroupId ||
      item?.student_profile?.id || item?.studentProfile?.id || item?.student?.id || item?.person?.id || item?.profile?.id ||
      `${prefix}-${index}`
    );
  }

  function isSyntheticProfile(item) {
    return item?.source === "groups.student_ids" || /^Ученик\s+\d+$/i.test(String(item?.name || ""));
  }

  function mergeList(oldList, newList, kind) {
    const map = new Map();
    (Array.isArray(oldList) ? oldList : []).forEach((item, index) => {
      map.set(stableKey(item, index, `old-${kind}`), item);
    });
    (Array.isArray(newList) ? newList : []).forEach((item, index) => {
      const key = stableKey(item, index, `new-${kind}`);
      const old = map.get(key);
      if (old && kind === "studentProfiles" && isSyntheticProfile(old) && !isSyntheticProfile(item)) {
        map.set(key, item);
      } else if (old && typeof old === "object" && typeof item === "object") {
        map.set(key, { ...old, ...item });
      } else {
        map.set(key, item);
      }
    });
    return [...map.values()];
  }

  function storeApiResponse(url, payload, meta) {
    const store = ensureApiStore();
    const kind = apiKindFromUrl(url);
    const list = extractList(payload);
    const key = `${kind}:${String(url || "")}`;

    store.loadedAt = Date.now();
    store.raw[key] = payload;
    store.urls[kind] = String(url || "");
    store.debug[key] = { kind, count: list.length, at: meta?.at || Date.now() };

    if (kind !== "raw" && Array.isArray(list)) {
      store[kind] = mergeList(store[kind], list, kind);
    }

    window.dispatchEvent(new CustomEvent("mesh-helper-api-updated", {
      detail: {
        kind,
        count: Array.isArray(store[kind]) ? store[kind].length : 0,
        added: list.length,
        url: String(url || ""),
        at: meta?.at || Date.now()
      }
    }));
  }

  function buildStats(marks) {
    const stats = {};

    marks.forEach((mark) => {
      const studentId = Number(mark?.student_profile_id || mark?.studentProfileId || mark?.student?.id || mark?.student_profile?.id);
      if (!studentId) return;

      if (!stats[studentId]) {
        stats[studentId] = { total: 0, hidden: 0, dates: {} };
      }

      const value = String(mark?.name || mark?.value || mark?.mark || "").trim();
      const date = String(mark?.date || mark?.lesson_date || mark?.mark_date || "").trim();

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
    storeApiResponse(meta?.url, marks, meta);
    const store = ensureApiStore();
    const allMarks = Array.isArray(store.marks) && store.marks.length ? store.marks : marks;
    const stats = buildStats(allMarks);

    window.__MESH_HELPER_MARKS__ = {
      loadedAt: Date.now(),
      count: allMarks.length,
      stats,
      marks: allMarks,
      meta: meta || {}
    };

    window.dispatchEvent(new CustomEvent("mesh-helper-marks-updated", {
      detail: { count: allMarks.length, students: Object.keys(stats).length }
    }));

    console.log("[МЭШ помощник][bridge] marks обновлены:", allMarks.length, "учеников:", Object.keys(stats).length);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;

    if (data.type === "marks-response") publishMarks(extractMarks(data.payload), { url: data.url, at: data.at });
    if (data.type === "api-response") storeApiResponse(data.url, data.payload, { url: data.url, at: data.at });
    if (data.type === "marks-mutated") {
      console.log("[МЭШ помощник][bridge] изменение marks, жду refresh", data.url);
      setTimeout(() => window.dispatchEvent(new CustomEvent("mesh-helper-marks-mutation", { detail: data })), 250);
    }
  });

  injectHook();
})();