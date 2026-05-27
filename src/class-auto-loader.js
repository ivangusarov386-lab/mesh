(() => {
  if (window.__meshHelperClassAutoLoaderInstalled) return;
  window.__meshHelperClassAutoLoaderInstalled = true;

  const API_BASE = "/api/ej/core/teacher/v1";

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.response)) return value.response;
    if (Array.isArray(value?.result)) return value.result;
    if (Array.isArray(value?.payload)) return value.payload;
    if (Array.isArray(value?.data?.items)) return value.data.items;
    if (Array.isArray(value?.response?.items)) return value.response.items;
    if (Array.isArray(value?.result?.items)) return value.result.items;
    if (Array.isArray(value?.payload?.items)) return value.payload.items;
    return [];
  }

  function apiStore() {
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
    return window.__MESH_HELPER_API__;
  }

  function mergeById(target, incoming) {
    const map = new Map();
    (Array.isArray(target) ? target : []).forEach((item, index) => {
      const key = item?.id || item?.mark_id || item?.student_profile_id || item?.studentProfileId || `old-${index}`;
      map.set(String(key), item);
    });
    (Array.isArray(incoming) ? incoming : []).forEach((item, index) => {
      const key = item?.id || item?.mark_id || item?.student_profile_id || item?.studentProfileId || `new-${Date.now()}-${index}`;
      map.set(String(key), item);
    });
    return [...map.values()];
  }

  function getRawJournal(journal) {
    return journal?.raw || journal || {};
  }

  function getAcademicYearId(journal) {
    const raw = getRawJournal(journal);
    return raw.academic_year_id || raw.academicYearId || 13;
  }

  function getJournalId(journal) {
    const raw = getRawJournal(journal);
    return journal?.journalId || raw.id || raw.journal_id || raw.journalId || null;
  }

  function query(params) {
    return Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
  }

  function candidateUrls(journal) {
    const groupId = getJournalId(journal);
    const academicYearId = getAcademicYearId(journal);
    const common = { academic_year_id: academicYearId, education_group_id: groupId, page: 1, per_page: 1000 };
    return [
      { kind: "studentProfiles", url: `${API_BASE}/student_profiles?${query(common)}` },
      { kind: "marks", url: `${API_BASE}/marks?${query(common)}` },
      { kind: "averageMarks", url: `${API_BASE}/average_marks_overall?${query(common)}` },
      { kind: "finalMarks", url: `${API_BASE}/final_marks?${query(common)}` }
    ];
  }

  async function fetchList(url) {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    return { payload, list: asArray(payload) };
  }

  function storeList(kind, url, payload, list) {
    const store = apiStore();
    store.loadedAt = Date.now();
    store.raw[`auto:${kind}:${url}`] = payload;
    store.urls[`auto:${kind}`] = url;
    store[kind] = mergeById(store[kind], list);
    window.dispatchEvent(new CustomEvent("mesh-helper-api-updated", {
      detail: { kind, source: "class-auto-loader", count: store[kind].length, url, at: Date.now() }
    }));
  }

  async function loadJournal(journal, onProgress) {
    const result = { journalId: getJournalId(journal), ok: 0, failed: 0 };
    for (const item of candidateUrls(journal)) {
      try {
        onProgress?.({ journal, kind: item.kind, status: "loading" });
        const { payload, list } = await fetchList(item.url);
        storeList(item.kind, item.url, payload, list);
        result.ok += 1;
        onProgress?.({ journal, kind: item.kind, status: "ok", count: list.length });
      } catch (error) {
        result.failed += 1;
        onProgress?.({ journal, kind: item.kind, status: "error", error: String(error?.message || error) });
      }
    }
    return result;
  }

  async function loadJournals(journals = [], onProgress) {
    const list = (Array.isArray(journals) ? journals : []).filter((journal) => getJournalId(journal));
    const state = { total: list.length, done: 0, ok: 0, failed: 0 };

    for (const journal of list) {
      const result = await loadJournal(journal, onProgress);
      state.done += 1;
      state.ok += result.ok;
      state.failed += result.failed;
      onProgress?.({ journal, status: "journal-done", state: { ...state } });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return state;
  }

  window.__MESH_HELPER_CLASS_AUTO_LOADER__ = { loadJournals, loadJournal, candidateUrls };
})();
