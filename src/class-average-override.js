(() => {
  const api = window.__MESH_HELPER_CLASS_DATA__;
  if (!api || typeof api.buildCurrentPeriodRows !== "function") return;
  if (api.__weightedAverageOverrideInstalled) return;

  const originalBuildCurrentPeriodRows = api.buildCurrentPeriodRows.bind(api);

  function round2(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : "";
  }

  function possibleFinal(avg) {
    const n = Number(avg);
    if (!Number.isFinite(n)) return "";
    if (n >= 4.6) return 5;
    if (n >= 3.6) return 4;
    if (n >= 2.6) return 3;
    return 2;
  }

  api.buildCurrentPeriodRows = function buildCurrentPeriodRowsWithCalculatedAverage(args = {}) {
    return originalBuildCurrentPeriodRows(args).map((row) => {
      const grades = Array.isArray(row?.grades) ? row.grades.map(Number).filter(Number.isFinite) : [];
      if (!grades.length) return row;
      const avg = round2(grades.reduce((sum, value) => sum + value, 0) / grades.length);
      const calculatedFinal = possibleFinal(avg);
      return {
        ...row,
        average: avg,
        possibleFinal: calculatedFinal,
        finalMismatch: row.currentFinal && calculatedFinal && String(row.currentFinal) !== String(calculatedFinal)
      };
    });
  };

  api.__weightedAverageOverrideInstalled = true;
})();