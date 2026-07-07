(() => {
  if (window.__meshHelperApiExportBridgeInstalled) return;
  window.__meshHelperApiExportBridgeInstalled = true;

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.response)) return value.response;
    if (Array.isArray(value?.data?.items)) return value.data.items;
    return [];
  }

  function setStatus(message, tone = "muted") {
    const el = document.getElementById("mh-class-export-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
  }

  function apiStore() {
    return window.__MESH_HELPER_API__ || {};
  }

  function loader() {
    return window.__MESH_HELPER_CLASS_API_LOADER_V2__ || null;
  }

  function loaderStore() {
    const apiLoader = loader();
    if (apiLoader && typeof apiLoader.store === "function") return apiLoader.store();
    return window.__MESH_HELPER_API_LOADER_V2__ || {};
  }

  function rawByName(name) {
    const raw = apiStore().raw || {};
    return Object.entries(raw).filter(([key]) => String(key).includes(name)).flatMap(([, payload]) => asArray(payload));
  }

  function getPeriods() {
    const direct = asArray(apiStore().periods);
    return direct.length ? direct : rawByName("attestation_periods");
  }

  function getAverageMarks() {
    const direct = asArray(apiStore().averageMarks);
    return direct.length ? direct : rawByName("average_marks");
  }

  function getFinalMarks() {
    const direct = asArray(apiStore().finalMarks);
    return direct.length ? direct : rawByName("final_marks");
  }

  function normalizeJournal(item, index = 0) {
    const raw = item?.raw || item || {};
    return {
      ...item,
      journalId: item?.journalId || raw?.journalId || raw?.journal_id || raw?.id || raw?.group_id || raw?.groupId,
      subject: item?.subject || item?.subject_name || item?.subjectName || raw?.subject_name || raw?.subjectName || raw?.subject?.name || raw?.name || raw?.title || `Предмет ${index + 1}`,
      groupName: item?.groupName || raw?.groupName || raw?.group_name || raw?.name || raw?.title || "",
      raw
    };
  }

  function getJournals() {
    const s = loaderStore();
    const storeJournals = asArray(s.journals).map(normalizeJournal).filter((j) => j.journalId && j.subject);
    if (storeJournals.length) return storeJournals;
    const known = loader()?.knownJournals;
    return typeof known === "function" ? known().map(normalizeJournal).filter((j) => j.journalId && j.subject) : [];
  }

  function rebuildExportDebug() {
    const data = window.__MESH_HELPER_CLASS_DATA__;
    const s = loaderStore();
    const journals = getJournals();
    const studentProfiles = asArray(s.studentProfiles);
    const marks = asArray(s.marks);
    const averageMarks = getAverageMarks();
    const finalMarks = getFinalMarks();

    if (!data || typeof data.buildStudentsMap !== "function" || typeof data.buildCurrentPeriodRows !== "function") {
      return { ready: false, reason: "class-data-not-ready", journals: journals.length, studentProfiles: studentProfiles.length, marks: marks.length };
    }

    const period = typeof data.resolveCurrentPeriod === "function" ? data.resolveCurrentPeriod(getPeriods()) : null;
    const students = data.buildStudentsMap({ studentProfiles, marks, averageMarks });
    const rows = data.buildCurrentPeriodRows({ students, period, finalMarks });

    window.__MESH_HELPER_CLASS_EXPORT_DEBUG__ = {
      checkedAt: Date.now(),
      teacherMode: true,
      journals,
      students,
      rows,
      currentPeriod: period,
      periods: getPeriods(),
      studentProfiles,
      marks,
      averageMarks,
      finalMarks,
      loaderV2: s,
      source: "api-loader-v2"
    };

    return { ready: Boolean(journals.length && studentProfiles.length && marks.length && rows.length), journals: journals.length, studentProfiles: studentProfiles.length, marks: marks.length, students: students.length, rows: rows.length, errors: asArray(s.errors).length };
  }

  async function loadApi(options = {}) {
    const apiLoader = loader();
    if (!apiLoader || typeof apiLoader.loadAll !== "function") {
      const result = { ready: false, reason: "api-loader-v2-not-found" };
      console.warn("[МЭШ helper][api-export-bridge]", result);
      return result;
    }

    setStatus("API-загрузка МЭШ: собираю журналы, учеников и оценки…", "warn");

    await apiLoader.loadAll({
      lessonDateFrom: options.lessonDateFrom || "01.09.2025",
      lessonDateTo: options.lessonDateTo || "31.08.2026",
      maxPages: options.maxPages || 20,
      onProgress: ({ journal, store }) => {
        const stats = store?.stats || {};
        setStatus(`API-загрузка: ${journal?.subject || journal?.journalId || "журнал"}. Оценок: ${stats.marks || 0}. Ошибок: ${stats.errors || 0}.`, stats.errors ? "warn" : "muted");
      }
    });

    const result = rebuildExportDebug();
    setStatus(result.ready ? `API-данные готовы: учеников ${result.students}, строк ${result.rows}.` : `API-данные неполные: journals ${result.journals}, profiles ${result.studentProfiles}, marks ${result.marks}, rows ${result.rows}.`, result.ready ? "ok" : "warn");
    console.log("[МЭШ helper][api-export-bridge] result", result, loaderStore(), window.__MESH_HELPER_CLASS_EXPORT_DEBUG__);
    return result;
  }

  window.__MESH_HELPER_API_EXPORT_BRIDGE__ = { loadApi, rebuildExportDebug, getJournals, loaderStore };
  console.log("[МЭШ helper][api-export-bridge] manual bridge ready. Run: await window.__MESH_HELPER_API_EXPORT_BRIDGE__.loadApi()");
})();
