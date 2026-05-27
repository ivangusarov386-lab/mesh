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
    if (!checkButton) return;
    checkButton.click();
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
        const sheet = subject.buildSubjectSheet({
          subjectName: sheetName,
          rows: subjectRows
        });
        if (sheet) sheets.push(sheet);
      });
    }

    if (!sheets.length) return false;

    workbook.downloadWorkbook(
      `mesh_class_workbook_${new Date().toISOString().slice(0, 10)}.xls`,
      sheets
    );

    debug.exportType = "workbook-multi-sheet-subjects-all-students";
    debug.exportedAt = Date.now();
    debug.exportedSheets = sheets.length;
    return true;
  }

  function installButtonInterceptor() {
    const button = document.getElementById("mh-class-download-btn");
    if (!button || button.dataset.workbookReady === "1") return;

    button.dataset.workbookReady = "1";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();

      if (!getRows().length) refreshExportData();
      const exported = exportSummaryWorkbook();

      if (!exported) {
        const status = document.getElementById("mh-class-export-status");
        if (status) {
          status.textContent = "Сначала дождитесь загрузки данных класса и попробуйте скачать Excel ещё раз.";
          status.dataset.tone = "warn";
        }
      }
    }, true);
  }

  window.addEventListener("mesh-helper-panel-ready", () => setTimeout(installButtonInterceptor, 100));
  window.addEventListener("mesh-helper-api-updated", () => setTimeout(installButtonInterceptor, 100));

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => setTimeout(installButtonInterceptor, 100), { once: true })
    : setTimeout(installButtonInterceptor, 100);
})();
