(() => {
  if (window.__meshHelperWorkbookExportInstalled) return;
  window.__meshHelperWorkbookExportInstalled = true;

  function exportSummaryWorkbook() {
    const debug = window.__MESH_HELPER_CLASS_EXPORT_DEBUG__ || {};
    const rows = Array.isArray(debug.rows) ? debug.rows : [];
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
      const exported = exportSummaryWorkbook();
      if (!exported) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    }, true);
  }

  window.addEventListener("mesh-helper-panel-ready", () => setTimeout(installButtonInterceptor, 100));
  window.addEventListener("mesh-helper-api-updated", () => setTimeout(installButtonInterceptor, 100));

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => setTimeout(installButtonInterceptor, 100), { once: true })
    : setTimeout(installButtonInterceptor, 100);
})();
