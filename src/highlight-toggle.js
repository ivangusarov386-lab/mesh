// ==========================================================
//  МЭШ – Помощник учителя
//  Безопасный раскрывающийся блок «Подсветка».
//
//  Главная идея:
//  этот файл не только рисует тумблер, но и задаёт глобальный флаг
//  window.__MESH_HELPER_HIGHLIGHT_LOW_ENABLED__.
//  Остальные скрипты обязаны смотреть на этот флаг перед красной подсветкой.
// ==========================================================

(() => {
  const STORAGE_KEY = "highlightLowGrades";
  const OPEN_KEY = "highlightPanelOpen";
  const TOGGLE_ID = "mh-highlight-low-grades";
  const BOX_ID = "mh-highlight-box";
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const LOW_BG_PARTS = ["248", "113", "113"];

  let enabled = true;
  let open = false;
  let insertTimer = null;
  let clearTimer = null;

  function setGlobalFlag() {
    window.__MESH_HELPER_HIGHLIGHT_LOW_ENABLED__ = enabled;
    window.dispatchEvent(new CustomEvent("mesh-helper-highlight-toggle", {
      detail: { enabled }
    }));
  }

  function isLowBg(value) {
    const bg = String(value || "");
    return LOW_BG_PARTS.every((part) => bg.includes(part));
  }

  function clearLowHighlightsSoft() {
    document.querySelectorAll(`.${LOW_ROW_CLASS}`).forEach((row) => {
      row.classList.remove(LOW_ROW_CLASS);
    });

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

  function syncVisualState() {
    const box = document.getElementById(BOX_ID);
    if (!box) return;

    const button = box.querySelector(".mh-highlight-title");
    const body = box.querySelector(".mh-highlight-body");
    const arrow = box.querySelector(".mh-highlight-arrow");
    const input = box.querySelector(`#${TOGGLE_ID}`);

    if (input) input.checked = enabled;
    if (body) body.style.display = open ? "block" : "none";
    if (arrow) arrow.textContent = open ? "▲" : "▼";
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function insertBox() {
    const panel = document.getElementById("mesh-helper-panel");
    if (!panel) return;

    const existing = panel.querySelector(`#${BOX_ID}`);
    if (existing) {
      syncVisualState();
      return;
    }

    const finalSection = panel.querySelector(".mh-final-settings");
    const settingsSection = panel.querySelector(".mh-settings");
    const anchor = finalSection || settingsSection;
    if (!anchor || !anchor.parentNode) return;

    const section = document.createElement("div");
    section.id = BOX_ID;
    section.className = "mh-section mh-highlight-settings";
    section.innerHTML = `
      <button class="mh-highlight-title" type="button" aria-expanded="false">
        <span>Подсветка</span>
        <span class="mh-highlight-arrow">▼</span>
      </button>

      <div class="mh-highlight-body">
        <label class="mh-toggle-row" for="${TOGGLE_ID}">
          <input id="${TOGGLE_ID}" type="checkbox">
          <span>Подсветка недобора оценок</span>
        </label>
        <div class="mh-note">Можно выключить красную подсветку, когда она временно не нужна.</div>
      </div>
    `;

    anchor.parentNode.insertBefore(section, anchor);

    section.querySelector(".mh-highlight-title")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      open = !open;
      chrome.storage.sync.set({ [OPEN_KEY]: open });
      syncVisualState();
    });

    section.querySelector(`#${TOGGLE_ID}`)?.addEventListener("change", (event) => {
      enabled = event.target.checked;
      chrome.storage.sync.set({ [STORAGE_KEY]: enabled });
      setGlobalFlag();
      syncVisualState();

      if (!enabled) {
        clearLowHighlightsSoft();
        scheduleClear(80);
        scheduleClear(300);
      }
    });

    syncVisualState();
  }

  function scheduleInsert() {
    clearTimeout(insertTimer);
    insertTimer = setTimeout(insertBox, 250);
  }

  function init() {
    chrome.storage.sync.get([STORAGE_KEY, OPEN_KEY], (data) => {
      enabled = data[STORAGE_KEY] !== false;
      open = data[OPEN_KEY] === true;
      setGlobalFlag();
      insertBox();
      if (!enabled) scheduleClear();
    });
  }

  window.addEventListener("mesh-helper-force-clear-low", () => {
    if (!enabled) clearLowHighlightsSoft();
  });

  const observer = new MutationObserver(() => {
    if (!document.getElementById(BOX_ID)) scheduleInsert();
  });

  function startObserver() {
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startObserver();
      init();
    }, { once: true });
  } else {
    startObserver();
    init();
  }
})();
