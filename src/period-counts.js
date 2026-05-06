(() => {
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const LOW_ROW_BG = "rgba(248, 113, 113, 0.22)";
  let timer = null;

  function text(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function minGrades() {
    const value = Number(document.querySelector("#mh-min")?.value || 5);
    return Number.isFinite(value) && value > 0 ? value : 5;
  }

  function data() {
    const d = window.__MESH_HELPER_MARKS__;
    return d && Array.isArray(d.marks) ? d : null;
  }

  function studentId(row) {
    const cell = row?.querySelector?.('[data-test-component^="markCell-"]');
    const attr = cell?.getAttribute?.("data-test-component") || "";
    const m = attr.match(/^markCell-(\d+)_/);
    return m ? Number(m[1]) : null;
  }

  function avg(cell) {
    return !!cell?.querySelector?.('[data-test-component*="average"]');
  }

  function finalCell(cell) {
    return !!cell?.querySelector?.('[data-test-component*="finalResult"]');
  }

  function parseRuDateToIso(dateText, year) {
    const value = String(dateText || "").trim();
    const m = value.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
    if (!m) return null;

    const day = String(m[1]).padStart(2, "0");
    const month = String(m[2]).padStart(2, "0");
    const y = m[3] || year;

    if (!y) return null;
    return `${y}-${month}-${day}`;
  }

  function detectSchoolYear() {
    const pageText = text(document.body);
    const m = pageText.match(/(20\d{2})\s*[-–]\s*(\d{2}|20\d{2})/);
    if (m) return Number(m[1]);
    return new Date().getFullYear();
  }

  function getMarkCellFromCell(cell) {
    return cell?.querySelector?.('[data-test-component^="markCell-"]') || null;
  }

  function lessonIds(row) {
    const ids = new Set();
    const cells = [...row.children].filter((el) => ["td", "th"].includes(el.tagName?.toLowerCase()));

    for (const cell of cells) {
      if (finalCell(cell)) break;
      if (avg(cell)) continue;

      const markCell = getMarkCellFromCell(cell);
      const attr = markCell?.getAttribute?.("data-test-component") || "";
      const m = attr.match(/^markCell-\d+_(\d+)_/);
      if (m) ids.add(Number(m[1]));
    }

    return ids;
  }

  function getVisibleDatesByColumn() {
    const dates = [];
    const yearStart = detectSchoolYear();
    const headerCells = [...document.querySelectorAll("th, td, div")];

    headerCells.forEach((el) => {
      const t = text(el);
      if (!/^\d{1,2}$/.test(t)) return;

      const parentText = text(el.closest("tr") || el.parentElement || "");
      if (!parentText) return;

      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      dates.push({ x: rect.left + rect.width / 2, day: Number(t) });
    });

    return { dates, yearStart };
  }

  function getRowVisibleDateSet(row) {
    const result = new Set();
    const { dates, yearStart } = getVisibleDatesByColumn();
    if (!dates.length) return result;

    const cells = [...row.children].filter((el) => ["td", "th"].includes(el.tagName?.toLowerCase()));

    for (const cell of cells) {
      if (finalCell(cell)) break;
      if (avg(cell)) continue;

      const markCell = getMarkCellFromCell(cell);
      if (!markCell) continue;

      const rect = markCell.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const nearest = dates.reduce((best, item) => {
        const dist = Math.abs(item.x - centerX);
        return !best || dist < best.dist ? { ...item, dist } : best;
      }, null);

      if (!nearest || nearest.dist > 18) continue;

      const monthText = text(cell.closest("table") || document.body);
      const apiMarks = data()?.marks || [];
      const sid = studentId(row);
      const possible = apiMarks
        .filter((m) => Number(m?.student_profile_id) === sid)
        .map((m) => String(m?.date || ""))
        .filter((d) => d.endsWith(`-${String(nearest.day).padStart(2, "0")}`));

      possible.forEach((d) => result.add(d));
    }

    return result;
  }

  function exactCount(row, marks) {
    const sid = studentId(row);
    if (!sid) return null;

    const ids = lessonIds(row);
    const visibleDates = getRowVisibleDateSet(row);

    let count = 0;
    for (const mark of marks) {
      if (Number(mark?.student_profile_id) !== sid) continue;
      if (!/^[1-5]$/.test(String(mark?.name || "").trim())) continue;

      const byLesson = ids.has(Number(mark?.schedule_lesson_id));
      const byDate = visibleDates.has(String(mark?.date || ""));

      if (byLesson || byDate) count++;
    }
    return count;
  }

  function targets(row) {
    const result = [];
    const cells = [...row.children].filter((el) => ["td", "th"].includes(el.tagName?.toLowerCase()));

    for (const cell of cells) {
      if (finalCell(cell)) break;
      if (avg(cell)) continue;
      result.push(cell);
      cell.querySelectorAll?.('[data-test-component^="markCell-"]').forEach((el) => result.push(el));
    }
    return [...new Set(result)];
  }

  function highlight(row, on) {
    row.classList.toggle(LOW_ROW_CLASS, on);
    targets(row).forEach((el) => {
      if (on) el.style.setProperty("background-color", LOW_ROW_BG, "important");
      else if (el.dataset.mhPrevBg === undefined) el.style.removeProperty("background-color");
    });
  }

  function rows() {
    return [...document.querySelectorAll("tr")].map((row, id) => {
      const fio = row.querySelector("span[title]");
      const any = row.querySelector('[data-test-component^="markCell-"]');
      if (!fio || !any) return null;
      return { id, row, name: fio.getAttribute("title") || text(fio), count: 0 };
    }).filter(Boolean);
  }

  function updatePanel(list, min) {
    const panel = document.getElementById("mesh-helper-panel");
    const listEl = panel?.querySelector("#mh-list");
    const summaryEl = panel?.querySelector("#mh-summary");
    const titleCountEl = panel?.querySelector("#mh-problem-count");
    if (!listEl || !summaryEl) return;

    const problem = list.filter((x) => x.count < min);
    summaryEl.textContent = `Ученики ниже нормы по оценкам: ${problem.length}`;
    if (titleCountEl) titleCountEl.textContent = String(problem.length);

    if (!problem.length) {
      listEl.innerHTML = '<div class="mh-note">Все ученики в норме 👍</div>';
      return;
    }

    const names = new Set(problem.map((x) => x.name));
    [...listEl.querySelectorAll(".mh-item")].forEach((item) => {
      const name = text(item.querySelector(".mh-name"));
      if (!names.has(name)) item.remove();
    });

    [...listEl.querySelectorAll(".mh-item")].forEach((item) => {
      const name = text(item.querySelector(".mh-name"));
      const row = problem.find((x) => x.name === name);
      if (!row) return;

      const countEl = item.querySelector(".mh-count");
      if (!countEl) return;
      const oldText = text(countEl);
      const nPart = oldText.includes("Н:") ? "Н:" + oldText.split("Н:").slice(1).join("Н:") : "";
      countEl.innerHTML = `Оценок за период: ${row.count}` + (nPart ? `<br>${nPart}` : "");
    });
  }

  function apply() {
    const d = data();
    if (!d) return;

    const min = minGrades();
    const list = rows().map((item) => {
      const count = exactCount(item.row, d.marks);
      return { ...item, count: count === null ? 0 : count };
    });

    list.forEach((item) => highlight(item.row, item.count < min));
    updatePanel(list, min);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 350);
  }

  window.addEventListener("message", (event) => {
    if (event.source === window && event.data?.source === "mesh-helper-marks-hook") setTimeout(schedule, 150);
  });

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once: true });
  else schedule();

  setTimeout(schedule, 1500);
  setTimeout(schedule, 3500);
})();
