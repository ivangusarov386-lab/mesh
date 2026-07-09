(() => {
  if (window.__meshHelperClassAutoLoaderInstalled) return;
  window.__meshHelperClassAutoLoaderInstalled = true;

  function asArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.marks)) return payload.marks;
    if (Array.isArray(payload?.student_profiles)) return payload.student_profiles;
    if (Array.isArray(payload?.studentProfiles)) return payload.studentProfiles;
    if (Array.isArray(payload?.response)) return payload.response;
    if (Array.isArray(payload?.result)) return payload.result;
    if (Array.isArray(payload?.payload)) return payload.payload;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    if (Array.isArray(payload?.data?.marks)) return payload.data.marks;
    if (Array.isArray(payload?.data?.student_profiles)) return payload.data.student_profiles;
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
        attendances: [],
        raw: {},
        urls: {},
        debug: {}
      };
    }

    ["groups", "studentProfiles", "averageMarks", "finalMarks", "periods", "marks", "attendances"].forEach((key) => {
      if (!Array.isArray(window.__MESH_HELPER_API__[key])) window.__MESH_HELPER_API__[key] = [];
    });
    if (!window.__MESH_HELPER_API__.raw) window.__MESH_HELPER_API__.raw = {};
    if (!window.__MESH_HELPER_API__.urls) window.__MESH_HELPER_API__.urls = {};
    if (!window.__MESH_HELPER_API__.debug) window.__MESH_HELPER_API__.debug = {};
    return window.__MESH_HELPER_API__;
  }

  function stableKey(item, index, kind) {
    if (kind === "marks") {
      return String([
        item?.id || item?.mark_id || item?.markId || `mark-${index}`,
        item?.group_id || item?.groupId || item?.journal_id || item?.journalId || "g",
        item?.student_profile_id || item?.studentProfileId || item?.student?.id || item?.student_profile?.id || "s"
      ].join(":"));
    }

    return String(
      item?.id ||
      item?.student_profile_id ||
      item?.studentProfileId ||
      item?.profile_id ||
      item?.profileId ||
      item?.student_id ||
      item?.studentId ||
      item?.person_id ||
      item?.personId ||
      item?.student_profile?.id ||
      item?.studentProfile?.id ||
      item?.student?.id ||
      item?.person?.id ||
      item?.profile?.id ||
      `${kind}-${index}`
    );
  }

  function isSyntheticProfile(item) {
    return item?.source === "groups.student_ids" || /^Ученик\s+\d+$/i.test(String(item?.name || ""));
  }

  function mergeById(oldList, newList, kind) {
    const map = new Map();
    (Array.isArray(oldList) ? oldList : []).forEach((item, index) => map.set(stableKey(item, index, kind), item));
    (Array.isArray(newList) ? newList : []).forEach((item, index) => {
      const key = stableKey(item, index, kind);
      const old = map.get(key);
      if (old && kind === "studentProfiles" && isSyntheticProfile(old) && !isSyntheticProfile(item)) map.set(key, item);
      else if (old && typeof old === "object" && typeof item === "object") map.set(key, { ...old, ...item });
      else map.set(key, item);
    });
    return [...map.values()];
  }

  function getRawJournal(journal) {
    return journal?.raw || journal || {};
  }

  function getJournalId(journal) {
    const raw = getRawJournal(journal);
    return journal?.journalId || raw.id || raw.journal_id || raw.journalId || raw.education_group_id || raw.educationGroupId || null;
  }

  function getSubjectId(journal) {
    const raw = getRawJournal(journal);
    return raw.subject_id || raw.subjectId || journal?.subjectId || null;
  }

  function getClassUnitId(journal) {
    const raw = getRawJournal(journal);
    return raw.class_unit_id || raw.classUnitId || (Array.isArray(raw.class_unit_ids) ? raw.class_unit_ids[0] : null) || null;
  }

  function getStudentIds(journal) {
    const raw = getRawJournal(journal);
    return Array.isArray(raw.student_ids) ? raw.student_ids : Array.isArray(raw.studentIds) ? raw.studentIds : [];
  }

  function unique(values) {
    return [...new Set((values || []).filter((v) => v !== undefined && v !== null && v !== "").map(String))];
  }

  function storeList(kind, url, payload, list) {
    const store = apiStore();
    store.loadedAt = Date.now();
    store.raw[`auto:${kind}:${url}`] = payload;
    store.urls[kind] = url;
    store.debug[`auto:${kind}:${url}`] = { count: list.length, at: Date.now(), source: "class-auto-loader-v3-store-only" };
    store[kind] = mergeById(store[kind], list, kind);
    window.dispatchEvent(new CustomEvent("mesh-helper-api-updated", {
      detail: { kind, source: "class-auto-loader-v3-store-only", added: list.length, count: store[kind].length, url, at: Date.now() }
    }));
  }

  function storeSyntheticStudents(journals) {
    const byId = new Map();
    journals.forEach((journal) => {
      getStudentIds(journal).forEach((id) => {
        byId.set(String(id), {
          id,
          student_profile_id: id,
          source: "groups.student_ids",
          class_unit_id: getClassUnitId(journal),
          name: `Ученик ${id}`
        });
      });
    });

    const list = [...byId.values()];
    if (list.length) storeList("studentProfiles", "groups.student_ids", { source: "groups.student_ids", items: list }, list);
    return list.length;
  }

  function normalizeJournalId(value) {
    return String(value || "").trim();
  }

  function markJournalId(mark) {
    return normalizeJournalId(mark?.group_id || mark?.groupId || mark?.journal_id || mark?.journalId || mark?.education_group_id || mark?.educationGroupId);
  }

  function countCapturedMarksForJournal(journal) {
    const journalId = normalizeJournalId(getJournalId(journal));
    if (!journalId) return 0;
    return asArray(apiStore().marks).filter((mark) => markJournalId(mark) === journalId).length;
  }

  function currentPeriodMarksTemplates() {
    // v3: больше не строим прямые API-запросы. МЭШ должен сам загрузить marks, а hook их сохранит.
    return [];
  }

  function marksUrlsForJournal() {
    // Оставлено для совместимости со старым кодом панели.
    return [];
  }

  function candidateUrls() {
    // v3: прямых URL-кандидатов больше нет, чтобы не получать 403 от МЭШ.
    return [];
  }

  async function loadJournals(journals = [], onProgress) {
    const list = (Array.isArray(journals) ? journals : []).filter((journal) => getJournalId(journal));
    const store = apiStore();
    const state = {
      total: list.length,
      done: 0,
      ok: 0,
      failed: 0,
      loaded: {
        studentProfiles: asArray(store.studentProfiles).length,
        marks: asArray(store.marks).length,
        syntheticStudents: 0
      },
      templates: 0,
      mode: "store-only"
    };

    state.loaded.syntheticStudents = storeSyntheticStudents(list);
    state.loaded.studentProfiles = asArray(apiStore().studentProfiles).length;

    for (const journal of list) {
      const count = countCapturedMarksForJournal(journal);
      state.loaded.marks = asArray(apiStore().marks).length;
      state.done += 1;
      if (count) state.ok += 1;
      else state.failed += 1;

      onProgress?.({
        journal,
        status: count ? "journal-has-captured-marks" : "journal-no-captured-marks",
        count,
        state: { ...state, loaded: { ...state.loaded } }
      });

      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    return state;
  }

  async function loadJournal(journal, onProgress) {
    const result = await loadJournals([journal], onProgress);
    return { journalId: getJournalId(journal), ok: result.ok, failed: result.failed, loaded: result.loaded, mode: result.mode };
  }

  function debugState() {
    const store = apiStore();
    return {
      mode: "store-only",
      groups: asArray(store.groups).length,
      studentProfiles: asArray(store.studentProfiles).length,
      marks: asArray(store.marks).length,
      periods: asArray(store.periods).length,
      averageMarks: asArray(store.averageMarks).length,
      finalMarks: asArray(store.finalMarks).length
    };
  }

  window.__MESH_HELPER_CLASS_AUTO_LOADER__ = {
    loadJournals,
    loadJournal,
    candidateUrls,
    currentPeriodMarksTemplates,
    marksUrlsForJournal,
    debugState
  };

  console.log("[МЭШ helper][class-auto-loader-v3] store-only mode enabled", debugState());
})();
