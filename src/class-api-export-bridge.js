(() => {
  if (window.__meshHelperApiExportBridgeInstalled) return;
  window.__meshHelperApiExportBridgeInstalled = true;

  const STATUS_ID = "mh-class-export-status";
  const BUTTON_ID = "mh-class-download-btn";

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.response)) return value.response;
    if (Array.isArray(value?.data?.items)) return value.data.items;
    return [];
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

  function setStatus(message, tone = "muted") {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
  }

  function rawByName(name) {
    const raw = apiStore().raw || {};
    return Object.entries(raw)
      .filter(([key]) => String(key).includes(name))
      .flatMap(([, payload]) => asArray(payload));
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
    const storeJournals = asArray(loaderStore().journals).map(normalizeJournal).filter((j) => j.journalId && j.subject);
    if (storeJournals.length) return storeJournals;
    const known = loader()?.knownJournals;
    return typeof known === "function" ? known().map(normalizeJournal).filter((j) => j.journalId && j.subject) : [];
  }

  function rebuildExportDebug() {
    const data = window.__MESH_HELPER_CLASS_DATA__;
    if (!data || typeof data.buildStudentsMap !== "function" || typeof data.buildCurrentPeriodRows !== "function") return false;

    const store = loaderStore();
    const journals = getJournals();
    const studentProfiles = asArray(store.studentProfiles);
    const marks = asArray(store.marks);
    const averageMarks = getAverageMarks();
    const finalMarks = getFinalMarks();
    const period = typeof data.resolveCurrentPeriod === "function" ? data.resolveCurrentPeriod(getPeriods()) : null;

    if (!journals.length || !studentProfiles.length || !marks.length) return false;

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
      loaderV2: store,
      source: "api-loader-v2"
    };

    return true;
  }

  async function prepareWithApiV2(button) {
    const apiLoader = loader();
    if (!apiLoader || typeof apiLoader.loadAll !== "function") return false;

    button.dataset.apiV2Loading = "1";
    button.disabled = true;
    setStatus("API-загрузка МЭШ: собираю журналы, учеников и оценки…", "warn");

    try {
      await apiLoader.loadAll({
        lessonDateFrom: "01.09.2025",
        lessonDateTo: "31.08.2026",
        maxPages: 20,
        onProgress: ({ journal, store }) => {
          const stats = store?.stats || {};
          setStatus(`API-загрузка: ${journal?.subject || journal?.journalId || "журнал"}. Оценок: ${stats.marks || 0}. Ошибок: ${stats.errors || 0}.`, stats.errors ? "warn" : "muted");
        }
      });

      const ready = rebuildExportDebug();
      button.dataset.apiV2Ready = ready ? "1" : "0";
      setStatus(ready ? "API-данные готовы. Формирую Excel…" : "API-данные не собраны полностью, запускаю старый экспорт…", ready ? "ok" : "warn");
      return ready;
    } finally {
      button.disabled = false;
      button.dataset.apiV2Loading = "0";
    }
  }

  function install() {
    const button = document.getElementById(BUTTON_ID);
    if (!button || button.dataset.apiV2BridgeReady === "1") return;
    button.dataset.apiV2BridgeReady = "1";

    button.addEventListener("click", (event) => {
      if (button.dataset.apiV2Ready === "1") {
        button.dataset.apiV2Ready = "0";
        return;
      }
      if (button.dataset.apiV2Loading === "1") {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      prepareWithApiV2(button).finally(() => setTimeout(() => button.click(), 50));
    }, true);
  }

  window.addEventListener("mesh-helper-panel-ready", () => setTimeout(install, 50));
  window.addEventListener("mesh-helper-api-updated", () => setTimeout(install, 50));
  const timer = setInterval(install, 250);
  setTimeout(() => clearInterval(timer), 10000);
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", install, { once: true }) : install();
})();
