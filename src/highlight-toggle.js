// ==========================================================
//  МЭШ – Помощник учителя
//  Тумблер подсветки недобора оценок.
//
//  По умолчанию подсветка включена.
//  Если выключить — список учеников и экспорт остаются,
//  но красная подсветка строк/ячеек снимается.
// ==========================================================

(() => {
  const STORAGE_KEY = "highlightLowGrades";
  const TOGGLE_ID = "mh-highlight-low-grades";
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const LOW_BG_PARTS = ["248", "113", "113"];

  let enabled = true;
  let timer = null;

  function isLowBg(value) {
    const bg = String(value || "");
    return LOW_BG_PARTS.every((part) => bg.includes(part));
  }

  function clearLowHighlights() {
    document.querySelectorAll(`.${LOW_ROW_CLASS}`).forEach((row) => {
      row.classList.remove(LOW_ROW_CLASS);
    });

    document.querySelectorAll("[data-mh-prev-bg]").forEach((el) => {
      const previous = el.dataset.mhPrevBg;

      if (previous === "__EMPTY__") el.style.removeProperty("background-color");
      else if (previous !== undefined) el.style.setProperty("background-color", previous);

      delete el.dataset.mhPrevBg;
    });

    document.querySelectorAll("td, th, div").forEach((el) => {
      const bg = el.style?.getPropertyValue("background-color");
      if (isLowBg(bg)) el.style.removeProperty("background-color");
    });
  }

  function scheduleClear() {
    if (enabled) return;
    clearTimeout(timer);
    timer = setTimeout(clearLowHighlights, 40);
  }

  function insertToggle() {
    const panel = document.getElementById("mesh-helper-panel");
    if (!panel || panel.querySelector(`#${TOGGLE_ID}`)) return;

    const finalSection = panel.querySelector(".mh-final-settings");
    const settingsSection = panel.querySelector(".mh-settings");
    const anchor = finalSection || settingsSection;
    if (!anchor) return;

    const section = document.createElement("div");
    section.className = "mh-section mh-highlight-settings";
    section.innerHTML = `
      <label class="mh-toggle-row" for="${TOGGLE_ID}">
        <input id="${TOGGLE_ID}" type="checkbox">
        <span>Подсветка недобора оценок</span>
      </label>
      <div class="mh-note">Можно выключить красную подсветку, когда она временно не нужна.</div>
    `;

    anchor.parentNode.insertBefore(section, anchor);

    const input = section.querySelector(`#${TOGGLE_ID}`);
    input.checked = enabled;

    input.addEventListener("change", () => {
      enabled = input.checked;
      chrome.storage.sync.set({ [STORAGE_KEY]: enabled });

      if (!enabled) clearLowHighlights();
    });
  }

  function syncInput() {
    const input = document.getElementById(TOGGLE_ID);
    if (input) input.checked = enabled;
  }

  function init() {
    chrome.storage.sync.get([STORAGE_KEY], (data) => {
      enabled = data[STORAGE_KEY] !== false;
      insertToggle();
      syncInput();
      if (!enabled) clearLowHighlights();
    });
  }

  new MutationObserver(() => {
    insertToggle();
    scheduleClear();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"]
  });

  setInterval(() => {
    insertToggle();
    if (!enabled) clearLowHighlights();
  }, 500);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
