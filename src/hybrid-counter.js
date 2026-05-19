(() => {
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const LOW_CELL_CLASS = "mesh-helper-low-grades-cell";
  const LOW_ROW_BG = "rgba(248, 113, 113, 0.22)";
  const WRONG_FINAL_CLASS = "mesh-helper-wrong-final-cell";
  const FOCUS_ROW_CLASS = "mesh-helper-row-focus";
  const ACADEMIC_DEBT_MIN_GRADES = 2;

  let timer = null;
  let hoverTimer = null;
  let rowTimer = null;
  let pendingRows = new Set();
  let lastRows = [];
  let lastFullScanAt = 0;

  const text = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  const isHighlightOn = () => window.__MESH_HELPER_HIGHLIGHT_LOW_ENABLED__ !== false;

  function minGrades() {
    const n = Number(document.querySelector("#mh-min")?.value || document.querySelector("#mh-mini-min")?.value || 5);
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

  function isFutureLessonCell(markCell) {
    const disabledBy = String(markCell?.getAttribute?.("data-disabled-by") || "").toUpperCase();
    return disabledBy.includes("FUTURE");
  }

  function isVisibleRow(row) {
    if (!row?.getBoundingClientRect) return false;
    const rect = row.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight || 800;
    const buffer = 350;
    return rect.bottom >= -buffer && rect.top <= h + buffer && rect.width > 0 && rect.height > 0;
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

  function allRowCells(row) {
    return [...(row?.children || [])].filter((el) => ["td", "th"].includes(el.tagName?.toLowerCase()));
  }

  function markCellFromTd(cell) {
    return cell?.querySelector?.('[data-test-component^="markCell-"]') || null;
  }

  function rowCellsBeforeFinal(row) {
    const result = [];
    const cells = allRowCells(row);
    for (const cell of cells) {
      if (isFinalCell(cell)) break;
      if (isAverageCell(cell)) continue;
      result.push(cell);
    }
    return result;
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
      if (!markCell || isFutureLessonCell(markCell)) return;
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
      if (!markCell || isFutureLessonCell(markCell)) return;
      lessons += 1;

      const cellText = text(markCell).toLowerCase();
      if (cellText.includes("н")) absences += 1;

      const spans = [...markCell.querySelectorAll("span")].map(text).filter(Boolean);
      const parts = spans.length ? spans : text(markCell).split(" ").map((x) => x.trim()).filter(Boolean);
      let visibleGradesInCell = 0;

      parts.forEach((v) => {
        if (/^[1-5]$/.test(v)) {
          grades += 1;
          visibleGradesInCell += 1;
        }
      });

      if (visibleGradesInCell === 1 && hasStackIcon(markCell)) grades += 1;
    });

    return { grades, absences, lessons };
  }

  function parseAverage(value) {
    const n = Number(String(value || "").replace(",", ".").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function correctFinalFromAverage(avg) {
    const n = Number(avg);
    if (!Number.isFinite(n)) return "";
    if (n >= 4.6) return 5;
    if (n >= 3.6) return 4;
    if (n >= 2.6) return 3;
    return 2;
  }

  function averageFromRow(row) {
    const cells = allRowCells(row);
    const avgTexts = cells.filter(isAverageCell).map(text).filter(Boolean);
    const nums = avgTexts.map(parseAverage).filter((n) => n !== null);
    if (nums.length) return nums[nums.length - 1];

    const candidates = cells.map(text).map(parseAverage).filter((n) => n !== null && n >= 1 && n <= 5);
    return candidates.length ? candidates[candidates.length - 1] : null;
  }

  function finalGradeFromRow(row) {
    const finalCell = allRowCells(row).find(isFinalCell);
    const value = text(finalCell || null);
    const m = value.match(/[1-5]/);
    return m ? Number(m[0]) : "";
  }

  function journalMeta() {
    const titleText = text(document.querySelector("h1")) || document.title || "";
    const subjectSelect = text(document.querySelector("button[aria-haspopup='listbox']")) || "";
    const pageText = text(document.body).slice(0, 2500);
    const classMatch = (titleText + " " + subjectSelect + " " + pageText).match(/\b\d{1,2}\s*[-–—]\s*[А-ЯA-ZЁ][\wА-Яа-яЁё,\s]*\b/);
    const subjectMatch = titleText.match(/Журнал\s+(.+?)\s+\d{1,2}\s*[-–—]/i);
    return {
      className: classMatch ? classMatch[0].replace(/\s+/g, " ").trim() : "",
      subject: subjectMatch ? subjectMatch[1].trim() : (subjectSelect || "")
    };
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
    if (!el || !el.style || el.classList.contains(WRONG_FINAL_CLASS)) return;
    if (el.classList.contains(LOW_CELL_CLASS)) return;
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
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => paintRow(row), 80);
  }

  function setHighlight(row, active) {
    const on = isHighlightOn() && active;
    row.classList.toggle(LOW_ROW_CLASS, on);
    targets(row).forEach((el) => {
      if (el.classList.contains(WRONG_FINAL_CLASS)) return;
      if (on) paintElement(el);
      else {
        el.style.removeProperty("background-color");
        el.classList.remove(LOW_CELL_CLASS);
        if (el.dataset?.mhPrevBg) delete el.dataset.mhPrevBg;
      }
    });
  }

  function buildRow(row, id, meta) {
    const name = studentName(row);
    const sid = studentId(row);
    if (!name || !sid) return null;
    const stat = rowStats(row);
    const average = averageFromRow(row);
    const finalGrade = finalGradeFromRow(row);
    return {
      id,
      row,
      name,
      studentId: sid,
      className: meta.className,
      subject: meta.subject,
      average,
      finalGrade,
      correctFinal: correctFinalFromAverage(average),
      risk: stat.gradeCount < ACADEMIC_DEBT_MIN_GRADES ? "Да" : "Нет",
      absencePercent: stat.lessonCount ? Math.round((stat.absenceCount / stat.lessonCount) * 1000) / 10 : 0,
      ...stat
    };
  }

  function rows(options = {}) {
    const meta = journalMeta();
    const onlyVisible = options.onlyVisible === true;
    return [...document.querySelectorAll("tr")]
      .map((row, id) => ({ row, id }))
      .filter((x) => !onlyVisible || isVisibleRow(x.row))
      .map((x) => buildRow(x.row, x.id, meta))
      .filter(Boolean);
  }

  function reportRows(mode = "problems") {
    const min = minGrades();
    const source = rows({ onlyVisible: false });
    return source
      .filter((x) => mode === "all" || x.gradeCount < min)
      .map((x) => ({
        "Класс": x.className,
        "Предмет": x.subject,
        "ФИО": x.name,
        "Кол-во оценок": x.gradeCount,
        "Средний балл": x.average === null ? "" : String(x.average).replace(".", ","),
        "Риск академической задолженности": x.gradeCount < ACADEMIC_DEBT_MIN_GRADES ? "Да" : "Нет",
        "Выставленная итоговая оценка": x.finalGrade,
        "Правильная оценка": x.correctFinal,
        "Уроков прошло по факту": x.lessonCount,
        "Кол-во Н": x.absenceCount,
        "% пропуска от уроков по факту": String(x.absencePercent).replace(".", ",") + "%"
      }));
  }

  function csvValue(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function downloadCsv(mode) {
    const data = reportRows(mode);
    if (!data.length) {
      alert(mode === "all" ? "Нет данных для выгрузки." : "Проблемных учеников для выгрузки нет.");
      return;
    }
    const headers = Object.keys(data[0]);
    const csv = "\ufeff" + [
      headers.map(csvValue).join(";"),
      ...data.map((row) => headers.map((h) => csvValue(row[h])).join(";"))
    ].join("\n");
    const meta = journalMeta();
    const date = new Date().toISOString().slice(0, 10);
    const name = mode === "all" ? "ves_klass" : "problemnye";
    const filename = `mesh_${name}_${(meta.className || "klass").replace(/[^\wа-яё-]+/gi, "_")}_${date}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bindExportButtons() {
    const problemsBtn = document.getElementById("mh-export-problems");
    const allBtn = document.getElementById("mh-export-all");
    if (problemsBtn && problemsBtn.dataset.ready !== "1") {
      problemsBtn.dataset.ready = "1";
      problemsBtn.addEventListener("click", () => downloadCsv("problems"));
    }
    if (allBtn && allBtn.dataset.ready !== "1") {
      allBtn.dataset.ready = "1";
      allBtn.addEventListener("click", () => downloadCsv("all"));
    }
  }

  function updatePanel(list, min) {
    lastRows = list;
    const panel = document.getElementById("mesh-helper-panel");
    const listEl = panel?.querySelector("#mh-list");
    const summaryEl = panel?.querySelector("#mh-summary");
    const titleCount = panel?.querySelector("#mh-problem-count");
    if (!listEl || !summaryEl) return;

    bindExportButtons();
    const problems = list.filter((x) => x.gradeCount < min);
    summaryEl.textContent = `Ученики ниже нормы по оценкам: ${problems.length}`;
    if (titleCount) titleCount.textContent = String(problems.length);

    if (!problems.length) {
      listEl.innerHTML = '<div class="mh-note">Все видимые ученики в норме 👍</div>';
      return;
    }

    listEl.innerHTML = problems.map((x) => {
      const rate = x.lessonCount ? Math.round((x.absenceCount / x.lessonCount) * 1000) / 10 : 0;
      return `<div class="mh-item"><div class="mh-item-text"><div class="mh-name">${esc(x.name)}</div><div class="mh-count">Оценок за период: ${x.gradeCount}<br>Н: ${x.absenceCount} (${rate}%)</div></div><button class="mh-goto" type="button" data-hybrid-id="${x.id}">Подсветить</button></div>`;
    }).join("");
  }

  function panelFromCache(min) {
    const visible = lastRows.filter((x) => x?.row?.isConnected && isVisibleRow(x.row));
    updatePanel(visible, min);
  }

  function fastApplyFromCache() {
    if (document.hidden) return;
    const min = minGrades();
    const cached = lastRows.filter((x) => x?.row?.isConnected && isVisibleRow(x.row));

    if (!cached.length) {
      schedule(120);
      return;
    }

    cached.forEach((x) => setHighlight(x.row, x.gradeCount < min));
    updatePanel(cached, min);
  }

  function refreshRows(rowSet) {
    if (document.hidden || !rowSet?.size) return;
    const min = minGrades();
    const meta = journalMeta();
    const next = lastRows.filter((x) => x?.row?.isConnected);

    rowSet.forEach((row) => {
      if (!row?.isConnected || !isVisibleRow(row)) return;
      const id = studentId(row);
      if (!id) return;
      const index = next.findIndex((x) => x.studentId === id);
      const built = buildRow(row, index >= 0 ? next[index].id : next.length, meta);
      if (!built) return;
      if (index >= 0) next[index] = built;
      else next.push(built);
      setHighlight(built.row, built.gradeCount < min);
    });

    lastRows = next;
    panelFromCache(min);
  }

  function scheduleRows(rowsToUpdate) {
    rowsToUpdate.forEach((row) => pendingRows.add(row));
    clearTimeout(rowTimer);
    rowTimer = setTimeout(() => {
      const rowsNow = new Set(pendingRows);
      pendingRows.clear();
      refreshRows(rowsNow);
    }, 180);
  }

  function collectRowsFromMutations(mutations) {
    const changed = new Set();
    for (const mutation of mutations) {
      const base = mutation.target?.closest?.("tr");
      if (base) changed.add(base);
      mutation.addedNodes?.forEach?.((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.("tr")) changed.add(node);
        node.querySelectorAll?.("tr").forEach((row) => changed.add(row));
      });
    }
    return changed;
  }

  function focusRow(id) {
    const item = rows({ onlyVisible: false }).find((x) => x.id === id);
    if (!item) return;
    item.row.scrollIntoView({ behavior: "smooth", block: "center" });
    item.row.classList.add(FOCUS_ROW_CLASS);
    setTimeout(() => item.row.classList.remove(FOCUS_ROW_CLASS), 1500);
  }

  function apply() {
    if (document.hidden) return;
    const min = minGrades();
    const now = Date.now();
    const liveRows = rows({ onlyVisible: true });
    liveRows.forEach((x) => setHighlight(x.row, x.gradeCount < min));
    updatePanel(liveRows, min);
    lastFullScanAt = now;
  }

  function schedule(delay = 700) {
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

  document.addEventListener("pointerover", (e) => paintHoveredMark(e.target), true);
  document.addEventListener("scroll", () => schedule(450), true);

  window.addEventListener("mesh-helper-panel-ready", bindExportButtons);
  window.addEventListener("mesh-helper-min-grades-changed", fastApplyFromCache);
  window.addEventListener("mesh-helper-highlight-toggle", () => schedule(250));
  window.addEventListener("mesh-helper-marks-updated", () => schedule(900));
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data?.source === "mesh-helper-marks-hook" && e.data?.type === "marks-response") schedule(900);
  });

  new MutationObserver((mutations) => {
    const changedRows = collectRowsFromMutations(mutations);
    if (!changedRows.size) return;
    if (changedRows.size > 12) schedule(900);
    else scheduleRows(changedRows);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  setInterval(() => {
    if (document.hidden) return;
    if (Date.now() - lastFullScanAt > 10000) apply();
  }, 10000);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => schedule(600), { once: true });
  else schedule(600);

  setTimeout(apply, 2000);
})();
