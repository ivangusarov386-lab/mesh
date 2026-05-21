(() => {
  const SELECTED_CLASS = "mh-selected-student";
  const EXPORT_ID = "mh-export-selected-doc";
  const selected = new Map();
  let timer = null;

  const text = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

  function marks() {
    const data = window.__MESH_HELPER_MARKS__ || window.__MESH_HELPER_MARKS_DEBUG__;
    return Array.isArray(data?.marks) ? data.marks : [];
  }

  function cells(row) {
    return [...(row?.children || [])].filter((el) => ["td", "th"].includes(el.tagName?.toLowerCase()));
  }

  function markCell(cell) {
    return cell?.querySelector?.('[data-test-component^="markCell-"]') || null;
  }

  function isAverage(cell) {
    return !!cell?.querySelector?.('[data-test-component*="average"]');
  }

  function isFinal(cell) {
    return !!cell?.querySelector?.('[data-test-component*="finalResult"]');
  }

  function isFuture(mc) {
    return String(mc?.getAttribute?.("data-disabled-by") || "").toUpperCase().includes("FUTURE");
  }

  function lessonId(mc) {
    const attr = mc?.getAttribute?.("data-test-component") || "";
    const m = attr.match(/^markCell-\d+_(\d+)_/);
    const id = m ? Number(m[1]) : null;
    return id && id > 100000 ? id : null;
  }

  function studentId(row) {
    const mc = row?.querySelector?.('[data-test-component^="markCell-"]');
    const attr = mc?.getAttribute?.("data-test-component") || "";
    const m = attr.match(/^markCell-(\d+)_/);
    return m ? Number(m[1]) : null;
  }

  function studentName(row) {
    const fio = row?.querySelector?.("span[title]");
    return fio ? (fio.getAttribute("title") || text(fio)) : "";
  }

  function periodCells(row) {
    const out = [];
    for (const cell of cells(row)) {
      if (isFinal(cell)) break;
      if (!isAverage(cell)) out.push(cell);
    }
    return out;
  }

  function finalGrade(row) {
    const value = text(cells(row).find(isFinal));
    const m = value.match(/[1-5]/);
    return m ? Number(m[0]) : "—";
  }

  function possibleFinal(avg) {
    const n = Number(avg);
    if (!Number.isFinite(n)) return "—";
    if (n >= 4.6) return 5;
    if (n >= 3.6) return 4;
    if (n >= 2.6) return 3;
    return 2;
  }

  function visibleGrades(cell) {
    const mc = markCell(cell);
    if (!mc) return [];
    const spans = [...mc.querySelectorAll("span")].map(text).filter(Boolean);
    const parts = spans.length ? spans : text(mc).split(" ").map((x) => x.trim()).filter(Boolean);
    return parts.filter((x) => /^[1-5]$/.test(x)).map(Number);
  }

  function rowData(name) {
    const row = [...document.querySelectorAll("tr")].find((tr) => studentName(tr) === name);
    if (!row) return null;

    const sid = studentId(row);
    const ids = new Set();
    let totalLessons = 0;
    let factLessons = 0;
    let misses = 0;
    let domGrades = [];

    periodCells(row).forEach((cell) => {
      const mc = markCell(cell);
      if (!mc) return;
      totalLessons += 1;
      const id = lessonId(mc);
      if (id) ids.add(id);
      if (!isFuture(mc)) {
        factLessons += 1;
        if (text(mc).toLowerCase().includes("н")) misses += 1;
        domGrades = domGrades.concat(visibleGrades(cell));
      }
    });

    const apiGrades = sid && ids.size ? marks()
      .filter((m) => Number(m?.student_profile_id) === sid)
      .filter((m) => ids.has(Number(m?.schedule_lesson_id)))
      .map((m) => String(m?.name || "").trim())
      .filter((v) => /^[1-5]$/.test(v))
      .map(Number) : [];

    const grades = apiGrades.length >= domGrades.length ? apiGrades : domGrades;
    const avg = grades.length ? grades.reduce((s, n) => s + n, 0) / grades.length : null;
    const pf = possibleFinal(avg);
    const missPercent = factLessons ? Math.round((misses / factLessons) * 1000) / 10 : 0;

    return {
      fio: name,
      grades: grades.length ? grades.join(", ") : "—",
      totalLessons,
      factLessons,
      misses,
      missPercent: String(missPercent).replace(".", ",") + "%",
      risk: grades.length < 2 || pf === 2 ? "Высокая" : "Нет",
      finalGrade: finalGrade(row),
      possibleFinal: pf
    };
  }

  function makeDoc() {
    const rows = [...selected.keys()].map(rowData).filter(Boolean);
    if (!rows.length) return alert("Выберите хотя бы одного ученика.");

    const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.fio)}</td><td>${esc(r.grades)}</td><td>${r.totalLessons}</td><td>${r.factLessons}</td><td>${r.misses}</td><td>${esc(r.missPercent)}</td><td>${esc(r.risk)}</td><td>${esc(r.finalGrade)}</td><td>${esc(r.possibleFinal)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Times New Roman,serif;font-size:12pt}h1{text-align:center;font-size:16pt}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:5px;vertical-align:top}th{text-align:center}</style></head><body><h1>Черновик докладной записки</h1><p><b>Дата:</b> ${new Date().toLocaleDateString("ru-RU")}</p><table><tr><th>№</th><th>ФИО</th><th>Все оценки периода</th><th>Общее число уроков</th><th>Уроков по факту</th><th>Пропусков</th><th>% пропусков</th><th>Вероятность А/З</th><th>Итоговая</th><th>Возможная итоговая</th></tr>${body}</table></body></html>`;

    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dokladnaya_${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function ensureExportButton() {
    const menu = document.querySelector("#mesh-helper-panel .mh-export-menu");
    if (!menu || document.getElementById(EXPORT_ID)) return;
    const btn = document.createElement("button");
    btn.id = EXPORT_ID;
    btn.className = "mh-export";
    btn.type = "button";
    btn.textContent = "Докладная Word по выбранным";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      makeDoc();
    });
    menu.appendChild(btn);
  }

  function applyState(button, item, name) {
    const on = selected.has(name);
    button.textContent = on ? "Выбран" : "Выбрать";
    button.classList.toggle(SELECTED_CLASS, on);
    item?.classList.toggle(SELECTED_CLASS, on);
  }

  function enhanceButtons() {
    const list = document.querySelector("#mesh-helper-panel #mh-list");
    if (!list) return;
    list.querySelectorAll(".mh-item").forEach((item) => {
      const name = text(item.querySelector(".mh-name"));
      const button = item.querySelector(".mh-goto, .mh-select-student");
      if (!name || !button) return;
      button.classList.add("mh-select-student");
      button.classList.remove("mh-goto");
      button.removeAttribute("data-hybrid-id");
      button.dataset.studentName = name;
      applyState(button, item, name);
      if (button.dataset.selectionReady === "1") return;
      button.dataset.selectionReady = "1";
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const current = button.dataset.studentName || name;
        selected.has(current) ? selected.delete(current) : selected.set(current, current);
        applyState(button, item, current);
      }, true);
    });
  }

  function refresh() {
    ensureExportButton();
    enhanceButtons();
  }

  function schedule(delay = 120) {
    clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  }

  window.addEventListener("mesh-helper-panel-ready", () => schedule(100));
  window.addEventListener("mesh-helper-min-grades-changed", () => schedule(200));
  window.addEventListener("mesh-helper-marks-updated", () => schedule(500));
  new MutationObserver(() => schedule(120)).observe(document.documentElement, { childList: true, subtree: true });
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => schedule(300), { once: true }) : schedule(300);
})();
