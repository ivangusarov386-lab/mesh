(() => {
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const LOW_CELL_CLASS = "mesh-helper-low-grades-cell";
  const WRONG_FINAL_CLASS = "mesh-helper-wrong-final-cell";
  const RED_RGB = "248, 113, 113";

  function markCellFromTd(cell) {
    return cell?.querySelector?.('[data-test-component^="markCell-"]') || null;
  }

  function closestTd(el) {
    return el?.closest?.("td, th") || null;
  }

  function markAttr(el) {
    const cell = el?.matches?.('[data-test-component^="markCell-"]') ? el : markCellFromTd(el);
    return cell?.getAttribute?.("data-test-component") || "";
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

  function removeWrongYellowFromPeriodFinals(row) {
    if (!row) return;

    [...row.querySelectorAll('[data-test-component^="markCell-"]')].forEach((markCell) => {
      const attr = markCell.getAttribute("data-test-component") || "";

      // Временно НЕ проверяем периодовые finalResult, потому что МЭШ на разных страницах
      // по-разному располагает средний балл и итог. Оставляем только точную проверку Г.
      if (!isFinalResultAttr(attr) || isYearResultAttr(attr)) return;

      const td = closestTd(markCell);
      [td, markCell].filter(Boolean).forEach((el) => {
        el.classList.remove(WRONG_FINAL_CLASS);
        el.style.removeProperty("background-color");
      });
    });
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

    removeWrongYellowFromPeriodFinals(row);

    if (!isFinalSummaryRow(row)) return;

    row.classList.remove(LOW_ROW_CLASS);
    row.style.removeProperty("box-shadow");

    [...row.querySelectorAll("td, th, div, span")].forEach(removeRedFromElement);
  }

  function cleanAll() {
    document.querySelectorAll("tr").forEach(cleanFinalSummaryRow);
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

  const observer = new MutationObserver(() => {
    requestAnimationFrame(cleanAll);
  });

  function start() {
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
