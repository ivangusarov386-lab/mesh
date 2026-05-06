// ==========================================================
//  МЭШ – Помощник учителя
//  Гибридный счетчик: видимый период из DOM + скрытые/доп. из marks API.
//
//  Почему так:
//  - DOM правильно ограничен текущим видимым периодом;
//  - API видит скрытые оценки, но total может быть за весь год;
//  - поэтому НЕ берем API total целиком, а добавляем только hidden.
// ==========================================================

(() => {
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const LOW_ROW_BG = "rgba(248, 113, 113, 0.22)";
  let timer = null;

  function text(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function minGrades() {
    const value = Number(document.querySelector("#mh-min")?.value || 5);
    return Number.isFinite(value) && value > 0 ? value : 5;
  }

  function marksStats() {
    const data = window.__MESH_HELPER_MARKS__;
    return data && data.stats ? data.stats : {};
  }

  function studentId(row) {
    const cell = row?.querySelector?.('[data-test-component^="markCell-"]');
    const attr = cell?.getAttribute?.("data-test-component") || "";
    const match = attr.match(/^markCell-(\d+)_/);
    return match ? Number(match[1]) : null;
  }

  function isAverage(el) {
    return !!el?.getAttribute?.("data-test-component")?.includes("average");
  }

  function isFinal(el) {
    return !!el?.getAttribute?.("data-test-component")?.includes("finalResult");
  }

  function visibleMarkCells(row) {
    return [...row.querySelectorAll('div[data-test-component^="markCell-"]')]
      .filter((cell) => !isAverage(cell) && !isFinal(cell));
  }

  function countDomGrades(row) {
    let grades = 0;
    let absences = 0;

    visibleMarkCells(row).forEach((cell) => {
      const values = [...cell.querySelectorAll("span")]
        .map(text)
        .filter(Boolean);

      const parts = values.length ? values : text(cell).split(" ").map((x) => x.trim()).filter(Boolean);

      parts.forEach((value) => {
        if (/^[1-5]$/.test(value)) grades += 1;
        else if (value.toLowerCase() === "н") absences += 1;
      });
    });

    return { grades, absences, lessons: visibleMarkCells(row).length };
  }

  function hiddenFromApi(row) {
    const id = studentId(row);
    if (!id) return 0;
    const stat = marksStats()[String(id)];
    return Number(stat?.hidden || 0);
  }

  function highlightTargets(row) {
    const targets = [];
    const cells = [...row.children].filter((el) => ["td", "th"].includes(el.tagName?.toLowerCase()));

    for (const cell of cells) {
      const hasFinal = !!cell.querySelector?.('[data-test-component*="finalResult"]');
      const hasAverage = !!cell.querySelector?.('[data-test-component*="average"]');
      if (hasFinal) break;
      if (hasAverage) continue;
      targets.push(cell);
      cell.querySelectorAll?.('div[data-test-component^="markCell-"]').forEach((el) => targets.push(el));
    }

    return [...new Set(targets)];
  }

  function setHighlight(row, on) {
    row.classList.toggle(LOW_ROW_CLASS, on);
    highlightTargets(row).forEach((el) => {
      if (on) el.style.setProperty("background-color", LOW_ROW_BG, "important");
      else if (el.dataset.mhPrevBg === undefined) el.style.removeProperty("background-color");
    });
  }

  function rows() {
    return [...document.querySelectorAll("tr")]
      .map((row, id) => {
        const fio = row.querySelector("span[title]");
        const any = row.querySelector('div[data-test-component^="markCell-"]');
        if (!fio || !any) return null;

        const dom = countDomGrades(row);
        const hidden = hiddenFromApi(row);
        const gradeCount = dom.grades + hidden;

        return {
          id,
          row,
          name: fio.getAttribute("title") || text(fio),
          gradeCount,
          absences: dom.absences,
          lessons: dom.lessons,
          hidden
        };
      })
      .filter(Boolean);
  }

  function updatePanel(list, min) {
    const panel = document.getElementById("mesh-helper-panel");
    const listEl = panel?.querySelector("#mh-list");
    const summaryEl = panel?.querySelector("#mh-summary");
    const titleCount = panel?.querySelector("#mh-problem-count");
    if (!listEl || !summaryEl) return;

    const problematic = list.filter((item) => item.gradeCount < min);
    summaryEl.textContent = `Ученики ниже нормы по оценкам: ${problematic.length}`;
    if (titleCount) titleCount.textContent = String(problematic.length);

    if (!problematic.length) {
      listEl.innerHTML = '<div class="mh-note">Все ученики в норме 👍</div>';
      return;
    }

    listEl.innerHTML = problematic.map((item) => {
      const rate = item.lessons ? Math.round((item.absences / item.lessons) * 1000) / 10 : 0;
      return `
        <div class="mh-item">
          <div class="mh-item-text">
            <div class="mh-name">${escapeHtml(item.name)}</div>
            <div class="mh-count">Оценок за период: ${item.gradeCount}<br>Н: ${item.absences} (${rate}%)</div>
          </div>
          <button class="mh-goto" type="button" data-hybrid-id="${item.id}">Подсветить</button>
        </div>
      `;
    }).join("");
  }

  function focusRow(id) {
    const item = rows().find((x) => x.id === id);
    if (!item) return;
    item.row.scrollIntoView({ behavior: "smooth", block: "center" });
    item.row.classList.add("mesh-helper-row-focus");
    setTimeout(() => item.row.classList.remove("mesh-helper-row-focus"), 1500);
  }

  function apply() {
    const min = minGrades();
    const list = rows();
    list.forEach((item) => setHighlight(item.row, item.gradeCount < min));
    updatePanel(list, min);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 120);
  }

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-hybrid-id]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    focusRow(Number(btn.dataset.hybridId));
  }, true);

  window.addEventListener("message", (event) => {
    if (event.source === window && event.data?.source === "mesh-helper-marks-hook") setTimeout(schedule, 150);
  });

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  setInterval(apply, 1000);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once: true });
  else schedule();

  setTimeout(schedule, 1500);
  setTimeout(schedule, 3500);
})();
