(() => {
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const LOW_CELL_CLASS = "mesh-helper-low-grades-cell";
  const WRONG_FINAL_CLASS = "mesh-helper-wrong-final-cell";
  const WRONG_FINAL_BG = "rgba(250, 204, 21, 0.42)";
  const RED_RGB = "248, 113, 113";

  let storageEnabled = false;

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

  function closestTd(el) {
    return el?.closest?.("td, th") || null;
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

  function averageValueFromCell(cell) {
    const raw = text(cell || null).replace(",", ".");
    const m = raw.match(/\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
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

  function clearYellow(row) {
    (row || document).querySelectorAll?.(`.${WRONG_FINAL_CLASS}`).forEach((el) => {
      el.classList.remove(WRONG_FINAL_CLASS);
      el.style.removeProperty("background-color");
    });
  }

  function checkPeriodFinals(row) {
    const cells = allRowCells(row);

    cells.forEach((cell, index) => {
      const attr = markAttr(cell);
      if (!isFinalResultAttr(attr)) return;
      if (isYearResultAttr(attr)) return;

      const current = gradeValueFromCell(cell);
      const prev = cells[index - 1];

      // Самая безопасная связь: итоговая ячейка стоит сразу после своего «Ср.».
      // Если слева не average, не угадываем и не подсвечиваем.
      if (!prev || !isAverageCell(prev) || current === null) {
        setYellow(cell, false);
        return;
      }

      const avg = averageValueFromCell(prev);
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

    if (!yearCell || currentYear === null || finalValues.length < 3 || pa === null) {
      setYellow(yearCell, false);
      return null;
    }

    const values = [...finalValues, pa];
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const expectedYear = correctFinalFromAverage(avg);
    setYellow(yearCell, expectedYear !== null && currentYear !== expectedYear);
    return expectedYear;
  }

  function checkYearAttestation(row) {
    const yearCell = cellByComponent(row, "yearResult");
    const examCell = cellByComponent(row, "yearExam");
    const attestationCell = cellByComponent(row, "yearAttestation");

    const year = gradeValueFromCell(yearCell);
    const exam = gradeValueFromCell(examCell);
    const currentAttestation = gradeValueFromCell(attestationCell);

    if (!attestationCell || currentAttestation === null || year === null) {
      setYellow(attestationCell, false);
      return;
    }

    const expected = exam === null ? year : correctFinalFromAverage((year + exam) / 2);
    setYellow(attestationCell, expected !== null && currentAttestation !== expected);
  }

  function applyFinalChecks(row) {
    if (!row) return;

    if (!isEnabled()) {
      clearYellow(row);
      return;
    }

    if (isFinalSummaryRow(row)) {
      checkYearResult(row);
      checkYearAttestation(row);
      return;
    }

    checkPeriodFinals(row);
  }

  function removeRedFromElement(el) {
    if (!el || !el.style) return;
    if (el.classList?.contains(WRONG_FINAL_CLASS)) return;

    el.classList?.remove(LOW_CELL_CLASS);

    const bg = String(el.style.backgroundColor || "");
    if (bg.includes(RED_RGB) || bg.includes("248") || bg.includes("113")) {
      el.style.removeProperty("background-color");
    }
  }

  function cleanFinalSummaryRow(row) {
    if (!row) return;

    applyFinalChecks(row);

    if (!isFinalSummaryRow(row)) return;

    row.classList.remove(LOW_ROW_CLASS);
    row.style.removeProperty("box-shadow");

    [...row.querySelectorAll("td, th, div, span")].forEach(removeRedFromElement);
  }

  function cleanAll() {
    document.querySelectorAll("tr").forEach(cleanFinalSummaryRow);
    if (!isEnabled()) clearYellow(document);
  }

  function cleanAroundTarget(target) {
    const row = target?.closest?.("tr");
    if (!row) return;
    cleanFinalSummaryRow(row);
    setTimeout(() => cleanFinalSummaryRow(row), 0);
    setTimeout(() => cleanFinalSummaryRow(row), 40);
    setTimeout(() => cleanFinalSummaryRow(row), 140);
  }

  ["pointerover", "mouseover", "mousemove", "mouseenter", "pointermove"].forEach((eventName) => {
    document.addEventListener(eventName, (e) => cleanAroundTarget(e.target), true);
  });

  window.addEventListener("mesh-helper-finals-toggle", (event) => {
    storageEnabled = event.detail?.enabled === true;
    cleanAll();
    setTimeout(cleanAll, 100);
    setTimeout(cleanAll, 400);
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "mh-check-finals") {
      storageEnabled = event.target.checked === true;
      cleanAll();
    }
  }, true);

  const observer = new MutationObserver(() => {
    requestAnimationFrame(cleanAll);
  });

  function start() {
    try {
      chrome.storage.sync.get(["checkFinals"], (data) => {
        storageEnabled = data.checkFinals === true;
        cleanAll();
      });
    } catch (e) {}

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });

    cleanAll();
    setTimeout(cleanAll, 300);
    setTimeout(cleanAll, 1000);
    setInterval(cleanAll, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
