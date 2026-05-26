(() => {
  if (window.__meshHelperWorkbookExportInstalled) return;
  window.__meshHelperWorkbookExportInstalled = true;

  function getRows() {
    const debug = window.__MESH_HELPER_CLASS_EXPORT_DEBUG__ || {};
    return Array.isArray(debug.rows) ? debug.rows : [];
  }

  function refreshExportData() {
    const checkButton = document.getElementById("mh-class-export-btn");
    if (!checkButton) return;
    checkButton.click();
  }

  function exportSummaryWorkbook() {
    const debug = window.__MESH_HELPER_CLASS_EXPORT_DEBUG__ || {};
    const rows = getRows();
    const workbook = window.__MESH_HELPER_CLASS_WORKBOOK__;
    const summary = window.__MESH_HELPER_CLASS_SUMMARY_SHEET__;

    if (!workbook || !summary || !rows.length) return false;

    const sheet = summary.buildSummarySheet(rows);
    if (!sheet) return false;

    workbook.downloadWorkbook(
      `mesh_class_workbook_${new Date().toISOString().slice(0, 10)}.xls`,
      [sheet]
    );

    debug.exportType = "workbook-summary";
    debug.exportedAt = Date.now();
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
