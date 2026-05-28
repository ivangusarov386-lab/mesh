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

  function stableKey(item, index, fallbackPrefix) {
    return String(
      item?.id || item?.mark_id || item?.markId ||
      item?.student_profile_id || item?.studentProfileId ||
      item?.profile_id || item?.profileId ||
      item?.student_id || item?.studentId ||
      item?.person_id || item?.personId ||
      item?.student_profile?.id || item?.studentProfile?.id ||
      item?.student?.id || item?.person?.id || item?.profile?.id ||
      `${fallbackPrefix}-${index}`
    );
  }

  function isSyntheticProfile(item) {
    return item?.source === "groups.student_ids" || /^Ученик\s+\d+$/i.test(String(item?.name || ""));
  }

  function mergeById(target, incoming, prefix = "item") {
    const map = new Map();
    (Array.isArray(target) ? target : []).forEach((item, index) => map.set(stableKey(item, index, `old-${prefix}`), item));
    (Array.isArray(incoming) ? incoming : []).forEach((item, index) => {
      const key = stableKey(item, index, `new-${prefix}-${Date.now()}`);
      const old = map.get(key);
      if (old && isSyntheticProfile(old) && !isSyntheticProfile(item)) map.set(key, item);
      else if (!old) map.set(key, item);
      else map.set(key, { ...old, ...item });
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
    return journal?.journalId || raw.id || raw.journal_id || raw.journalId || raw.education_group_id || raw.educationGroupId || null;
  }

  function getClassUnitId(journal) {
    const raw = getRawJournal(journal);
    return raw.class_unit_id || raw.classUnitId || (Array.isArray(raw.class_unit_ids) ? raw.class_unit_ids[0] : null) || null;
  }

  function getStudentIds(journal) {
    const raw = getRawJournal(journal);
    return Array.isArray(raw.student_ids) ? raw.student_ids : Array.isArray(raw.studentIds) ? raw.studentIds : [];
  }

  function query(params) {
    return Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(Array.isArray(value) ? value.join(",") : value)}`)
      .join("&");
  }

  function markCandidateParams(journal) {
    const journalId = getJournalId(journal);
    const academicYearId = getAcademicYearId(journal);
    const classUnitId = getClassUnitId(journal);
    const base = { academic_year_id: academicYearId, page: 1, per_page: 1000 };

    return [
      { ...base, group_ids: journalId },
      { ...base, group_id: journalId },
      { ...base, education_group_id: journalId },
      { ...base, journal_id: journalId },
      { ...base, subject_journal_id: journalId },
      { ...base, class_unit_id: classUnitId, group_ids: journalId },
      { ...base, class_unit_id: classUnitId, subject_journal_id: journalId }
    ].filter((params) => params.group_ids || params.group_id || params.education_group_id || params.journal_id || params.subject_journal_id);
  }

  function studentCandidateParams(journal) {
    const journalId = getJournalId(journal);
    const academicYearId = getAcademicYearId(journal);
    const classUnitId = getClassUnitId(journal);
    const studentIds = getStudentIds(journal);
    const base = { academic_year_id: academicYearId, page: 1, per_page: 1000 };

    const candidates = [
      { ...base, ids: studentIds },
      { ...base, student_profile_ids: studentIds },
      { ...base, class_unit_id: classUnitId },
      { ...base, class_unit_ids: classUnitId },
      { ...base, group_ids: journalId },
      { ...base, education_group_id: journalId },
      { ...base, subject_journal_id: journalId }
    ];

    return candidates.filter((params) => params.ids?.length || params.student_profile_ids?.length || params.class_unit_id || params.class_unit_ids || params.group_ids || params.education_group_id || params.subject_journal_id);
  }

  function syntheticStudentProfiles(journal) {
    return getStudentIds(journal).map((id) => ({
      id,
      student_profile_id: id,
      source: "groups.student_ids",
      class_unit_id: getClassUnitId(journal),
      name: `Ученик ${id}`
    }));
  }

  function candidateUrls(journal) {
    const urls = [];
    studentCandidateParams(journal).forEach((params) => urls.push({ kind: "studentProfiles", url: `${API_BASE}/student_profiles?${query(params)}` }));
    markCandidateParams(journal).forEach((params) => {
      urls.push({ kind: "marks", url: `${API_BASE}/marks?${query(params)}` });
      urls.push({ kind: "averageMarks", url: `${API_BASE}/average_marks_overall?${query(params)}` });
      urls.push({ kind: "finalMarks", url: `${API_BASE}/final_marks?${query(params)}` });
    });
    const seen = new Set();
    return urls.filter((item) => {
      const key = `${item.kind}:${item.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    store[kind] = mergeById(store[kind], list, kind);
    window.dispatchEvent(new CustomEvent("mesh-helper-api-updated", {
      detail: { kind, source: "class-auto-loader", count: Array.isArray(store[kind]) ? store[kind].length : 0, url, at: Date.now() }
    }));
  }

  function ensureSyntheticStudents(journal) {
    const list = syntheticStudentProfiles(journal);
    if (!list.length) return 0;
    storeList("studentProfiles", "groups.student_ids", { source: "groups.student_ids", items: list }, list);
    return list.length;
  }

  async function loadAllUseful(kind, urls, onProgress, journal) {
    let ok = 0;
    let failed = 0;
    let totalCount = 0;
    let firstError = null;

    for (const item of urls.filter((candidate) => candidate.kind === kind)) {
      try {
        onProgress?.({ journal, kind: item.kind, status: "loading", url: item.url });
        const { payload, list } = await fetchList(item.url);
        storeList(item.kind, item.url, payload, list);
        onProgress?.({ journal, kind: item.kind, status: "ok", count: list.length, url: item.url });
        ok += 1;
        totalCount += list.length;
        if (list.length) break;
      } catch (error) {
        failed += 1;
        firstError = firstError || String(error?.message || error);
        onProgress?.({ journal, kind: item.kind, status: "error", error: String(error?.message || error), url: item.url });
      }
    }

    return { ok: ok > 0, count: totalCount, failed, error: firstError };
  }

  async function loadJournal(journal, onProgress) {
    const result = { journalId: getJournalId(journal), ok: 0, failed: 0, loaded: {} };
    const urls = candidateUrls(journal);

    const syntheticCount = ensureSyntheticStudents(journal);
    if (syntheticCount) result.loaded.syntheticStudents = syntheticCount;

    for (const kind of ["studentProfiles", "marks", "averageMarks", "finalMarks"]) {
      const loaded = await loadAllUseful(kind, urls, onProgress, journal);
      result.loaded[kind] = loaded.count || 0;
      if (loaded.ok) result.ok += 1;
      else result.failed += 1;
    }

    return result;
  }

  async function loadJournals(journals = [], onProgress) {
    const list = (Array.isArray(journals) ? journals : []).filter((journal) => getJournalId(journal));
    const state = { total: list.length, done: 0, ok: 0, failed: 0, loaded: { studentProfiles: 0, marks: 0, averageMarks: 0, finalMarks: 0, syntheticStudents: 0 } };

    for (const journal of list) {
      const result = await loadJournal(journal, onProgress);
      state.done += 1;
      state.ok += result.ok;
      state.failed += result.failed;
      Object.keys(state.loaded).forEach((key) => { state.loaded[key] += Number(result.loaded?.[key] || 0); });
      onProgress?.({ journal, status: "journal-done", state: { ...state, loaded: { ...state.loaded } } });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return state;
  }

  window.__MESH_HELPER_CLASS_AUTO_LOADER__ = { loadJournals, loadJournal, candidateUrls, syntheticStudentProfiles };
})();
