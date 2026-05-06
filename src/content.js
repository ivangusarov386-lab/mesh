// ==========================================================
//  МЭШ – Помощник учителя
//  Подсветка учеников с малым количеством оценок,
//  учёт пропусков "Н", экспорт в Excel (CSV),
//  контроль итоговых.
//
//  ВАЖНО:
//  Основной подсчёт оценок теперь берётся из пойманного marks API.
//  Если marks ещё не пойманы — временно используется DOM-подсчёт.
// ==========================================================

(() => {
  const DEFAULT_MIN_GRADES = 5;
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const FOCUS_ROW_CLASS = "mesh-helper-row-focus";
  const FINAL_MISSING_CLASS = "mesh-helper-final-missing";

  const LOW_ROW_BG = "rgba(248, 113, 113, 0.22)";
  const FINAL_MISSING_BG = "rgba(59, 130, 246, 0.26)";
  const FINAL_MISSING_OUTLINE = "inset 0 0 0 2px rgba(37, 99, 235, 0.72)";

  const config = { minGrades: DEFAULT_MIN_GRADES, checkFinals: false };

  let students = [];
  let observer = null;
  let scanTimer = null;
  let totalLessons = 0;
  let marksVersion = 0;
  let apiStatsByStudentId = {};
  let apiMarksReady = false;

  function getText(el) {
    if (!el) return "";
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeCsvCell(value) {
    const str = String(value ?? "");
    if (/[;"\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }

  function getProblemCount() {
    return students.reduce((acc, s) => acc + (s.status === "low" ? 1 : 0), 0);
  }

  function setImportantStyle(el, prop, value) {
    if (!el || !el.style) return;
    el.style.setProperty(prop, value, "important");
  }

  function rememberStyle(el, prop, dataKey) {
    if (!el || !el.style || el.dataset[dataKey] !== undefined) return;
    const value = el.style.getPropertyValue(prop);
    el.dataset[dataKey] = value || "__EMPTY__";
  }

  function restoreStyle(el, prop, dataKey) {
    if (!el || !el.style) return;
    const previous = el.dataset[dataKey];
    if (previous === undefined) return;
    if (previous === "__EMPTY__") el.style.removeProperty(prop);
    else el.style.setProperty(prop, previous);
    delete el.dataset[dataKey];
  }

  function isAverageElement(el) {
    if (!el) return false;
    const testComponent = el.getAttribute?.("data-test-component") || "";
    const text = getText(el).toLowerCase();
    return testComponent.includes("average") || /^ср\.?$/.test(text) || text === "средний балл";
  }

  function isFinalElement(el) {
    if (!el) return false;
    const testComponent = el.getAttribute?.("data-test-component") || "";
    const text = getText(el).toLowerCase();
    return testComponent.includes("finalResult") || /итог/.test(text);
  }

  function getStudentProfileIdFromRow(row) {
    const markCell = row?.querySelector?.('[data-test-component^="markCell-"]');
    const value = markCell?.getAttribute?.("data-test-component") || "";
    const match = value.match(/^markCell-(\d+)_/);
    return match ? Number(match[1]) : null;
  }

  function findFinalCell(row) {
    const finalInner = row?.querySelector?.('[data-test-component*="finalResult"]');
    if (!finalInner) return null;
    return finalInner.closest("td, th") || finalInner;
  }

  function isFinalCellFilled(row) {
    const finalCell = findFinalCell(row);
    if (!finalCell) return false;
    return /[1-5]/.test(getText(finalCell));
  }

  function getCellInnerTargets(cell) {
    if (!cell) return [];
    const selectors = ['div[data-test-component^="markCell-"]', 'div[data-test-component*="markCell"]'];
    return [cell, ...cell.querySelectorAll(selectors.join(","))]
      .filter((el) => !isAverageElement(el) && !isFinalElement(el));
  }

  function syncMarksFromBridge() {
    const marksData = window.__MESH_HELPER_MARKS__;
    if (!marksData || !marksData.loadedAt || !marksData.stats) return false;
    if (marksData.loadedAt === marksVersion) return apiMarksReady;

    marksVersion = marksData.loadedAt;
    apiStatsByStudentId = marksData.stats || {};
    apiMarksReady = Object.keys(apiStatsByStudentId).length > 0;

    if (apiMarksReady) {
      console.log("[МЭШ помощник] marks API подключён:", marksData.count, "записей, учеников:", Object.keys(apiStatsByStudentId).length);
    }

    return apiMarksReady;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "mesh-helper-marks-hook") return;
    setTimeout(() => {
      syncMarksFromBridge();
      scanJournal();
    }, 100);
  });

  function getRowHighlightTargets(row) {
    if (!row) return [];
    const directCells = [...row.children].filter((el) => ["td", "th"].includes(el.tagName?.toLowerCase()));
    const targets = [];

    if (directCells.length) {
      for (const cell of directCells) {
        const hasAverage = isAverageElement(cell) || cell.querySelector?.('[data-test-component*="average"]');
        const hasFinal = isFinalElement(cell) || cell.querySelector?.('[data-test-component*="finalResult"]');
        if (hasFinal) break;
        if (!hasAverage) targets.push(...getCellInnerTargets(cell));
      }
      return [...new Set(targets)].filter(Boolean);
    }

    return [...new Set([...row.querySelectorAll('div[data-test-component^="markCell-"]'), ...row.querySelectorAll('div[data-test-component*="markCell"]')])]
      .filter((el) => !isAverageElement(el) && !isFinalElement(el));
  }

  function setLowGradesHighlight(row, enabled) {
    if (!row) return;
    row.classList.toggle(LOW_ROW_CLASS, enabled);
    getRowHighlightTargets(row).forEach((el) => {
      if (enabled) {
        rememberStyle(el, "background-color", "mhPrevBg");
        setImportantStyle(el, "background-color", LOW_ROW_BG);
      } else {
        restoreStyle(el, "background-color", "mhPrevBg");
      }
    });
  }

  function setFinalMissingHighlight(row, enabled) {
    const finalCell = findFinalCell(row);
    if (!finalCell) return;
    const finalInner = finalCell.querySelector?.('[data-test-component*="finalResult"]') || finalCell;
    [finalCell, finalInner].filter(Boolean).forEach((el) => {
      el.classList.toggle(FINAL_MISSING_CLASS, enabled);
      if (enabled) {
        rememberStyle(el, "background-color", "mhPrevFinalBg");
        rememberStyle(el, "box-shadow", "mhPrevFinalShadow");
        setImportantStyle(el, "background-color", FINAL_MISSING_BG);
        setImportantStyle(el, "box-shadow", FINAL_MISSING_OUTLINE);
      } else {
        restoreStyle(el, "background-color", "mhPrevFinalBg");
        restoreStyle(el, "box-shadow", "mhPrevFinalShadow");
      }
    });
  }

  function clearAllHighlights() {
    document.querySelectorAll(`.${LOW_ROW_CLASS}`).forEach((row) => setLowGradesHighlight(row, false));
    document.querySelectorAll(`.${FINAL_MISSING_CLASS}`).forEach((el) => {
      const row = el.closest("tr");
      if (row) setFinalMissingHighlight(row, false);
    });
  }

  function getCellValues(cell) {
    const spans = [...cell.querySelectorAll("span")].map(getText).filter(Boolean);
    if (spans.length) return spans;
    const t = getText(cell);
    return t ? t.split(" ").map((s) => s.trim()).filter(Boolean) : [];
  }

  function getDomRowStats(row) {
    const cells = row.querySelectorAll('div[data-test-component^="markCell-"]:not([data-test-component*="average"]):not([data-test-component*="finalResult"])');
    let gradeCount = 0;
    let absenceCount = 0;
    cells.forEach((cell) => {
      getCellValues(cell).forEach((val) => {
        if (/^[1-5]$/.test(val)) gradeCount++;
        else if (val.toLowerCase() === "н") absenceCount++;
      });
    });
    return { gradeCount, absenceCount, lessonCount: cells.length, source: "DOM" };
  }

  function getApiRowStats(row) {
    syncMarksFromBridge();
    const studentProfileId = getStudentProfileIdFromRow(row);
    const apiStat = studentProfileId ? apiStatsByStudentId[String(studentProfileId)] : null;
    if (!apiStat) return null;
    return {
      gradeCount: Number(apiStat.total || 0),
      hiddenCount: Number(apiStat.hidden || 0),
      source: "API"
    };
  }

  function getRowStats(row) {
    const domStats = getDomRowStats(row);
    const apiStats = getApiRowStats(row);
    if (!apiStats) return { ...domStats, hiddenCount: 0 };

    return {
      ...domStats,
      gradeCount: apiStats.gradeCount,
      hiddenCount: apiStats.hiddenCount,
      source: "API"
    };
  }

  function ensureTitleStructure(panel) {
    const title = panel.querySelector(".mh-title");
    if (!title || title.querySelector(".mh-title-main")) return;
    const main = document.createElement("div");
    main.className = "mh-title-main";
    main.textContent = "Помощник учителя";
    const sub = document.createElement("div");
    sub.className = "mh-title-sub";
    sub.innerHTML = `Проблемных: <span id="mh-problem-count">0</span>`;
    title.textContent = "";
    title.append(main, sub);
  }

  function updateProblemCountInTitle() {
    const countEl = document.querySelector("#mh-problem-count");
    if (countEl) countEl.textContent = String(getProblemCount());
  }

  function scanJournal() {
    syncMarksFromBridge();
    students = [];
    totalLessons = 0;
    clearAllHighlights();

    document.querySelectorAll("tr").forEach((row, index) => {
      const fioSpan = row.querySelector("span[title]");
      if (!fioSpan || !row.querySelector('div[data-test-component^="markCell-"]')) return;
      const name = fioSpan.getAttribute("title") || getText(fioSpan);
      if (!name) return;

      const { gradeCount, absenceCount, lessonCount, source, hiddenCount } = getRowStats(row);
      if (lessonCount > 0 && totalLessons === 0) totalLessons = lessonCount;

      const hasFinal = isFinalCellFilled(row);
      const status = gradeCount < config.minGrades ? "low" : "ok";
      setLowGradesHighlight(row, status === "low");
      setFinalMissingHighlight(row, config.checkFinals && !hasFinal);

      students.push({
        id: index,
        studentProfileId: getStudentProfileIdFromRow(row),
        name,
        gradeCount,
        absenceCount,
        lessonCount,
        hasFinal,
        status,
        source,
        hiddenCount: hiddenCount || 0,
        rowElement: row,
        absenceRate: 0
      });
    });

    if (totalLessons > 0) {
      students.forEach((s) => {
        s.absenceRate = s.absenceCount > 0 ? Math.round((s.absenceCount / totalLessons) * 1000) / 10 : 0;
        s.lessonCount = totalLessons;
      });
    }

    updatePanelList();
  }

  function debouncedScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scanJournal, 300);
  }

  function enablePanelDrag(panel) {
    const header = panel.querySelector(".mh-header") || panel;
    let isDragging = false;
    let wasDragged = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const saved = localStorage.getItem("meshHelperPosition");
    if (saved) {
      try {
        const { left, top } = JSON.parse(saved);
        panel.style.right = "auto";
        panel.style.left = left + "px";
        panel.style.top = top + "px";
      } catch {}
    }

    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      isDragging = true;
      wasDragged = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragged = true;
      panel.style.right = "auto";
      panel.style.left = startLeft + dx + "px";
      panel.style.top = startTop + dy + "px";
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.userSelect = "";
      const rect = panel.getBoundingClientRect();
      localStorage.setItem("meshHelperPosition", JSON.stringify({ left: rect.left, top: rect.top }));
      panel._meshWasDragged = wasDragged;
    });
  }

  function setupCollapsiblePanel(panel) {
    let btn = panel.querySelector(".mh-collapse-btn");
    if (!btn) {
      const headerEl = panel.querySelector(".mh-header") || panel;
      btn = document.createElement("button");
      btn.className = "mh-collapse-btn";
      btn.type = "button";
      headerEl.appendChild(btn);
    }
    let collapsed = localStorage.getItem("meshHelperCollapsed") === "1";
    function applyState() {
      panel.classList.toggle("mh-collapsed-top", collapsed);
      btn.textContent = collapsed ? "▼" : "▲";
      updateProblemCountInTitle();
    }
    applyState();
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      collapsed = !collapsed;
      localStorage.setItem("meshHelperCollapsed", collapsed ? "1" : "0");
      applyState();
    });
    const header = panel.querySelector(".mh-header");
    if (header) {
      header.addEventListener("click", (e) => {
        if (e.target.closest(".mh-collapse-btn")) return;
        if (panel._meshWasDragged) { panel._meshWasDragged = false; return; }
        if (!panel.classList.contains("mh-collapsed-top")) return;
        collapsed = false;
        localStorage.setItem("meshHelperCollapsed", "0");
        applyState();
      });
    }
  }

  function ensurePanel() {
    let panel = document.getElementById("mesh-helper-panel");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "mesh-helper-panel";
    panel.innerHTML = `
      <div class="mh-header"><div class="mh-title">Помощник учителя</div></div>
      <div class="mh-section mh-settings">
        <label class="mh-label" for="mh-min">Минимум оценок за период</label>
        <div class="mh-settings-row"><input id="mh-min" type="number" min="1"><button id="mh-save" type="button">Сохранить</button></div>
      </div>
      <div class="mh-section mh-final-settings">
        <label class="mh-toggle-row" for="mh-check-finals"><input id="mh-check-finals" type="checkbox"><span>Контроль итоговых</span></label>
        <div class="mh-note">Если итоговая не выставлена — ячейка «Итог» подсветится синим.</div>
      </div>
      <div class="mh-section"><div id="mh-summary" class="mh-subtitle">Ученики ниже нормы по оценкам: 0</div><button id="mh-export" class="mh-export" type="button">Экспорт в Excel</button><div id="mh-list" class="mh-list"></div></div>
    `;
    document.body.appendChild(panel);
    ensureTitleStructure(panel);
    const minInput = panel.querySelector("#mh-min");
    const checkFinalsInput = panel.querySelector("#mh-check-finals");
    minInput.value = config.minGrades;
    checkFinalsInput.checked = !!config.checkFinals;
    panel.querySelector("#mh-save").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const num = Number(String(minInput.value ?? "").trim());
      if (!Number.isFinite(num) || num < 1) { minInput.value = config.minGrades; return; }
      config.minGrades = num;
      chrome.storage.sync.set({ minGrades: num });
      scanJournal();
    });
    checkFinalsInput.addEventListener("change", () => {
      config.checkFinals = checkFinalsInput.checked;
      chrome.storage.sync.set({ checkFinals: config.checkFinals });
      scanJournal();
    });
    panel.querySelector("#mh-export").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); exportAllToCsv(); });
    panel.querySelector("#mh-list").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-id]");
      if (btn) focusRow(Number(btn.dataset.id));
    });
    setupCollapsiblePanel(panel);
    enablePanelDrag(panel);
    return panel;
  }

  function updatePanelList() {
    const panel = ensurePanel();
    const listEl = panel.querySelector("#mh-list");
    const summaryEl = panel.querySelector("#mh-summary");
    const problematic = students.filter((s) => s.status === "low");
    summaryEl.textContent = `Ученики ниже нормы по оценкам: ${problematic.length}`;
    if (!problematic.length) {
      listEl.innerHTML = '<div class="mh-note">Все ученики в норме 👍</div>';
      updateProblemCountInTitle();
      return;
    }
    listEl.innerHTML = problematic.map((s) => {
      const rate = s.absenceRate || 0;
      return `
        <div class="mh-item">
          <div class="mh-item-text">
            <div class="mh-name">${escapeHtml(s.name)}</div>
            <div class="mh-count">Оценок за период: ${s.gradeCount}<br>Н: ${s.absenceCount} (${rate}%)</div>
          </div>
          <button class="mh-goto" type="button" data-id="${s.id}">Подсветить</button>
        </div>
      `;
    }).join("");
    updateProblemCountInTitle();
  }

  function highlightRow(row) {
    if (!row) return;
    row.classList.add(FOCUS_ROW_CLASS);
    setTimeout(() => row.classList.remove(FOCUS_ROW_CLASS), 1500);
  }

  function focusRow(id) {
    const s = students.find((x) => x.id === id);
    if (!s || !s.rowElement) return;
    s.rowElement.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightRow(s.rowElement);
  }

  function exportAllToCsv() {
    if (!students.length) { alert("Нет данных для экспорта."); return; }
    const rows = [["ФИО", "Количество оценок", "Количество Н", "Всего уроков", "% пропусков", "Итог выставлен", "Источник"]];
    students.forEach((s) => {
      const rate = s.absenceRate || 0;
      rows.push([s.name, s.gradeCount, s.absenceCount, s.lessonCount ?? 0, `="${rate}"`, s.hasFinal ? "Да" : "Нет", s.source]);
    });
    const csv = "\uFEFF" + rows.map((r) => r.map(escapeCsvCell).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mesh_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function injectCSS() {
    if (document.getElementById("mesh-helper-style")) return;
    const s = document.createElement("style");
    s.id = "mesh-helper-style";
    s.textContent = "";
    document.head.appendChild(s);
  }

  function startObserver() {
    const root = document.querySelector("#app") || document.body;
    observer = new MutationObserver(debouncedScan);
    observer.observe(root, { childList: true, subtree: true });
  }

  function init() {
    injectCSS();
    chrome.storage.sync.get(["minGrades", "checkFinals"], ({ minGrades, checkFinals }) => {
      config.minGrades = typeof minGrades === "number" ? minGrades : DEFAULT_MIN_GRADES;
      config.checkFinals = !!checkFinals;
      const panel = ensurePanel();
      ensureTitleStructure(panel);
      startObserver();
      scanJournal();
      setTimeout(scanJournal, 1200);
      setTimeout(scanJournal, 3000);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();