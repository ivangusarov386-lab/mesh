(() => {
  if (window.__meshHelperWorkbookExportInstalled) return;
  window.__meshHelperWorkbookExportInstalled = true;

  function getDebug() {
    return window.__MESH_HELPER_CLASS_EXPORT_DEBUG__ || {};
  }

  function getRows() {
    const debug = getDebug();
    return Array.isArray(debug.rows) ? debug.rows : [];
  }

  function getJournals() {
    const debug = getDebug();
    return Array.isArray(debug.journals) ? debug.journals : [];
  }

  function setStatus(message, tone = "muted") {
    const status = document.getElementById("mh-class-export-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function setProgress(percent, label = "") {
    const list = document.getElementById("mh-class-export-list");
    if (!list) return;

    let box = document.getElementById("mh-class-download-progress");
    if (!box) {
      box = document.createElement("div");
      box.id = "mh-class-download-progress";
      box.className = "mh-class-status";
      list.insertAdjacentElement("beforebegin", box);
    }

    const safe = Math.max(0, Math.min(100, Math.round(percent)));
    box.innerHTML = `
      <div style="font-weight:800;margin-bottom:6px;">${label || "Подготовка скачивания"}</div>
      <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
        <div style="height:100%;width:${safe}%;background:#2563eb;border-radius:999px;"></div>
      </div>
      <div style="margin-top:4px;font-size:11px;color:#64748b;">${safe}%</div>`;
  }

  function clearProgress() {
    document.getElementById("mh-class-download-progress")?.remove();
  }

  function cleanSheetName(value) {
    return String(value || "Предмет")
      .replace(/[\\/:*?\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24) || "Предмет";
  }

  function uniqueSheetName(baseName, used) {
    const base = cleanSheetName(baseName);
    let name = base;
    let index = 2;

    while (used.has(name.toLowerCase())) {
      const suffix = ` ${index}`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
      index += 1;
    }

    used.add(name.toLowerCase());
    return name;
  }

  function buildRowsForJournal(journal) {
    const debug = getDebug();
    const builder = window.__MESH_HELPER_CLASS_DATA__?.buildCurrentPeriodRows;

    if (typeof builder !== "function") return getRows();

    return builder({
      students: Array.isArray(debug.students) ? debug.students : [],
      period: debug.currentPeriod || null,
      finalMarks: Array.isArray(debug.finalMarks) ? debug.finalMarks : [],
      journal
    });
  }

  function refreshExportData() {
    const checkButton = document.getElementById("mh-class-export-btn");
    if (!checkButton) return false;
    checkButton.click();
    return true;
  }

  function exportSummaryWorkbook() {
    const debug = getDebug();
    const rows = getRows();
    const journals = getJournals();
    const workbook = window.__MESH_HELPER_CLASS_WORKBOOK__;
    const summary = window.__MESH_HELPER_CLASS_SUMMARY_SHEET__;
    const subject = window.__MESH_HELPER_CLASS_SUBJECT_SHEET__;

    if (!workbook || !summary || !rows.length) return false;

    const sheets = [];
    const usedNames = new Set();
    const summarySheet = summary.buildSummarySheet(rows);
    if (summarySheet) {
      usedNames.add("свод");
      sheets.push(summarySheet);
    }

    if (subject) {
      journals.forEach((journal) => {
        const subjectRows = buildRowsForJournal(journal);
        const sheetName = uniqueSheetName(journal.subject || "Предмет", usedNames);
        const sheet = subject.buildSubjectSheet({ subjectName: sheetName, rows: subjectRows });
        if (sheet) sheets.push(sheet);
      });
    }

    if (!sheets.length) return false;

    workbook.downloadWorkbook(`mesh_class_workbook_${new Date().toISOString().slice(0, 10)}.xls`, sheets);

    debug.exportType = "workbook-multi-sheet-subjects-all-students";
    debug.exportedAt = Date.now();
    debug.exportedSheets = sheets.length;
    return true;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function prepareAndExport(button) {
    if (button.dataset.loading === "1") return;
    button.dataset.loading = "1";
    button.disabled = true;

    try {
      setStatus("Подготовка скачивания… собираю данные класса.", "muted");
      setProgress(10, "Подготовка скачивания");

      refreshExportData();
      await wait(500);
      setProgress(35, "Проверяю журналы и учеников");

      refreshExportData();
      await wait(900);
      setProgress(70, "Формирую Excel-файл");

      const rows = getRows();
      const journals = getJournals();

      if (!rows.length) {
        setProgress(100, "Данные класса не готовы");
        if (journals.length) {
          setStatus(`Журналы найдены: ${journals.length}, но ученики/оценки ещё не загружены. Откройте любой журнал класса, дождитесь загрузки учеников и нажмите «Скачать Excel» ещё раз.`, "warn");
        } else {
          setStatus("Журналы пока не найдены. Откройте страницу «Журналы класса» и нажмите «Проверить журналы» ещё раз.", "warn");
        }
        await wait(1200);
        clearProgress();
        return;
      }

      const exported = exportSummaryWorkbook();
      setProgress(100, exported ? "Файл сформирован" : "Не удалось сформировать файл");
      setStatus(exported ? "Excel-файл сформирован и скачивается." : "Не удалось сформировать Excel. Попробуйте обновить страницу МЭШ.", exported ? "ok" : "warn");
      await wait(900);
      clearProgress();
    } finally {
      button.disabled = false;
      button.dataset.loading = "0";
    }
  }

  function installButtonInterceptor() {
    const button = document.getElementById("mh-class-download-btn");
    if (!button || button.dataset.workbookReady === "1") return;

    button.dataset.workbookReady = "1";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      prepareAndExport(button);
    }, true);
  }

  window.addEventListener("mesh-helper-panel-ready", () => setTimeout(installButtonInterceptor, 100));
  window.addEventListener("mesh-helper-api-updated", () => setTimeout(installButtonInterceptor, 100));

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => setTimeout(installButtonInterceptor, 100), { once: true })
    : setTimeout(installButtonInterceptor, 100);
})();
