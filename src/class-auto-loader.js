(() => {
  if (window.__meshHelperClassAutoLoaderInstalled) return;
  window.__meshHelperClassAutoLoaderInstalled = true;

  const API_BASE = "/api/ej/core/teacher/v1";

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
    if (payload && typeof payload === "object" && (payload.id || payload.short_name || payload.user_name)) return [payload];
    if (payload?.data && typeof payload.data === "object" && (payload.data.id || payload.data.short_name || payload.data.user_name)) return [payload.data];
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

  function stableKey(item, index, kind) {
    if (kind === "marks") {
      return String([
        item?.id || item?.mark_id || item?.markId || `mark-${index}`,
        item?.group_id || item?.groupId || item?.journal_id || item?.journalId || "g",
        item?.student_profile_id || item?.studentProfileId || item?.student?.id || item?.student_profile?.id || "s"
      ].join(":"));
    }
    return String(item?.id || item?.student_profile_id || item?.studentProfileId || item?.profile_id || item?.profileId || item?.student_id || item?.studentId || item?.person_id || item?.personId || item?.student_profile?.id || item?.studentProfile?.id || item?.student?.id || item?.person?.id || item?.profile?.id || `${kind}-${index}`);
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

  function getRawJournal(journal) { return journal?.raw || journal || {}; }
  function getAcademicYearId(journal) { const raw = getRawJournal(journal); return raw.academic_year_id || raw.academicYearId || 13; }
  function getJournalId(journal) { const raw = getRawJournal(journal); return journal?.journalId || raw.id || raw.journal_id || raw.journalId || raw.education_group_id || raw.educationGroupId || null; }
  function getClassUnitId(journal) { const raw = getRawJournal(journal); return raw.class_unit_id || raw.classUnitId || (Array.isArray(raw.class_unit_ids) ? raw.class_unit_ids[0] : null) || null; }
  function getSubjectId(journal) { const raw = getRawJournal(journal); return raw.subject_id || raw.subjectId || journal?.subjectId || null; }
  function getStudentIds(journal) { const raw = getRawJournal(journal); return Array.isArray(raw.student_ids) ? raw.student_ids : Array.isArray(raw.studentIds) ? raw.studentIds : []; }
  function unique(values) { return [...new Set((values || []).filter(Boolean).map(String))]; }

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

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
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

  function storeSyntheticStudents(journals) {
    const byId = new Map();
    journals.forEach((journal) => getStudentIds(journal).forEach((id) => byId.set(String(id), { id, student_profile_id: id, source: "groups.student_ids", class_unit_id: getClassUnitId(journal), name: `Ученик ${id}` })));
    const list = [...byId.values()];
    if (list.length) storeList("studentProfiles", "groups.student_ids", { source: "groups.student_ids", items: list }, list);
    return list.length;
  }

  function isMarksUrl(urlText) {
    return /\/api\/ej\/core\/teacher\/v1\/marks\?/i.test(urlText) || /\/marks\?/i.test(urlText);
  }

  function performanceMarksUrls() {
    try {
      return performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => isMarksUrl(url) && !/average_marks/i.test(url) && !/by_marks/i.test(url))
        .filter((url) => /group_ids?=|group_id=/i.test(url))
        .sort((a, b) => {
          const ea = performance.getEntriesByName(a).at?.(-1)?.startTime || 0;
          const eb = performance.getEntriesByName(b).at?.(-1)?.startTime || 0;
          return ea - eb;
        });
    } catch (_) {
      return [];
    }
  }

  function absolutePath(urlText) {
    try {
      const url = new URL(urlText, location.origin);
      return `${url.pathname}${url.search}`;
    } catch (_) {
      return urlText;
    }
  }

  function setRepeated(searchParams, key, value) {
    if ([...searchParams.keys()].some((item) => item === key)) {
      searchParams.delete(key);
      searchParams.append(key, value);
    }
  }

  function makeUrlFromTemplate(templateUrl, journal) {
    const journalId = String(getJournalId(journal));
    const subjectId = String(getSubjectId(journal) || "");
    const academicYearId = String(getAcademicYearId(journal));
    try {
      const url = new URL(templateUrl, location.origin);
      setRepeated(url.searchParams, "group_id", journalId);
      setRepeated(url.searchParams, "group_ids", journalId);
      setRepeated(url.searchParams, "group_ids[]", journalId);
      if (subjectId) {
        setRepeated(url.searchParams, "subject_id", subjectId);
        setRepeated(url.searchParams, "subject_ids", subjectId);
        setRepeated(url.searchParams, "subject_ids[]", subjectId);
      }
      if (url.searchParams.has("academic_year_id")) url.searchParams.set("academic_year_id", academicYearId);
      return `${url.pathname}${url.search}`;
    } catch (_) {
      return null;
    }
  }

  function currentPeriodMarksTemplates() {
    const urls = unique(performanceMarksUrls()).map(absolutePath);
    if (!urls.length) return [];
    // МЭШ грузит периоды по очереди: осень → зима → весна. Последний marks-запрос — текущий период.
    return [urls[urls.length - 1], ...urls.slice().reverse().filter((url) => url !== urls[urls.length - 1])];
  }

  async function loadProfiles(journals, onProgress) {
    const first = journals[0] || {};
    const academicYearId = getAcademicYearId(first);
    const classUnitIds = unique(journals.map(getClassUnitId));
    const studentIds = unique(journals.flatMap(getStudentIds));
    const firstJournalId = getJournalId(first);
    const base = { academic_year_id: academicYearId, page: 1, per_page: 1000, with_final_marks: true, with_groups: true, with_archived_groups: false, with_transferred: false, with_deleted: false };
    const urls = [];

    classUnitIds.forEach((classUnitId) => urls.push(`${API_BASE}/student_profiles?${query({ ...base, class_unit_id: classUnitId, group_ids: firstJournalId })}`));
    if (studentIds.length) urls.push(`${API_BASE}/student_profiles?${query({ ...base, ids: studentIds }, "repeat")}`);
    if (studentIds.length) urls.push(`${API_BASE}/student_profiles?${query({ ...base, ids: studentIds }, "comma")}`);

    let total = 0;
    for (const url of unique(urls)) {
      try {
        onProgress?.({ kind: "studentProfiles", status: "loading", url });
        const payload = await fetchJson(url);
        const list = asArray(payload);
        storeList("studentProfiles", url, payload, list);
        total += list.length;
        onProgress?.({ kind: "studentProfiles", status: "ok", url, count: list.length });
        if (list.length) break;
      } catch (error) {
        onProgress?.({ kind: "studentProfiles", status: "skip", url, error: String(error?.message || error) });
      }
    }
    return total;
  }

  function fallbackMarksUrls(journal) {
    const academicYearId = getAcademicYearId(journal);
    const journalId = getJournalId(journal);
    const subjectId = getSubjectId(journal);
    return unique([
      `${API_BASE}/marks?${query({ academic_year_id: academicYearId, page: 1, per_page: 1000, group_ids: [journalId], subject_id: subjectId }, "repeat")}`,
      `${API_BASE}/marks?${query({ academic_year_id: academicYearId, page: 1, per_page: 1000, group_ids: [journalId] }, "repeat")}`
    ]);
  }

  function marksUrlsForJournal(journal) {
    const templated = currentPeriodMarksTemplates()
      .map((template) => makeUrlFromTemplate(template, journal))
      .filter(Boolean);
    return unique([...templated, ...fallbackMarksUrls(journal)]);
  }

  async function loadMarksForJournal(journal, onProgress) {
    const journalId = getJournalId(journal);
    const subjectId = getSubjectId(journal);
    const urls = marksUrlsForJournal(journal);

    for (const url of urls) {
      try {
        onProgress?.({ kind: "marks", status: "loading", journal, url });
        const payload = await fetchJson(url);
        const list = asArray(payload).map((mark) => ({
          ...mark,
          group_id: mark?.group_id || mark?.groupId || journalId,
          journal_id: mark?.journal_id || mark?.journalId || journalId,
          subject_id: mark?.subject_id || mark?.subjectId || subjectId
        }));
        storeList("marks", url, payload, list);
        onProgress?.({ kind: "marks", status: "ok", journal, url, count: list.length });
        if (list.length) return list.length;
      } catch (error) {
        onProgress?.({ kind: "marks", status: "skip", journal, url, error: String(error?.message || error) });
      }
    }
    return 0;
  }

  async function loadJournals(journals = [], onProgress) {
    const list = (Array.isArray(journals) ? journals : []).filter((journal) => getJournalId(journal));
    const state = { total: list.length, done: 0, ok: 0, failed: 0, loaded: { studentProfiles: 0, marks: 0, syntheticStudents: 0 }, templates: currentPeriodMarksTemplates().length };

    state.loaded.syntheticStudents = storeSyntheticStudents(list);
    state.loaded.studentProfiles = await loadProfiles(list, (event) => onProgress?.({ ...event, state: { ...state, loaded: { ...state.loaded } } }));

    for (const journal of list) {
      const count = await loadMarksForJournal(journal, (event) => onProgress?.({ ...event, state: { ...state, loaded: { ...state.loaded } } }));
      state.loaded.marks += count;
      state.done += 1;
      if (count) state.ok += 1;
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
    return marksUrlsForJournal(journal).map((url) => ({ kind: "marks", url }));
  }

  window.__MESH_HELPER_CLASS_AUTO_LOADER__ = { loadJournals, loadJournal, candidateUrls, currentPeriodMarksTemplates, marksUrlsForJournal };
})();