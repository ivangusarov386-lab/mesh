(() => {
  if (window.__meshHelperClassSummarySheetInstalled) return;
  window.__meshHelperClassSummarySheetInstalled = true;

  function percentText(value) {
    return String(value ?? 0).replace(".", ",") + "%";
  }

  function riskText(row) {
    return [
      row?.absenceRisk ? "Н 50%+" : "",
      row?.finalMismatch ? "Итог не совпадает" : ""
    ].filter(Boolean).join(", ");
  }

  function buildSummarySheet(rows = []) {
    const wb = window.__MESH_HELPER_CLASS_WORKBOOK__;
    if (!wb) return null;

    const sheetRows = [
      wb.row([
        "№",
        "ФИО",
        "Оценки",
        "Средний балл",
        "Н по факту",
        "Н % по факту",
        "Итог текущего периода",
        "Расчетный итог",
        "ПА",
        "Г",
        "Риски"
      ], () => "Header")
    ];

    rows.forEach((row, index) => {
      sheetRows.push(wb.row([
        index + 1,
        row.fio,
        row.gradesText,
        row.average,
        row.absences,
        percentText(row.absencePercent),
        row.currentFinal,
        row.possibleFinal,
        row.paFinal,
        row.yearFinal,
        riskText(row)
      ], (value, cellIndex) => {
        if (cellIndex === 5 && row.absenceRisk) return "BadAbsence";
        if (cellIndex === 6 && row.finalMismatch) return "BadFinal";
        return "Default";
      }));
    });

    return wb.worksheet("СВОД", sheetRows);
  }

  window.__MESH_HELPER_CLASS_SUMMARY_SHEET__ = {
    buildSummarySheet
  };
})();
