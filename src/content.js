// ==========================================================
//  МЭШ – Помощник учителя
//  Подсветка учеников с малым количеством оценок,
//  учёт пропусков "Н", экспорт в Excel (CSV),
//  панель со сворачиванием вверх (3D-плашка) + drag,
//  в свернутом виде показывает 2 строки:
//    1) "Помощник учителя"
//    2) "Проблемных: N"
// ==========================================================

(() => {
  // --------------------------------------------------------
  //  Конфигурация
  // --------------------------------------------------------
  const DEFAULT_MIN_GRADES = 5;
  const LOW_ROW_CLASS = "mesh-helper-low-grades-row";
  const FOCUS_ROW_CLASS = "mesh-helper-row-focus";

  const LOW_ROW_BG = "rgba(248, 113, 113, 0.22)";
  const LOW_ROW_SHADOW = "inset 4px 0 0 #ef4444";

  const config = {
    minGrades: DEFAULT_MIN_GRADES
  };

  let students = [];
  let observer = null;
  let scanTimer = null;
  let totalLessons = 0;

  // --------------------------------------------------------
  //  Утилиты
  // --------------------------------------------------------
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

    if (previous === "__EMPTY__") {
      el.style.removeProperty(prop);
    } else {
      el.style.setProperty(prop, previous);
    }

    delete el.dataset[dataKey];
  }

  function isAverageElement(el) {
    if (!el) return false;
    const testComponent = el.getAttribute?.("data-test-component") || "";
    const text = getText(el).toLowerCase();

    return (
      testComponent.includes("average") ||
      /^ср\.?$/.test(text) ||
      text === "средний балл"
    );
  }

  function isFinalElement(el) {
    if (!el) return false;
    const testComponent = el.getAttribute?.("data-test-component") || "";
    const text = getText(el).toLowerCase();

    return (
      testComponent.includes("finalResult") ||
      /итог/.test(text)
    );
  }

  function getHighlightDescendants(cell) {
    if (!cell) return [];

    const selectors = [
      'div[data-test-component^="markCell-"]',
      'div[data-test-component*="markCell"]',
      'div[data-test-component*="finalResult"]'
    ];

    return [cell, ...cell.querySelectorAll(selectors.join(","))]
      .filter((el) => !isAverageElement(el));
  }

  // --------------------------------------------------------
  //  Подсветка строки за весь период ДО столбца «Итог» включительно.
  //  Важно: правее «Итог» обычно находится «Ср.» — его не красим.
  // --------------------------------------------------------
  function getRowHighlightTargets(row) {
    if (!row) return [];

    const directCells = [...row.children].filter((el) => {
      const tag = el.tagName?.toLowerCase();
      return tag === "td" || tag === "th";
    });

    const targets = [row];

    if (directCells.length) {
      for (const cell of directCells) {
        if (isAverageElement(cell) || cell.querySelector?.('[data-test-component*="average"]')) {
          break;
        }

        targets.push(...getHighlightDescendants(cell));

        if (isFinalElement(cell) || cell.querySelector?.('[data-test-component*="finalResult"]')) {
          break;
        }
      }

      return [...new Set(targets)].filter(Boolean);
    }

    // Запасной вариант для нестандартной разметки МЭШ:
    // красим строку и все markCell/finalResult, но не average/«Ср.»
    const fallback = [
      ...row.querySelectorAll('div[data-test-component^="markCell-"]'),
      ...row.querySelectorAll('div[data-test-component*="markCell"]'),
      ...row.querySelectorAll('div[data-test-component*="finalResult"]')
    ].filter((el) => !isAverageElement(el));

    return [...new Set([...targets, ...fallback])].filter(Boolean);
  }

  function setLowGradesHighlight(row, enabled) {
    if (!row) return;

    row.classList.toggle(LOW_ROW_CLASS, enabled);

    const targets = getRowHighlightTargets(row);

    targets.forEach((el) => {
      if (enabled) {
        rememberStyle(el, "background-color", "mhPrevBg");
        rememberStyle(el, "box-shadow", "mhPrevShadow");

        setImportantStyle(el, "background-color", LOW_ROW_BG);
        setImportantStyle(el, "box-shadow", LOW_ROW_SHADOW);
      } else {
        restoreStyle(el, "background-color", "mhPrevBg");
        restoreStyle(el, "box-shadow", "mhPrevShadow");
      }
    });
  }

  function clearAllLowGradesHighlights() {
    document.querySelectorAll(`.${LOW_ROW_CLASS}`).forEach((row) => {
      setLowGradesHighlight(row, false);
    });
  }

  // --------------------------------------------------------
  //  Разбор одной строки журнала (один ученик)
  // --------------------------------------------------------
  function getCellValues(cell) {
    if (!cell) return [];

    const spans = [...cell.querySelectorAll("span")]
      .map(getText)
      .filter(Boolean);

    if (spans.length) return spans;

    const text = getText(cell);
    if (!text) return [];

    return text.split(" ").map((s) => s.trim()).filter(Boolean);
  }

  function getRowStats(row) {
    // Только обычные ячейки с оценками, без "ср. балл" и "итог".
    const cells = row.querySelectorAll(
      'div[data-test-component^="markCell-"]:not([data-test-component*="average"]):not([data-test-component*="finalResult"])'
    );

    let gradeCount = 0;
    let absenceCount = 0;

    cells.forEach((cell) => {
      const values = getCellValues(cell);

      values.forEach((val) => {
        if (/^[1-5]$/.test(val)) gradeCount++;
        else if (val.toLowerCase() === "н") absenceCount++;
      });
    });

    return { gradeCount, absenceCount, lessonCount: cells.length };
  }

  // --------------------------------------------------------
  //  Заголовок: 2 строки (делаем ОДИН РАЗ и дальше только обновляем цифру)
  // --------------------------------------------------------
  function ensureTitleStructure(panel) {
    const title = panel.querySelector(".mh-title");
    if (!title) return;

    if (title.querySelector(".mh-title-main")) return; // уже готово

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
    const panel = document.getElementById("mesh-helper-panel");
    if (!panel) return;

    const countEl = panel.querySelector("#mh-problem-count");
    if (!countEl) return;

    countEl.textContent = String(getProblemCount());
  }

  // --------------------------------------------------------
  //  Сканирование журнала
  // --------------------------------------------------------
  function scanJournal() {
    students = [];
    totalLessons = 0;

    clearAllLowGradesHighlights();

    const rows = document.querySelectorAll("tr");

    rows.forEach((row, index) => {
      const fioSpan = row.querySelector("span[title]");
      if (!fioSpan) return;

      const name = fioSpan.getAttribute("title") || getText(fioSpan);
      if (!name) return;

      const anyCell = row.querySelector('div[data-test-component^="markCell-"]');
      if (!anyCell) return;

      const { gradeCount, absenceCount, lessonCount } = getRowStats(row);

      if (lessonCount > 0 && totalLessons === 0) totalLessons = lessonCount;

      const finalEl = row.querySelector('div[data-test-component*="finalResult"] span');
      const hasFinal = !!finalEl && getText(finalEl) !== "";

      const status = gradeCount < config.minGrades ? "low" : "ok";
      setLowGradesHighlight(row, status === "low");

      students.push({
        id: index,
        name,
        gradeCount,
        absenceCount,
        lessonCount,
        hasFinal,
        status,
        rowElement: row,
        absenceRate: 0
      });
    });

    if (totalLessons > 0) {
      students.forEach((s) => {
        if (s.absenceCount > 0) {
          let rate = (s.absenceCount / totalLessons) * 100;
          rate = Math.round(rate * 10) / 10; // 1 знак после запятой
          s.absenceRate = rate;
        } else {
          s.absenceRate = 0;
        }
        s.lessonCount = totalLessons;
      });
    }

    updatePanelList();
  }

  // --------------------------------------------------------
  //  Debounce сканирования
  // --------------------------------------------------------
  function debouncedScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scanJournal, 300);
  }

  // --------------------------------------------------------
  //  Перетаскивание панели мышкой + сохранение позиции
  //  Важно: НЕ разворачиваем панель после drag (через флаг _meshWasDragged)
  // --------------------------------------------------------
  function enablePanelDrag(panel) {
    const header = panel.querySelector(".mh-header") || panel;

    let isDragging = false;
    let wasDragged = false;

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    // восстановление позиции
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
      localStorage.setItem(
        "meshHelperPosition",
        JSON.stringify({ left: rect.left, top: rect.top })
      );

      panel._meshWasDragged = wasDragged;
    });
  }

  // --------------------------------------------------------
  //  Сворачиваемая панель вверх (3D-плашка)
  //  + кликом по шапке в свернутом виде разворачиваем,
  //    но если был drag — НЕ разворачиваем
  // --------------------------------------------------------
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
      if (collapsed) {
        panel.classList.add("mh-collapsed-top");
        btn.textContent = "▼";
      } else {
        panel.classList.remove("mh-collapsed-top");
        btn.textContent = "▲";
      }
      updateProblemCountInTitle(); // цифра всегда актуальная
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

        // если был drag — не открываем
        if (panel._meshWasDragged) {
          panel._meshWasDragged = false;
          return;
        }

        if (!panel.classList.contains("mh-collapsed-top")) return;

        collapsed = false;
        localStorage.setItem("meshHelperCollapsed", "0");
        applyState();
      });
    }
  }

  // --------------------------------------------------------
  //  Создание панели
  // --------------------------------------------------------
  function ensurePanel() {
    let panel = document.getElementById("mesh-helper-panel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "mesh-helper-panel";

    panel.innerHTML = `
      <div class="mh-header">
        <div class="mh-title">Помощник учителя</div>
      </div>

      <div class="mh-section mh-settings">
        <label class="mh-label" for="mh-min">Минимум оценок за период</label>
        <div class="mh-settings-row">
          <input id="mh-min" type="number" min="1">
          <button id="mh-save" type="button">Сохранить</button>
        </div>
      </div>

      <div class="mh-section">
        <div id="mh-summary" class="mh-subtitle">Ученики ниже нормы по оценкам: 0</div>
        <button id="mh-export" class="mh-export" type="button">Экспорт в Excel</button>
        <div id="mh-list" class="mh-list"></div>
      </div>
    `;

    document.body.appendChild(panel);

    // делаем 2 строки в заголовке (один раз)
    ensureTitleStructure(panel);

    const minInput = panel.querySelector("#mh-min");
    minInput.value = config.minGrades;

    panel.querySelector("#mh-save").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const raw = String(minInput.value ?? "").trim();
      const num = Number(raw);

      if (!Number.isFinite(num) || num < 1) {
        minInput.value = config.minGrades;
        return;
      }

      config.minGrades = num;
      chrome.storage.sync.set({ minGrades: num });
      scanJournal();
    });

    panel.querySelector("#mh-export").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      exportAllToCsv();
    });

    panel.querySelector("#mh-list").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-id]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      focusRow(id);
    });

    setupCollapsiblePanel(panel);
    enablePanelDrag(panel);

    return panel;
  }

  // --------------------------------------------------------
  //  Обновление списка в панели
  // --------------------------------------------------------
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

    listEl.innerHTML = problematic
      .map((s) => {
        const rate = s.absenceRate || 0;
        return `
          <div class="mh-item">
            <div class="mh-item-text">
              <div class="mh-name">${escapeHtml(s.name)}</div>
              <div class="mh-count">
                Оценок за период: ${s.gradeCount}<br>
                Н: ${s.absenceCount} (${rate}%)
              </div>
            </div>
            <button class="mh-goto" type="button" data-id="${s.id}">Подсветить</button>
          </div>
        `;
      })
      .join("");

    updateProblemCountInTitle();
  }

  // --------------------------------------------------------
  //  Подсветка строки
  // --------------------------------------------------------
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

  // --------------------------------------------------------
  //  Экспорт в Excel (CSV)
  // --------------------------------------------------------
  function exportAllToCsv() {
    if (!students.length) {
      alert("Нет данных для экспорта.");
      return;
    }

    const header = [
      "ФИО",
      "Количество оценок",
      "Количество Н",
      "Всего уроков",
      "% пропусков",
      "Итог выставлен"
    ];

    const rows = [header];

    students.forEach((s) => {
      const rate = s.absenceRate || 0;
      const rateCell = `="${rate}"`;

      rows.push([
        s.name,
        s.gradeCount,
        s.absenceCount,
        s.lessonCount ?? 0,
        rateCell,
        s.hasFinal ? "Да" : "Нет"
      ]);
    });

    const csv =
      "\uFEFF" + rows.map((r) => r.map(escapeCsvCell).join(";")).join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `mesh_export_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --------------------------------------------------------
  //  CSS-заглушка (основное в panel.css)
  // --------------------------------------------------------
  function injectCSS() {
    if (document.getElementById("mesh-helper-style")) return;

    const s = document.createElement("style");
    s.id = "mesh-helper-style";
    s.textContent = ""; // стили в panel.css
    document.head.appendChild(s);
  }

  // --------------------------------------------------------
  //  Наблюдатель за DOM
  // --------------------------------------------------------
  function startObserver() {
    const root = document.querySelector("#app") || document.body;

    observer = new MutationObserver(debouncedScan);
    observer.observe(root, { childList: true, subtree: true });
  }

  // --------------------------------------------------------
  //  Инициализация
  // --------------------------------------------------------
  function init() {
    injectCSS();

    chrome.storage.sync.get(["minGrades"], ({ minGrades }) => {
      config.minGrades =
        typeof minGrades === "number" ? minGrades : DEFAULT_MIN_GRADES;

      const panel = ensurePanel();
      ensureTitleStructure(panel);

      startObserver();
      scanJournal();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();