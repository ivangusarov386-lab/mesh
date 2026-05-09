// ==========================================================
//  МЭШ – Помощник учителя
//  Контроль итоговых.
//
//  Надежная версия:
//  - состояние берется из чекбокса и storage;
//  - ищем именно finalResult;
//  - проверяем текст только внутри finalResult, а не соседние ячейки;
//  - при появлении итоговой оценки подсветка снимается автоматически.
// ==========================================================

(() => {
  const FINAL_MISSING_CLASS = "mesh-helper-final-missing";
  const FINAL_MISSING_BG = "rgba(59, 130, 246, 0.30)";
  const FINAL_MISSING_OUTLINE = "inset 0 0 0 2px rgba(37, 99, 235, 0.85)";

  let storageEnabled = false;
  let timer = null;

  function text(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function isEnabled() {
    const input = document.querySelector("#mh-check-finals");
    if (input) return input.checked === true;
    return storageEnabled === true;
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

  function finalInner(row) {
    return row?.querySelector?.('[data-test-component*="finalResult"]') || null;
  }

  function finalCell(row) {
    const inner = finalInner(row);
    if (!inner) return null;
    return inner.closest("td, th") || inner;
  }

  function isStudentRow(row) {
    if (!row) return false;
    if (!row.querySelector?.('[data-test-component*="finalResult"]')) return false;
    return !!row.querySelector?.('[data-test-component^="studentCellInfoComments-"]') || !!row.querySelector?.("span[title]");
  }

  function isFinalFilled(row) {
    const inner = finalInner(row);
    if (!inner) return true;
    return /^[1-5]$/.test(text(inner)) || /\b[1-5]\b/.test(text(inner));
  }

  function setFinalHighlight(row, on) {
    const cell = finalCell(row);
    const inner = finalInner(row);
    if (!cell || !inner) return;

    [cell, inner].forEach((el) => {
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
      restoreStyle(el, "background-color", "mhPrevFinalBg");
      restoreStyle(el, "box-shadow", "mhPrevFinalShadow");
      el.classList.remove(FINAL_MISSING_CLASS);
    });
  }

  function apply() {
    const enabled = isEnabled();
    if (!enabled) {
      clearAll();
      return;
    }

    const seen = new Set();
    document.querySelectorAll('[data-test-component*="finalResult"]').forEach((inner) => {
      const row = inner.closest("tr");
      if (!isStudentRow(row) || seen.has(row)) return;
      seen.add(row);
      setFinalHighlight(row, !isFinalFilled(row));
    });
  }

  function schedule(delay = 120) {
    clearTimeout(timer);
    timer = setTimeout(apply, delay);
  }

  function syncFromStorage() {
    chrome.storage.sync.get(["checkFinals"], (data) => {
      storageEnabled = data.checkFinals === true;
      const input = document.querySelector("#mh-check-finals");
      if (input) input.checked = storageEnabled;
      schedule(30);
    });
  }

  window.addEventListener("mesh-helper-finals-toggle", (event) => {
    storageEnabled = event.detail?.enabled === true;
    schedule(20);
    setTimeout(apply, 250);
  });

  window.addEventListener("mesh-helper-marks-updated", () => schedule(80));
  window.addEventListener("mesh-helper-min-grades-changed", () => schedule(80));

  document.addEventListener("change", (event) => {
    if (event.target?.id === "mh-check-finals") {
      storageEnabled = event.target.checked === true;
      chrome.storage.sync.set({ checkFinals: storageEnabled });
      schedule(20);
    }
  }, true);

  new MutationObserver(() => schedule(180)).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  setInterval(apply, 1000);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncFromStorage, { once: true });
  } else {
    syncFromStorage();
  }

  setTimeout(syncFromStorage, 700);
  setTimeout(apply, 1800);
})();
