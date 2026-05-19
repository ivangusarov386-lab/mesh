// ==========================================================
//  МЭШ – Помощник учителя
//  Контроль наличия итоговых оценок.
//
//  Оптимизировано:
//  - синяя подсветка работает только при включенном тумблере «Контроль итоговых»;
//  - вместо синей заливки используется только рамка, чтобы hover МЭШ не стирал фон;
//  - проверяет итоговые за периоды и годовую «Г»;
//  - при включении тумблера запускается сразу;
//  - модуль не трогает желтую проверку правильности итогов.
// ==========================================================

(() => {
  const FINAL_MISSING_CLASS = "mesh-helper-final-missing";
  const WRONG_FINAL_CLASS = "mesh-helper-wrong-final-cell";
  const FINAL_MISSING_OUTLINE = "inset 0 0 0 2px rgba(37, 99, 235, 0.95)";

  let storageEnabled = false;
  let timer = null;
  let lastRunAt = 0;

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
    return [...(row?.querySelectorAll?.([
      '[data-test-component*="finalResult"]',
      '[data-test-component*="yearResult"]'
    ].join(',')) || [])];
  }

  function isStudentRow(row) {
    if (!row) return false;
    if (!finalInners(row).length) return false;
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

      if (el.classList.contains(WRONG_FINAL_CLASS)) return;
      if (el.classList.contains(FINAL_MISSING_CLASS)) return;

      rememberStyle(el, "box-shadow", "mhPrevFinalShadow");
      el.classList.add(FINAL_MISSING_CLASS);
      el.style.setProperty("box-shadow", FINAL_MISSING_OUTLINE, "important");
    });
  }

  function clearAll() {
    document.querySelectorAll(`.${FINAL_MISSING_CLASS}`).forEach(removeBlueFromElement);
  }

  function checkRow(row, active) {
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
  }

  function apply() {
    if (document.hidden) return;

    if (!isEnabled()) {
      clearAll();
      return;
    }

    lastRunAt = Date.now();
    const active = new Set();
    document.querySelectorAll("tr").forEach((row) => checkRow(row, active));

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
      schedule(50);
    });
  }

  window.addEventListener("mesh-helper-finals-toggle", (event) => {
    storageEnabled = event.detail?.enabled === true;
    if (!storageEnabled) clearAll();
    else apply();
  });

  window.addEventListener("mesh-helper-marks-updated", () => schedule(250));
  window.addEventListener("mesh-helper-min-grades-changed", () => schedule(250));
  window.addEventListener("mesh-helper-panel-ready", () => schedule(50));

  document.addEventListener("change", (event) => {
    if (event.target?.id === "mh-check-finals") {
      storageEnabled = event.target.checked === true;
      chrome.storage.sync.set({ checkFinals: storageEnabled });
      if (!storageEnabled) clearAll();
      else apply();
    }
  }, true);

  new MutationObserver(() => {
    if (isEnabled()) schedule(250);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  setInterval(() => {
    if (!isEnabled()) {
      clearAll();
      return;
    }
    if (Date.now() - lastRunAt > 8000) apply();
  }, 8000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule(100);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncFromStorage, { once: true });
  } else {
    syncFromStorage();
  }

  setTimeout(syncFromStorage, 500);
  setTimeout(apply, 900);
})();