// ==========================================================
//  МЭШ – Помощник учителя
//  Guard подсветки.
//
//  Задачи:
//  1) перенести «Контроль итоговых» внутрь блока «Подсветка»;
//  2) если красная подсветка выключена — запрещать повторную окраску;
//  3) не мешать МЭШ, когда подсветка включена.
// ==========================================================

(() => {
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const HIGHLIGHT_BOX_ID = "mh-highlight-box";
  const HIGHLIGHT_BODY_SELECTOR = ".mh-highlight-body";
  const FINAL_SECTION_SELECTOR = ".mh-final-settings";
  const LOW_BG_PARTS = ["248", "113", "113"];

  let timer = null;
  let observer = null;

  function isLowHighlightEnabled() {
    return window.__MESH_HELPER_HIGHLIGHT_LOW_ENABLED__ !== false;
  }

  function isLowBg(value) {
    const bg = String(value || "");
    return LOW_BG_PARTS.every((part) => bg.includes(part));
  }

  function moveFinalControlIntoHighlightBox() {
    const box = document.getElementById(HIGHLIGHT_BOX_ID);
    const body = box?.querySelector(HIGHLIGHT_BODY_SELECTOR);
    const finalSection = document.querySelector(FINAL_SECTION_SELECTOR);

    if (!box || !body || !finalSection) return;
    if (finalSection.closest(`#${HIGHLIGHT_BOX_ID}`)) return;

    finalSection.classList.add("mh-highlight-final-inside");
    body.appendChild(finalSection);
  }

  function clearRedHighlight() {
    if (isLowHighlightEnabled()) return;

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

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      moveFinalControlIntoHighlightBox();
      clearRedHighlight();
    }, 80);
  }

  function ensureObserverMode() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(schedule);

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: isLowHighlightEnabled() ? ["childList"] : ["class", "style"]
    });
  }

  window.addEventListener("mesh-helper-highlight-toggle", () => {
    ensureObserverMode();
    schedule();
    setTimeout(clearRedHighlight, 120);
    setTimeout(clearRedHighlight, 400);
  });

  window.addEventListener("mesh-helper-force-clear-low", clearRedHighlight);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureObserverMode();
      schedule();
    }, { once: true });
  } else {
    ensureObserverMode();
    schedule();
  }

  setTimeout(schedule, 800);
  setTimeout(schedule, 2000);
})();
