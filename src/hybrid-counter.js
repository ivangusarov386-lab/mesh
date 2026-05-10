(() => {
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const LOW_CELL_CLASS = "mesh-helper-low-grades-cell";
  const LOW_ROW_BG = "rgba(248, 113, 113, 0.22)";
  const FOCUS_ROW_CLASS = "mesh-helper-row-focus";
  let timer = null;
  let hoverTimer = null;

  const text = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  const isHighlightOn = () => window.__MESH_HELPER_HIGHLIGHT_LOW_ENABLED__ !== false;

  function minGrades() {
    const n = Number(document.querySelector("#mh-min")?.value || 5);
    return Number.isFinite(n) && n > 0 ? n : 5;
  }

  function marks() {
    const main = window.__MESH_HELPER_MARKS__;
    if (main && Array.isArray(main.marks) && main.marks.length) return main.marks;
    const debug = window.__MESH_HELPER_MARKS_DEBUG__;
    if (debug && Array.isArray(debug.marks) && debug.marks.length) return debug.marks;
    return [];
  }

  function isAverageCell(cell) {
    return !!cell?.querySelector?.('[data-test-component*="average"]');
  }

  function isFinalCell(cell) {
    return !!cell?.querySelector?.('[data-test-component*="finalResult"]');
  }

  function studentId(row) {
    const cell = row?.querySelector?.('[data-test-component^="markCell-"]');
    const attr = cell?.getAttribute?.("data-test-component") || "";
    const m = attr.match(/^markCell-(\d+)_/);
    return m ? Number(m[1]) : null;
  }

  function studentName(row) {
    const fio = row?.querySelector?.("span[title]");
    return fio ? (fio.getAttribute("title") || text(fio)) : "";
  }

  function rowCellsBeforeFinal(row) {
    const result = [];
    const cells = [...row.children].filter((el) => ["td", "th"].includes(el.tagName?.toLowerCase()));
    for (const cell of cells) {
      if (isFinalCell(cell)) break;
      if (isAverageCell(cell)) continue;
      result.push(cell);
    }
    return result;
  }

  function markCellFromTd(cell) {
    return cell.querySelector?.('[data-test-component^="markCell-"]') || null;
  }

  function parseLessonId(markCell) {
    const attr = markCell?.getAttribute?.("data-test-component") || "";
    const m = attr.match(/^markCell-\d+_(\d+)_/);
    const id = m ? Number(m[1]) : null;
    return id && id > 100000 ? id : null;
  }

  function buildLessonDateMap(api) {
    const map = new Map();
    api.forEach((mark) => {
      const lessonId = Number(mark?.schedule_lesson_id);
      const date = String(mark?.date || "").trim();
      if (lessonId && date && !map.has(lessonId)) map.set(lessonId, date);
    });
    return map;
  }

  function visiblePeriod(row, api) {
    const ids = new Set();
    const dates = new Set();
    const byLesson = buildLessonDateMap(api);
    const sid = studentId(row);

    rowCellsBeforeFinal(row).forEach((cell) => {
      const markCell = markCellFromTd(cell);
      if (!markCell) return;
      const lessonId = parseLessonId(markCell);
      if (!lessonId) return;

      ids.add(lessonId);
      const date = byLesson.get(lessonId);
      if (date) dates.add(date);
    });

    if (sid && ids.size) {
      api.forEach((mark) => {
        if (Number(mark?.student_profile_id) !== sid) return;
        if (!ids.has(Number(mark?.schedule_lesson_id))) return;
        const date = String(mark?.date || "").trim();
        if (date) dates.add(date);
      });
    }

    return { ids, dates };
  }

  function hasStackIcon(markCell) {
    if (!markCell) return false;
    return !!markCell.querySelector("svg") || /stack|misc-stacked|filled-misc-stacked/i.test(markCell.innerHTML || "");
  }

  function domStats(row) {
    let grades = 0;
    let absences = 0;
    let lessons = 0;

    rowCellsBeforeFinal(row).forEach((cell) => {
      const markCell = markCellFromTd(cell);
      if (!markCell) return;
      lessons += 1;

      const spans = [...markCell.querySelectorAll("span")].map(text).filter(Boolean);
      const parts = spans.length ? spans : text(markCell).split(" ").map((x) => x.trim()).filter(Boolean);

      let visibleGradesInCell = 0;
      parts.forEach((v) => {
        if (/^[1-5]$/.test(v)) {
          grades += 1;
          visibleGradesInCell += 1;
        } else if (v.toLowerCase() === "н") {
          absences += 1;
        }
      });

      if (visibleGradesInCell === 1 && hasStackIcon(markCell)) grades += 1;
    });

    return { grades, absences, lessons };
  }

  function rowStats(row) {
    const sid = studentId(row);
    const api = marks();
    const dom = domStats(row);
    const period = visiblePeriod(row, api);

    if (!sid || (!period.dates.size && !period.ids.size) || !api.length) {
      return { gradeCount: dom.grades, absenceCount: dom.absences, lessonCount: dom.lessons };
    }

    let byLesson = 0;
    let byDate = 0;

    api.forEach((mark) => {
      if (Number(mark?.student_profile_id) !== sid) return;
      if (!/^[1-5]$/.test(String(mark?.name || "").trim())) return;

      const date = String(mark?.date || "").trim();
      const lessonId = Number(mark?.schedule_lesson_id);

      if (lessonId && period.ids.has(lessonId)) byLesson += 1;
      if (date && period.dates.has(date)) byDate += 1;
    });

    return {
      gradeCount: Math.max(dom.grades, byLesson, byDate),
      absenceCount: dom.absences,
      lessonCount: dom.lessons
    };
  }

  function targets(row) {
    const out = [];
    rowCellsBeforeFinal(row).forEach((cell) => {
      out.push(cell);
      cell.querySelectorAll?.('[data-test-component^="markCell-"]').forEach((el) => out.push(el));
    });
    return [...new Set(out)];
  }

  function paintElement(el) {
    if (!el || !el.style) return;
    el.classList.add(LOW_CELL_CLASS);
    el.style.setProperty("background-color", LOW_ROW_BG, "important");
  }

  function paintRow(row) {
    if (!row || !isHighlightOn() || !row.classList.contains(LOW_ROW_CLASS)) return;
    targets(row).forEach(paintElement);
  }

  function paintHoveredMark(target) {
    const row = target?.closest?.(`tr.${LOW_ROW_CLASS}`);
    if (!row || !isHighlightOn()) return;

    const td = target.closest?.("td, th");
    const markCell = target.closest?.('[data-test-component^="markCell-"]') || td?.querySelector?.('[data-test-component^="markCell-"]');

    paintRow(row);
    if (td && !isAverageCell(td) && !isFinalCell(td)) paintElement(td);
    if (markCell) paintElement(markCell);

    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      paintRow(row);
      if (td && !isAverageCell(td) && !isFinalCell(td)) paintElement(td);
      if (markCell) paintElement(markCell);
    }, 30);

    setTimeout(() => {
      if (!row.isConnected) return;
      paintRow(row);
      if (td?.isConnected && !isAverageCell(td) && !isFinalCell(td)) paintElement(td);
      if (markCell?.isConnected) paintElement(markCell);
    }, 120);
  }

  function setHighlight(row, active) {
    const on = isHighlightOn() && active;
    row.classList.toggle(LOW_ROW_CLASS, on);
    targets(row).forEach((el) => {
      el.classList.toggle(LOW_CELL_CLASS, on);
      if (on) el.style.setProperty("background-color", LOW_ROW_BG, "important");
      else {
        el.style.removeProperty("background-color");
        el.classList.remove(LOW_CELL_CLASS);
        if (el.dataset?.mhPrevBg) delete el.dataset.mhPrevBg;
      }
    });
    if (!isHighlightOn()) window.dispatchEvent(new CustomEvent("mesh-helper-force-clear-low"));
  }

  function rows() {
    return [...document.querySelectorAll("tr")].map((row, id) => {
      const name = studentName(row);
      const sid = studentId(row);
      if (!name || !sid) return null;
      const stat = rowStats(row);
      return { id, row, name, studentId: sid, ...stat };
    }).filter(Boolean);
  }

  function updatePanel(list, min) {
    const panel = document.getElementById("mesh-helper-panel");
    const listEl = panel?.querySelector("#mh-list");
    const summaryEl = panel?.querySelector("#mh-summary");
    const titleCount = panel?.querySelector("#mh-problem-count");
    if (!listEl || !summaryEl) return;

    const problems = list.filter((x) => x.gradeCount < min);
    summaryEl.textContent = `Ученики ниже нормы по оценкам: ${problems.length}`;
    if (titleCount) titleCount.textContent = String(problems.length);

    if (!problems.length) {
      listEl.innerHTML = '<div class="mh-note">Все ученики в норме 👍</div>';
      return;
    }

    listEl.innerHTML = problems.map((x) => {
      const rate = x.lessonCount ? Math.round((x.absenceCount / x.lessonCount) * 1000) / 10 : 0;
      return `<div class="mh-item"><div class="mh-item-text"><div class="mh-name">${esc(x.name)}</div><div class="mh-count">Оценок за период: ${x.gradeCount}<br>Н: ${x.absenceCount} (${rate}%)</div></div><button class="mh-goto" type="button" data-hybrid-id="${x.id}">Подсветить</button></div>`;
    }).join("");
  }

  function focusRow(id) {
    const item = rows().find((x) => x.id === id);
    if (!item) return;
    item.row.scrollIntoView({ behavior: "smooth", block: "center" });
    item.row.classList.add(FOCUS_ROW_CLASS);
    setTimeout(() => item.row.classList.remove(FOCUS_ROW_CLASS), 1500);
  }

  function apply() {
    const min = minGrades();
    const list = rows();
    list.forEach((x) => setHighlight(x.row, x.gradeCount < min));
    updatePanel(list, min);
  }

  function schedule(delay = 120) {
    clearTimeout(timer);
    timer = setTimeout(apply, delay);
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-hybrid-id]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    focusRow(Number(btn.dataset.hybridId));
  }, true);

  ["pointerover", "mouseover", "mousemove", "mouseenter"].forEach((eventName) => {
    document.addEventListener(eventName, (e) => paintHoveredMark(e.target), true);
  });

  window.addEventListener("mesh-helper-highlight-toggle", () => schedule(40));
  window.addEventListener("mesh-helper-marks-updated", () => {
    schedule(60);
    setTimeout(apply, 250);
    setTimeout(apply, 900);
  });
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data?.source === "mesh-helper-marks-hook" && e.data?.type === "marks-response") {
      schedule(80);
      setTimeout(apply, 300);
      setTimeout(apply, 900);
    }
  });

  new MutationObserver(() => schedule(180)).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(apply, 1200);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => schedule(200), { once: true });
  else schedule(200);

  setTimeout(apply, 1500);
  setTimeout(apply, 3500);
})();
