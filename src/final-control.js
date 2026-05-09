// ==========================================================
//  МЭШ – Помощник учителя
//  Контроль итоговых.
//
//  Отдельный модуль: подсвечивает ячейку «Итог» синим,
//  если включён тумблер «Контроль итоговых» и итоговая оценка не выставлена.
// ==========================================================

(() => {
  const FINAL_MISSING_CLASS = "mesh-helper-final-missing";
  const FINAL_MISSING_BG = "rgba(59, 130, 246, 0.26)";
  const FINAL_MISSING_OUTLINE = "inset 0 0 0 2px rgba(37, 99, 235, 0.72)";

  let enabled = false;
  let timer = null;

  function text(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function rememberStyle(el, prop, key) {
    if (!el || !el.style || el.dataset[key] !== undefined) return;
    const value = el.style.getPropertyValue(prop);
    el.dataset[key] = value || "__EMPTY__";
  }

  function restoreStyle(el, prop, key) {
    if (!el || !el.style) return;
    const previous = el.dataset[key];
    if (previous === undefined) return;

    if (previous === "__EMPTY__") el.style.removeProperty(prop);
    else el.style.setProperty(prop, previous);

    delete el.dataset[key];
  }

  function findFinalCell(row) {
    const inner = row?.querySelector?.('[data-test-component*="finalResult"]');
    if (!inner) return null;
    return inner.closest("td, th") || inner;
  }

  function isFinalFilled(row) {
    const finalCell = findFinalCell(row);
    if (!finalCell) return true;
    return /[1-5]/.test(text(finalCell));
  }

  function setFinalHighlight(row, on) {
    const finalCell = findFinalCell(row);
    if (!finalCell) return;

    const inner = finalCell.querySelector?.('[data-test-component*="finalResult"]') || finalCell;

    [finalCell, inner].filter(Boolean).forEach((el) => {
      el.classList.toggle(FINAL_MISSING_CLASS, on);

      if (on) {
        rememberStyle(el, "background-color", "mhPrevFinalBg");
        rememberStyle(el, "box-shadow", "mhPrevFinalShadow");
        el.style.setProperty("background-color", FINAL_MISSING_BG, "important");
        el.style.setProperty("box-shadow", FINAL_MISSING_OUTLINE, "important");
      } else {
        restoreStyle(el, "background-color", "mhPrevFinalBg");
        restoreStyle(el, "box-shadow", "mhPrevFinalShadow");
      }
    });
  }

  function clearAll() {
    document.querySelectorAll(`.${FINAL_MISSING_CLASS}`).forEach((el) => {
      const row = el.closest("tr");
      if (row) setFinalHighlight(row, false);
      else {
        restoreStyle(el, "background-color", "mhPrevFinalBg");
        restoreStyle(el, "box-shadow", "mhPrevFinalShadow");
        el.classList.remove(FINAL_MISSING_CLASS);
      }
    });
  }

  function apply() {
    if (!enabled) {
      clearAll();
      return;
    }

    document.querySelectorAll("tr").forEach((row) => {
      const hasStudent = !!row.querySelector("span[title]");
      const hasFinal = !!row.querySelector('[data-test-component*="finalResult"]');
      if (!hasStudent || !hasFinal) return;

      setFinalHighlight(row, !isFinalFilled(row));
    });
  }

  function schedule(delay = 150) {
    clearTimeout(timer);
    timer = setTimeout(apply, delay);
  }

  function syncFromStorage() {
    chrome.storage.sync.get(["checkFinals"], (data) => {
      enabled = data.checkFinals === true;
      const input = document.querySelector("#mh-check-finals");
      if (input) input.checked = enabled;
      schedule(50);
    });
  }

  window.addEventListener("mesh-helper-finals-toggle", (event) => {
    enabled = event.detail?.enabled === true;
    schedule(50);
  });

  new MutationObserver(() => schedule(200)).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncFromStorage, { once: true });
  } else {
    syncFromStorage();
  }

  setTimeout(syncFromStorage, 1000);
  setTimeout(apply, 2500);
})();
