(() => {
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const LOW_CELL_CLASS = "mesh-helper-low-grades-cell";
  const WRONG_FINAL_CLASS = "mesh-helper-wrong-final-cell";
  const WRONG_FINAL_BG = "rgba(250, 204, 21, 0.42)";
  const RED_RGB = "248, 113, 113";

  let storageEnabled = false;
  let observer = null;
  let timer = null;
  let intervalId = null;

  function text(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function isEnabled() {
    const input = document.querySelector("#mh-check-finals");
    if (input) return input.checked === true;
    return storageEnabled === true;
  }

  function markCellFromTd(cell) {
    return cell?.querySelector?.('[data-test-component^="markCell-"]') || null;
  }

  function allRowCells(row) {
    return [...(row?.children || [])].filter((el) => ["td", "th"].includes(el.tagName?.toLowerCase()));
  }

  function markAttr(el) {
    const cell = el?.matches?.('[data-test-component^="markCell-"]') ? el : markCellFromTd(el);
    return cell?.getAttribute?.("data-test-component") || "";
  }

  function cellByComponent(row, needle) {
    return allRowCells(row).find((cell) => markAttr(cell).includes(needle)) || null;
  }

  function gradeValueFromCell(cell) {
    const raw = text(cell || null);
    const m = raw.match(/[1-5]/);
    return m ? Number(m[0]) : null;
  }

  function correctFinalFromAverage(avg) {
    const n = Number(avg);
    if (!Number.isFinite(n)) return null;
    if (n >= 4.6) return 5;
    if (n >= 3.6) return 4;
    if (n >= 2.6) return 3;
    return 2;
  }

  function isAverageCell(cell) {
    return markAttr(cell).includes("average");
  }

  function isYearResultAttr(attr) {
    return attr.includes("yearResult");
  }

  function isFinalResultAttr(attr) {
    return attr.includes("finalResult");
  }

  function isFinalSummaryAttr(attr) {
    return (
      attr.includes("intermediateAttestation") ||
      attr.includes("yearResult") ||
      attr.includes("yearExam") ||
      attr.includes("yearAttestation")
    );
  }

  function isFinalSummaryRow(row) {
    if (!row || row.tagName?.toLowerCase() !== "tr") return false;
    return [...row.querySelectorAll('[data-test-component^="markCell-"]')]
      .some((cell) => isFinalSummaryAttr(cell.getAttribute("data-test-component") || ""));
  }

  function setYellow(cell, active) {
    const markCell = markCellFromTd(cell);
    [cell, markCell].filter(Boolean).forEach((el) => {
      el.classList.toggle(WRONG_FINAL_CLASS, !!active);
      if (active) el.style.setProperty("background-color", WRONG_FINAL_BG, "important");
      else {
        el.classList.remove(WRONG_FINAL_CLASS);
        el.style.removeProperty("background-color");
      }
    });
  }

  function clearYellow(root = document) {
    root.querySelectorAll?.(`.${WRONG_FINAL_CLASS}`).forEach((el) => {
      el.classList.remove(WRONG_FINAL_CLASS);
      el.style.removeProperty("background-color");
    });
  }

  function hasStackIcon(markCell) {
    if (!markCell) return false;
    return !!markCell.querySelector("svg") || /stack|misc-stacked|filled-misc-stacked/i.test(markCell.innerHTML || "");
  }

  function gradesFromLessonCell(cell) {
    const attr = markAttr(cell);
    if (!attr || isAverageCell(cell) || isFinalResultAttr(attr) || isFinalSummaryAttr(attr)) return [];
    const markCell = markCellFromTd(cell);
    if (!markCell) return [];

    const values = [];
    const spans = [...markCell.querySelectorAll("span")].map(text).filter(Boolean);
    const source = spans.length ? spans : text(markCell).split(/\s+/).filter(Boolean);

    source.forEach((part) => {
      const clean = String(part || "").trim();
      if (/^[1-5]$/.test(clean)) values.push(Number(clean));
    });

    if (values.length === 1 && hasStackIcon(markCell)) values.push(values[0]);
    return values;
  }

  function collectGradesForPeriod(cells, finalIndex) {
    const grades = [];
    for (let i = finalIndex - 1; i >= 0; i -= 1) {
      const cell = cells[i];
      const attr = markAttr(cell);
      if (isFinalResultAttr(attr) || isFinalSummaryAttr(attr)) break;
      if (isAverageCell(cell)) continue;
      const vals = gradesFromLessonCell(cell);
      if (vals.length) grades.unshift(...vals);
    }
    return grades;
  }

  function checkPeriodFinals(row) {
    const cells = allRowCells(row);
    cells.forEach((cell, index) => {
      const attr = markAttr(cell);
      if (!isFinalResultAttr(attr) || isYearResultAttr(attr)) return;
      const current = gradeValueFromCell(cell);
      if (current === null) return setYellow(cell, false);
      const grades = collectGradesForPeriod(cells, index);
      if (!grades.length) return setYellow(cell, false);
      const avg = grades.reduce((sum, value) => sum + value, 0) / grades.length;
      const expected = correctFinalFromAverage(avg);
      setYellow(cell, expected !== null && current !== expected);
    });
  }

  function checkYearResult(row) {
    const yearCell = cellByComponent(row, "yearResult");
    const paCell = cellByComponent(row, "intermediateAttestation");
    const finalCells = allRowCells(row).filter((cell) => markAttr(cell).includes("finalResult"));
    const finalValues = finalCells.map(gradeValueFromCell).filter((v) => v !== null).slice(0, 3);
    const pa = gradeValueFromCell(paCell);
    const currentYear = gradeValueFromCell(yearCell);

    if (!yearCell || currentYear === null || finalValues.length < 3 || pa === null) return setYellow(yearCell, false);
    const values = [...finalValues, pa];
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const expectedYear = correctFinalFromAverage(avg);
    setYellow(yearCell, expectedYear !== null && currentYear !== expectedYear);
  }

  function checkYearAttestation(row) {
    const yearCell = cellByComponent(row, "yearResult");
    const examCell = cellByComponent(row, "yearExam");
    const attestationCell = cellByComponent(row, "yearAttestation");
    const year = gradeValueFromCell(yearCell);
    const exam = gradeValueFromCell(examCell);
    const currentAttestation = gradeValueFromCell(attestationCell);

    if (!attestationCell || currentAttestation === null || year === null) return setYellow(attestationCell, false);
    const expected = exam === null ? year : correctFinalFromAverage((year + exam) / 2);
    setYellow(attestationCell, expected !== null && currentAttestation !== expected);
  }

  function removeRedFromElement(el) {
    if (!el || !el.style || el.classList?.contains(WRONG_FINAL_CLASS)) return;
    el.classList?.remove(LOW_CELL_CLASS);
    const bg = String(el.style.backgroundColor || "");
    if (bg.includes(RED_RGB) || bg.includes("248") || bg.includes("113")) el.style.removeProperty("background-color");
  }

  function checkRow(row) {
    if (!row || !isEnabled()) return;
    if (isFinalSummaryRow(row)) {
      checkYearResult(row);
      checkYearAttestation(row);
      row.classList.remove(LOW_ROW_CLASS);
      row.style.removeProperty("box-shadow");
      [...row.querySelectorAll("td, th, div, span")].forEach(removeRedFromElement);
    } else {
      checkPeriodFinals(row);
    }
  }

  function cleanAll() {
    if (!isEnabled()) return clearYellow(document);
    document.querySelectorAll("tr").forEach(checkRow);
  }

  function schedule(delay = 900) {
    if (!isEnabled()) return;
    clearTimeout(timer);
    timer = setTimeout(cleanAll, delay);
  }

  function enableHeavyMode() {
    if (observer) return;
    observer = new MutationObserver(() => schedule(1200));
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    intervalId = setInterval(() => {
      if (isEnabled() && !document.hidden) cleanAll();
    }, 8000);
    schedule(200);
  }

  function disableHeavyMode() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    clearTimeout(timer);
    clearYellow(document);
  }

  function syncMode() {
    if (isEnabled()) enableHeavyMode();
    else disableHeavyMode();
  }

  document.addEventListener("pointerover", (event) => {
    if (!isEnabled()) return;
    const row = event.target?.closest?.("tr");
    if (!row) return;
    setTimeout(() => checkRow(row), 80);
  }, true);

  window.addEventListener("mesh-helper-finals-toggle", (event) => {
    storageEnabled = event.detail?.enabled === true;
    syncMode();
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "mh-check-finals") {
      storageEnabled = event.target.checked === true;
      syncMode();
    }
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule(500);
  });

  function start() {
    try {
      chrome.storage.sync.get(["checkFinals"], (data) => {
        storageEnabled = data.checkFinals === true;
        syncMode();
      });
    } catch (e) {
      syncMode();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
