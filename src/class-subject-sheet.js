(() => {
  if (window.__meshHelperClassSubjectSheetInstalled) return;
  window.__meshHelperClassSubjectSheetInstalled = true;

  function percentText(value) {
    return String(value ?? 0).replace(".", ",") + "%";
  }

  function buildSubjectSheet({ subjectName = "Предмет", rows = [] } = {}) {
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
        "Г"
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
        row.yearFinal
      ], (value, cellIndex) => {
        if (cellIndex === 5 && row.absenceRisk) return "BadAbsence";
        if (cellIndex === 6 && row.finalMismatch) return "BadFinal";
        return "Default";
      }));
    });

    return wb.worksheet(subjectName, sheetRows);
  }

  window.__MESH_HELPER_CLASS_SUBJECT_SHEET__ = {
    buildSubjectSheet
  };
})();
