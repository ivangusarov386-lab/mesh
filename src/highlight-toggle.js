// ==========================================================
//  МЭШ – Помощник учителя
//  Тумблер красной подсветки недобора оценок.
//
//  Работает с новой компактной панелью:
//  #mh-highlight-low — Подсветка недобора
// ==========================================================

(() => {
  const STORAGE_KEY = "highlightLowGrades";
  const TOGGLE_ID = "mh-highlight-low";
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const LOW_BG_PARTS = ["248", "113", "113"];

  let enabled = true;
  let clearTimer = null;
  let attempts = 0;

  function setGlobalFlag() {
    window.__MESH_HELPER_HIGHLIGHT_LOW_ENABLED__ = enabled;
    window.dispatchEvent(new CustomEvent("mesh-helper-highlight-toggle", { detail: { enabled } }));
  }

  function isLowBg(value) {
    const bg = String(value || "");
    return LOW_BG_PARTS.every((part) => bg.includes(part));
  }

  function clearLowHighlightsSoft() {
    document.querySelectorAll(`.${LOW_ROW_CLASS}`).forEach((row) => row.classList.remove(LOW_ROW_CLASS));

    document.querySelectorAll("[data-mh-prev-bg]").forEach((el) => {
      const previous = el.dataset.mhPrevBg;
      if (previous === "__EMPTY__") el.style.removeProperty("background-color");
      else if (previous !== undefined) el.style.setProperty("background-color", previous);
      delete el.dataset.mhPrevBg;
    });

    document.querySelectorAll("td[style], th[style], div[style]").forEach((el) => {
      const bg = el.style?.getPropertyValue("background-color");
      if (isLowBg(bg)) el.style.removeProperty("background-color");
    });
  }

  function scheduleClear(delay = 120) {
    if (enabled) return;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(clearLowHighlightsSoft, delay);
  }

  function bindToggle() {
    const input = document.getElementById(TOGGLE_ID);
    if (!input) return false;

    input.checked = enabled;
    if (input.dataset.ready === "1") return true;
    input.dataset.ready = "1";

    input.addEventListener("change", () => {
      enabled = input.checked === true;
      chrome.storage.sync.set({ [STORAGE_KEY]: enabled });
      setGlobalFlag();

      if (!enabled) {
        clearLowHighlightsSoft();
        scheduleClear(80);
        scheduleClear(300);
      }
    });

    return true;
  }

  function tryBindLimited() {
    attempts += 1;
    const ok = bindToggle();
    if (ok || attempts >= 20) return;
    setTimeout(tryBindLimited, 400);
  }

  function init() {
    chrome.storage.sync.get([STORAGE_KEY], (data) => {
      enabled = data[STORAGE_KEY] !== false;
      setGlobalFlag();
      tryBindLimited();
      if (!enabled) scheduleClear();
    });
  }

  window.addEventListener("mesh-helper-force-clear-low", () => {
    if (!enabled) clearLowHighlightsSoft();
  });

  window.addEventListener("mesh-helper-panel-ready", () => {
    attempts = 0;
    tryBindLimited();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  setTimeout(tryBindLimited, 1000);
  setTimeout(tryBindLimited, 2500);
})();