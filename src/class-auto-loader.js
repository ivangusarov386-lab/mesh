(() => {
  if (window.__meshHelperClassAutoLoaderInstalled) return;
  window.__meshHelperClassAutoLoaderInstalled = true;

  const API_BASE = "/api/ej/core/teacher/v1";

  function deepFindArray(payload, names = []) {
    const seen = new Set();
    const queue = [payload];
    while (queue.length) {
      const item = queue.shift();
      if (!item || typeof item !== "object" || seen.has(item)) continue;
      seen.add(item);
      if (Array.isArray(item)) return item;
      for (const name of names) if (Array.isArray(item?.[name])) return item[name];
      Object.values(item).forEach((value) => { if (value && typeof value === "object") queue.push(value); });
    }
    return [];
  }

  function looksLikeProfile(value) {
    return Boolean(value && typeof value === "object" && (value.id || value.student_profile_id) && (value.short_name || value.user_name || value.last_name || value.first_name || value.person || value.class_unit || value.final_marks));
  }

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
    if (Array.isArray(payload?.response?.items)) return payload.response.items;
    if (Array.isArray(payload?.result?.items)) return payload.result.items;
    if (Array.isArray(payload?.payload?.items)) return payload.payload.items;
    const found = deepFindArray(payload, ["items", "data", "result", "payload", "response", "marks", "student_profiles", "studentProfiles"]);
    if (found.length) return found;
    if (looksLikeProfile(payload)) return [payload];
    if (looksLikeProfile(payload?.data)) return [payload.data];
    if (looksLikeProfile(payload?.response)) return [payload.response];
    if (looksLikeProfile(payload?.result)) return [payload.result];
    return [];
  }

  function apiStore() {
    if (!window.__MESH_HELPER_API__) {
      window.__MESH_HELPER_API__ = { loadedAt: null, groups: [], studentProfiles: [], averageMarks: [], finalMarks: [], periods: [], marks: [], attendances: [], raw: {}, urls: {}, debug: {} };
    }
    ["groups", "studentProfiles", "averageMarks", "finalMarks", "periods", "marks", "attendances"].forEach((key) => {
      if (!Array.isArray(window.__MESH_HELPER_API__[key])) window.__MESH_HELPER_API__[key] = [];
    });
    if (!window.__MESH_HELPER_API__.raw) window.__MESH_HELPER_API__.raw = {};
    if (!window.__MESH_HELPER_API__.urls) window.__MESH_HELPER_API__.urls = {};
    if (!window.__MESH_HELPER_API__.debug) window.__MESH_HELPER_API__.debug = {};
    return window.__MESH_HELPER_API__;
  }

  function stableKey(item, index, prefix) {
    return String(
      item?.id || item?.mark_id || item?.markId ||
      item?.student_profile_id || item?.studentProfileId ||
      item?.profile_id || item?.profileId ||
      item?.student_id || item?.studentId || item?.person_id || item?.personId ||
      item?.student_profile?.id || item?.studentProfile?.id || item?.student?.id || item?.person?.id || item?.profile?.id ||
      `${prefix}-${index}`
    );
  }

  function isSyntheticProfile(item) {
    return item?.source === "groups.student_ids" || /^Ученик\s+\d+$/i.test(String(item?.name || ""));
  }

  function mergeById(oldList, newList, kind) {
    const map = new Map();
    (Array.isArray(oldList) ? oldList : []).forEach((item, index) => map.set(stableKey(item, index, `old-${kind}`), item));
    (Array.isArray(newList) ? newList : []).forEach((item, index) => {
      const key = stableKey(item, index, `new-${kind}-${Date.now()}`);
      const old = map.get(key);
      if (old && kind === "studentProfiles" && isSyntheticProfile(old) && !isSyntheticProfile(item)) map.set(key, item);
      else if (old && typeof old === "object" && typeof item === "object") map.set(key, { ...old, ...item });
      else map.set(key, item);
    });
    return [...map.values()];
  }

  function getRawJournal(journal) { return journal?.raw || journal || {}; }
  function getAcademicYearId(journal) { const raw = getRawJournal(journal); return raw.academic_year_id || raw.academicYearId || 13; }
  function getJournalId(journal) { const raw = getRawJournal(journal); return journal?.journalId || raw.id || raw.journal_id || raw.journalId || raw.education_group_id || raw.educationGroupId || null; }
  function getClassUnitId(journal) { const raw = getRawJournal(journal); return raw.class_unit_id || raw.classUnitId || (Array.isArray(raw.class_unit_ids) ? raw.class_unit_ids[0] : null) || null; }
  function getSubjectId(journal) { const raw = getRawJournal(journal); return raw.subject_id || raw.subjectId || journal?.subjectId || null; }
  function getStudentIds(journal) { const raw = getRawJournal(journal); return Array.isArray(raw.student_ids) ? raw.student_ids : Array.isArray(raw.studentIds) ? raw.studentIds : []; }

  function unique(values) {
    return [...new Set((values || []).filter(Boolean).map(String))];
  }

  function query(params, arrayMode = "repeat") {
    return Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length))
      .flatMap(([key, value]) => {
        if (!Array.isArray(value)) return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        if (arrayMode === "comma") return `${encodeURIComponent(key)}=${encodeURIComponent(value.join(","))}`;
        return value.map((item) => `${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
      })
      .join("&");
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
    store.urls[kind] = url;
    store.debug[`auto:${kind}:${url}`] = { count: list.length, at: Date.now() };
    store[kind] = mergeById(store[kind], list, kind);
    window.dispatchEvent(new CustomEvent("mesh-helper-api-updated", { detail: { kind, source: "class-auto-loader", added: list.length, count: store[kind].length, url, at: Date.now() } }));
  }

  function syntheticStudentProfiles(journals) {
    const byId = new Map();
    (journals || []).forEach((journal) => {
      getStudentIds(journal).forEach((id) => {
        byId.set(String(id), { id, student_profile_id: id, source: "groups.student_ids", class_unit_id: getClassUnitId(journal), name: `Ученик ${id}` });
      });
    });
    return [...byId.values()];
  }

  function storeSyntheticStudents(journals) {
    const list = syntheticStudentProfiles(journals);
    if (!list.length) return 0;
    storeList("studentProfiles", "groups.student_ids", { source: "groups.student_ids", items: list }, list);
    return list.length;
  }

  async function tryUrls(kind, urls, onProgress) {
    let total = 0;
    let used = 0;
    let lastError = "";
    for (const url of urls) {
      try {
        onProgress?.({ kind, status: "loading", url });
        const { payload, list } = await fetchList(url);
        storeList(kind, url, payload, list);
        used += 1;
        total += list.length;
        onProgress?.({ kind, status: "ok", url, count: list.length });
        if (list.length) break;
      } catch (error) {
        lastError = String(error?.message || error);
        onProgress?.({ kind, status: "skip", url, error: lastError });
      }
    }
    return { ok: total > 0 || used > 0, count: total, error: lastError };
  }

  function profileUrls(journals) {
    const first = journals[0] || {};
    const academicYearId = getAcademicYearId(first);
    const classUnitIds = unique(journals.map(getClassUnitId));
    const studentIds = unique(journals.flatMap(getStudentIds));
    const base = { academic_year_id: academicYearId, page: 1, per_page: 1000 };
    const urls = [];

    classUnitIds.forEach((classUnitId) => urls.push(`${API_BASE}/student_profiles?${query({ ...base, class_unit_id: classUnitId })}`));
    if (studentIds.length) urls.push(`${API_BASE}/student_profiles?${query({ ...base, ids: studentIds }, "repeat")}`);
    if (studentIds.length) urls.push(`${API_BASE}/student_profiles?${query({ ...base, ids: studentIds }, "comma")}`);
    return unique(urls);
  }

  function journalDataUrls(journal, kind) {
    const academicYearId = getAcademicYearId(journal);
    const journalId = getJournalId(journal);
    const subjectId = getSubjectId(journal);
    const base = { academic_year_id: academicYearId, page: 1, per_page: 1000 };

    if (kind === "marks") return unique([
      `${API_BASE}/marks?${query({ ...base, group_ids: [journalId] }, "repeat")}`,
      `${API_BASE}/marks?${query({ ...base, group_ids: [journalId] }, "comma")}`
    ]);

    if (kind === "attendances") return unique([
      `${API_BASE}/attendances?${query({ ...base, group_ids: [journalId] }, "repeat")}`,
      `${API_BASE}/attendances?${query({ ...base, group_ids: [journalId] }, "comma")}`
    ]);

    if (kind === "averageMarks") return unique([
      subjectId ? `${API_BASE}/average_marks_overall?${query({ ...base, subject_ids: [subjectId] }, "repeat")}` : "",
      subjectId ? `${API_BASE}/average_marks_overall?${query({ ...base, subject_ids: [subjectId] }, "comma")}` : "",
      `${API_BASE}/average_marks_overall?${query({ ...base, group_ids: [journalId] }, "repeat")}`
    ]);

    return [];
  }

  async function loadJournals(journals = [], onProgress) {
    const list = (Array.isArray(journals) ? journals : []).filter((journal) => getJournalId(journal));
    const state = { total: list.length, done: 0, ok: 0, failed: 0, loaded: { studentProfiles: 0, marks: 0, averageMarks: 0, attendances: 0, syntheticStudents: 0 } };

    state.loaded.syntheticStudents = storeSyntheticStudents(list);

    const profiles = await tryUrls("studentProfiles", profileUrls(list), (event) => onProgress?.({ ...event, state: { ...state, loaded: { ...state.loaded } } }));
    state.loaded.studentProfiles += profiles.count;
    if (profiles.count) state.ok += 1;

    for (const journal of list) {
      let journalOk = 0;
      const marks = await tryUrls("marks", journalDataUrls(journal, "marks"), (event) => onProgress?.({ ...event, journal, state: { ...state, loaded: { ...state.loaded } } }));
      state.loaded.marks += marks.count;
      if (marks.count) journalOk += 1;

      const avg = await tryUrls("averageMarks", journalDataUrls(journal, "averageMarks"), (event) => onProgress?.({ ...event, journal, state: { ...state, loaded: { ...state.loaded } } }));
      state.loaded.averageMarks += avg.count;
      if (avg.count) journalOk += 1;

      const attendances = await tryUrls("attendances", journalDataUrls(journal, "attendances"), (event) => onProgress?.({ ...event, journal, state: { ...state, loaded: { ...state.loaded } } }));
      state.loaded.attendances += attendances.count;

      state.done += 1;
      if (journalOk) state.ok += 1;
      else state.failed += 1;
      onProgress?.({ journal, status: "journal-done", state: { ...state, loaded: { ...state.loaded } } });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return state;
  }

  async function loadJournal(journal, onProgress) {
    const result = await loadJournals([journal], onProgress);
    return { journalId: getJournalId(journal), ok: result.ok, failed: result.failed, loaded: result.loaded };
  }

  function candidateUrls(journal) {
    return [
      ...profileUrls([journal]).map((url) => ({ kind: "studentProfiles", url })),
      ...journalDataUrls(journal, "marks").map((url) => ({ kind: "marks", url })),
      ...journalDataUrls(journal, "averageMarks").map((url) => ({ kind: "averageMarks", url })),
      ...journalDataUrls(journal, "attendances").map((url) => ({ kind: "attendances", url }))
    ];
  }

  window.__MESH_HELPER_CLASS_AUTO_LOADER__ = { loadJournals, loadJournal, candidateUrls, syntheticStudentProfiles };
})();
