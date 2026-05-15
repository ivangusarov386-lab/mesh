// ==========================================================
//  МЭШ – Помощник учителя
//  Контроль наличия итоговых оценок.
//
//  Правило:
//  - синяя подсветка работает только при включенном тумблере «Контроль итоговых»;
//  - при выключении тумблера подсветка полностью очищается;
//  - стили не перезаписываются без необходимости, чтобы не было мигания;
//  - желтую проверку правильности итогов этот модуль не трогает.
// ==========================================================

(() => {
  const FINAL_MISSING_CLASS = "mesh-helper-final-missing";
  const WRONG_FINAL_CLASS = "mesh-helper-wrong-final-cell";
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

  function finalInners(row) {
    return [...(row?.querySelectorAll?.('[data-test-component*="finalResult"]') || [])];
  }

  function isStudentRow(row) {
    if (!row) return false;
    if (!row.querySelector?.('[data-test-component*="finalResult"]')) return false;
    return !!row.querySelector?.('[data-test-component^="studentCellInfoComments-"]') || !!row.querySelector?.("span[title]");
  }

  function isFinalFilled(inner) {
    if (!inner) return true;
    const value = text(inner);
    return /^[1-5]$/.test(value) || /\b[1-5]\b/.test(value);
  }

  function cellForInner(inner) {
    return inner?.closest?.("td, th") || inner || null;
  }

  function removeBlueFromElement(el) {
    if (!el || !el.style) return;
    restoreStyle(el, "background-color", "mhPrevFinalBg");
    restoreStyle(el, "box-shadow", "mhPrevFinalShadow");
    el.classList.remove(FINAL_MISSING_CLASS);
  }

  function setBlueForInner(inner, on) {
    const cell = cellForInner(inner);
    const targets = [cell, inner].filter(Boolean);

    targets.forEach((el) => {
      if (!on) {
        removeBlueFromElement(el);
        return;
      }

      // Если ячейка уже желтая из проверки правильности, синюю поверх не ставим.
      if (el.classList.contains(WRONG_FINAL_CLASS)) return;

      // Уже подсвечено — не перезаписываем стили, чтобы не было мигания.
      if (el.classList.contains(FINAL_MISSING_CLASS)) return;

      rememberStyle(el, "background-color", "mhPrevFinalBg");
      rememberStyle(el, "box-shadow", "mhPrevFinalShadow");
      el.classList.add(FINAL_MISSING_CLASS);
      el.style.setProperty("background-color", FINAL_MISSING_BG, "important");
      el.style.setProperty("box-shadow", FINAL_MISSING_OUTLINE, "important");
    });
  }

  function clearAll() {
    document.querySelectorAll(`.${FINAL_MISSING_CLASS}`).forEach(removeBlueFromElement);
  }

  function apply() {
    if (!isEnabled()) {
      clearAll();
      return;
    }

    const active = new Set();

    document.querySelectorAll("tr").forEach((row) => {
      if (!isStudentRow(row)) return;

      finalInners(row).forEach((inner) => {
        const missing = !isFinalFilled(inner);
        const cell = cellForInner(inner);

        if (missing) {
          active.add(inner);
          if (cell) active.add(cell);
        }

        setBlueForInner(inner, missing);
      });
    });

    // Убираем синюю подсветку с тех элементов, которые уже перестали быть проблемными.
    document.querySelectorAll(`.${FINAL_MISSING_CLASS}`).forEach((el) => {
      if (!active.has(el)) removeBlueFromElement(el);
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
    if (!storageEnabled) clearAll();
    schedule(30);
  });

  window.addEventListener("mesh-helper-marks-updated", () => schedule(100));
  window.addEventListener("mesh-helper-min-grades-changed", () => schedule(100));

  document.addEventListener("change", (event) => {
    if (event.target?.id === "mh-check-finals") {
      storageEnabled = event.target.checked === true;
      chrome.storage.sync.set({ checkFinals: storageEnabled });
      if (!storageEnabled) clearAll();
      schedule(30);
    }
  }, true);

  new MutationObserver(() => schedule(220)).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  setInterval(() => {
    if (isEnabled()) apply();
    else clearAll();
  }, 1800);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncFromStorage, { once: true });
  } else {
    syncFromStorage();
  }

  setTimeout(syncFromStorage, 700);
  setTimeout(apply, 1800);
})();
