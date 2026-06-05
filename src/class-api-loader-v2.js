(() => {
  if (window.__meshHelperClassApiLoaderV2Installed) return;
  window.__meshHelperClassApiLoaderV2Installed = true;

  const API_BASE = "/api/ej/core/teacher/v1";
  const DEFAULT_PER_PAGE = 300;
  const MAX_PAGES = 20;

  function toArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.groups)) return payload.groups;
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

  function unique(values) {
    return [...new Set((values || []).filter((v) => v !== undefined && v !== null && v !== "").map(String))];
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

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText}`);
      error.status = response.status;
      error.url = url;
      throw error;
    }
    return response.json();
  }

  function store() {
    if (!window.__MESH_HELPER_API_LOADER_V2__) {
      window.__MESH_HELPER_API_LOADER_V2__ = {
        loadedAt: null,
        journals: [],
        studentProfiles: [],
        marks: [],
        errors: [],
        urls: [],
        stats: {}
      };
    }
    return window.__MESH_HELPER_API_LOADER_V2__;
  }

  function getKnownGroups() {
    const api = window.__MESH_HELPER_API__ || {};
    return Array.isArray(api.groups) ? api.groups : [];
  }

  function getAcademicYearId(groups) {
    return groups.find((g) => g?.academic_year_id || g?.academicYearId)?.academic_year_id ||
      groups.find((g) => g?.academic_year_id || g?.academicYearId)?.academicYearId ||
      13;
  }

  function getGroupId(group) {
    return group?.id || group?.journal_id || group?.journalId || group?.group_id || group?.groupId || group?.education_group_id || group?.educationGroupId || null;
  }

  function getSubjectId(group) {
    return group?.subject_id || group?.subjectId || group?.subject?.id || null;
  }

  function getClassUnitId(group) {
    return group?.class_unit_id || group?.classUnitId || (Array.isArray(group?.class_unit_ids) ? group.class_unit_ids[0] : null) || null;
  }

  function getClassLevelId(group) {
    return group?.class_level_id || group?.classLevelId || group?.class_level || group?.classLevel || null;
  }

  function getStudentIds(group) {
    return Array.isArray(group?.student_ids) ? group.student_ids : Array.isArray(group?.studentIds) ? group.studentIds : [];
  }

  function getSubjectName(group) {
    return String(group?.subject_name || group?.subjectName || group?.subject?.name || group?.name || group?.title || "Без предмета").trim();
  }

  function makeJournal(group) {
    return {
      journalId: getGroupId(group),
      subjectId: getSubjectId(group),
      subject: getSubjectName(group),
      classUnitId: getClassUnitId(group),
      classLevelId: getClassLevelId(group),
      studentIds: getStudentIds(group),
      raw: group
    };
  }

  function knownJournals() {
    return getKnownGroups().map(makeJournal).filter((j) => j.journalId && j.subjectId);
  }

  function mergeByKey(oldList, newList, keyFn) {
    const map = new Map();
    (oldList || []).forEach((item, index) => map.set(keyFn(item, index), item));
    (newList || []).forEach((item, index) => map.set(keyFn(item, index), item));
    return [...map.values()];
  }

  function profileKey(profile, index) {
    return String(profile?.id || profile?.student_profile_id || profile?.studentProfileId || profile?.person_id || profile?.personId || `profile-${index}`);
  }

  function markKey(mark, index) {
    return String([mark?.id || mark?.mark_id || mark?.markId || `mark-${index}`, mark?.student_profile_id || mark?.studentProfileId || "s", mark?.group_id || mark?.groupId || mark?.journal_id || mark?.journalId || "g"].join(":"));
  }

  function remember(kind, url, items) {
    const s = store();
    s.loadedAt = Date.now();
    s.urls.push({ kind, url, count: items.length, at: Date.now() });
    if (kind === "studentProfiles") s.studentProfiles = mergeByKey(s.studentProfiles, items, profileKey);
    if (kind === "marks") s.marks = mergeByKey(s.marks, items, markKey);
    if (kind === "journals") s.journals = items;
    s.stats = {
      journals: s.journals.length,
      studentProfiles: s.studentProfiles.length,
      marks: s.marks.length,
      errors: s.errors.length
    };
    return s;
  }

  function rememberError(kind, url, error) {
    const s = store();
    s.errors.push({ kind, url, message: String(error?.message || error), status: error?.status || null, at: Date.now() });
    s.stats.errors = s.errors.length;
    return s;
  }

  async function loadStudentProfiles(journals, options = {}) {
    const allGroups = journals.map((j) => j.raw).filter(Boolean);
    const academicYearId = options.academicYearId || getAcademicYearId(allGroups);
    const studentIds = unique(journals.flatMap((j) => j.studentIds || []));
    const classUnitIds = unique(journals.map((j) => j.classUnitId));
    const urls = [];

    if (studentIds.length) {
      urls.push(`${API_BASE}/student_profiles?${query({ academic_year_id: academicYearId, ids: studentIds, with_final_marks: true, with_groups: true, with_archived_groups: false, with_transferred: false, per_page: 1000, page: 1 }, "repeat")}`);
      urls.push(`${API_BASE}/student_profiles?${query({ academic_year_id: academicYearId, ids: studentIds, with_final_marks: true, with_groups: true, with_archived_groups: false, with_transferred: false, per_page: 1000, page: 1 }, "comma")}`);
    }

    classUnitIds.forEach((classUnitId) => {
      urls.push(`${API_BASE}/student_profiles?${query({ academic_year_id: academicYearId, class_unit_id: classUnitId, with_final_marks: true, with_groups: true, with_archived_groups: false, with_transferred: false, per_page: 150, page: 1 })}`);
    });

    for (const url of unique(urls)) {
      try {
        const payload = await fetchJson(url);
        const list = toArray(payload);
        remember("studentProfiles", url, list);
        if (list.length) return list;
      } catch (error) {
        rememberError("studentProfiles", url, error);
      }
    }
    return [];
  }

  function makeMarksUrl(journal, page, options = {}) {
    const dateFrom = options.lessonDateFrom || "01.09.2025";
    const dateTo = options.lessonDateTo || "31.08.2026";
    const perPage = options.perPage || DEFAULT_PER_PAGE;
    return `${API_BASE}/marks?${query({
      group_ids: [journal.journalId],
      subject_id: journal.subjectId,
      class_level_id: journal.classLevelId,
      lesson_date_from: dateFrom,
      lesson_date_to: dateTo,
      with_non_numeric_entries: true,
      per_page: perPage,
      page
    }, "repeat")}`;
  }

  async function loadMarksForJournal(journal, options = {}) {
    const result = [];
    const maxPages = options.maxPages || MAX_PAGES;
    const perPage = options.perPage || DEFAULT_PER_PAGE;

    for (let page = 1; page <= maxPages; page += 1) {
      const url = makeMarksUrl(journal, page, { ...options, perPage });
      try {
        const payload = await fetchJson(url);
        const list = toArray(payload).map((mark) => ({
          ...mark,
          group_id: mark?.group_id || mark?.groupId || journal.journalId,
          journal_id: mark?.journal_id || mark?.journalId || journal.journalId,
          subject_id: mark?.subject_id || mark?.subjectId || journal.subjectId
        }));
        remember("marks", url, list);
        result.push(...list);
        if (!list.length || list.length < perPage) break;
      } catch (error) {
        rememberError("marks", url, error);
        break;
      }
    }
    return result;
  }

  async function loadAll(options = {}) {
    const s = store();
    s.loadedAt = Date.now();
    s.errors = [];
    s.urls = [];

    const journals = (options.journals || knownJournals()).filter((j) => j.journalId && j.subjectId);
    remember("journals", "window.__MESH_HELPER_API__.groups", journals);

    if (options.loadProfiles !== false) await loadStudentProfiles(journals, options);

    const marksByJournal = {};
    for (const journal of journals) {
      if (options.onlyJournalId && String(journal.journalId) !== String(options.onlyJournalId)) continue;
      const marks = await loadMarksForJournal(journal, options);
      marksByJournal[journal.journalId] = marks.length;
      if (typeof options.onProgress === "function") options.onProgress({ journal, marks: marks.length, store: store() });
    }

    store().stats = { ...store().stats, marksByJournal };
    console.log("[МЭШ helper][api-loader-v2] done", store().stats, store());
    return store();
  }

  window.__MESH_HELPER_CLASS_API_LOADER_V2__ = {
    knownJournals,
    loadAll,
    loadStudentProfiles,
    loadMarksForJournal,
    makeMarksUrl,
    store
  };
})();
