// ==========================================================
//  МЭШ – Помощник учителя
//  Раскрывающийся блок «Подсветка».
//
//  По умолчанию подсветка недобора оценок включена.
//  Если выключить — список учеников и экспорт остаются,
//  но красная подсветка строк/ячеек снимается и подавляется
//  при последующих обновлениях DOM.
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
  let timer = null;
  let cleaning = false;

  function isLowBg(value) {
    const bg = String(value || "");
    return LOW_BG_PARTS.every((part) => bg.includes(part));
  }

  function clearLowHighlights() {
    if (enabled || cleaning) return;
    cleaning = true;

    try {
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
    } finally {
      cleaning = false;
    }
  }

  function scheduleClear(delay = 0) {
    if (enabled) return;
    clearTimeout(timer);
    timer = setTimeout(clearLowHighlights, delay);
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
    if (!anchor) return;

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

      if (!enabled) {
        clearLowHighlights();
        scheduleClear(80);
        scheduleClear(250);
      }
    });

    syncVisualState();
  }

  function init() {
    chrome.storage.sync.get([STORAGE_KEY, OPEN_KEY], (data) => {
      // По умолчанию ВКЛ. Если старое значение было false — сохраняем выбор пользователя.
      enabled = data[STORAGE_KEY] !== false;
      open = data[OPEN_KEY] === true;
      insertBox();
      if (!enabled) clearLowHighlights();
    });
  }

  new MutationObserver(() => {
    insertBox();
    if (!enabled) {
      clearLowHighlights();
      scheduleClear(60);
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"]
  });

  setInterval(() => {
    insertBox();
    if (!enabled) clearLowHighlights();
  }, 250);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
