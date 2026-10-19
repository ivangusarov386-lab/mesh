// ==========================================================
//  МЭШ – Помощник учителя
//  «Режим администратора» — отдельная выезжающая панель слева от
//  основной (как «Заметки к классу»). Раньше всё это жило инлайн
//  внутри главной панели и там было слишком тесно вместе с «Мой
//  класс»/«Все классы» — вынесено в свой drawer, полностью
//  самодостаточный, как notes-panel.js.
// ==========================================================

(() => {
  if (window.__meshHelperAdminDrawerInstalled) return;
  window.__meshHelperAdminDrawerInstalled = true;

  const DRAWER_ID = "mesh-helper-admin-drawer";
  const TOGGLE_ID = "mh-admin-open";
  const SECTION_ID = "mh-admin-group";

  function isAdminJournalsListPage() {
    return location.pathname.startsWith("/educationmanagement/manage/journals") && !location.pathname.includes("/group");
  }

  function ensureDrawer() {
    let drawer = document.getElementById(DRAWER_ID);
    if (drawer) return drawer;

    drawer = document.createElement("div");
    drawer.id = DRAWER_ID;
    drawer.className = "mhad-drawer";
    drawer.innerHTML = `
      <div class="mhad-header">
        <div class="mhad-title">Режим администратора</div>
        <button class="mhad-close" type="button" aria-label="Закрыть">×</button>
      </div>
      <div class="mh-class-threshold-row"><label for="mhad-min-avg">Проблема при среднем ≤</label><input id="mhad-min-avg" type="number" min="1" max="5" step="0.1"></div>
      <div class="mh-class-threshold-row"><label for="mhad-min-absence">Проблема при пропусках ≥ (%)</label><input id="mhad-min-absence" type="number" min="1" max="100" step="1"></div>
      <div class="mh-class-threshold-row"><label for="mhad-min-grades">Мин. оценок</label><input id="mhad-min-grades" type="number" min="1" step="1"></div>
      <button id="mhad-load-classes" class="mh-class-export-btn" type="button">Загрузить список классов</button>
      <div id="mhad-picker" class="mh-allclasses-picker" style="display:none;">
        <div id="mhad-picker-list" class="mh-allclasses-picker-list"></div>
        <button id="mhad-start-selected" class="mh-class-export-btn" type="button">Собрать выбранные</button>
      </div>
      <button id="mhad-stop" class="mh-class-stop-btn" type="button" style="display:none;">Остановить сбор</button>
      <div class="mh-class-progress-track"><div id="mhad-progress-fill" class="mh-class-progress-fill" style="width:0%"></div></div>
      <div id="mhad-progress-text" class="mh-class-progress-text">0%</div>
      <div id="mhad-status" class="mh-class-status" data-tone="muted">Нажми «Загрузить список классов», отметь нужные и запусти сбор.</div>
      <button id="mhad-download-csv" class="mh-class-export-btn mh-btn-secondary" type="button">Скачать CSV (Отсутствует ДЗ)</button>
      <button id="mhad-download-xlsx" class="mh-class-export-btn mh-btn-secondary" type="button">Скачать Excel</button>
    `;
    document.body.appendChild(drawer);

    drawer.querySelector(".mhad-close").addEventListener("click", closeDrawer);
    setupThresholdInput(drawer, "mhad-min-avg", "classProblemAvg", 3);
    setupThresholdInput(drawer, "mhad-min-absence", "classAbsencePercent", 50);
    setupThresholdInput(drawer, "mhad-min-grades", "minGrades", 5);
    setupLoadClasses(drawer);
    setupStartSelected(drawer);
    setupStop(drawer);
    setupDownloads(drawer);
    [...drawer.querySelectorAll("input")].forEach((input) => {
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventName) => {
        input.addEventListener(eventName, (e) => e.stopPropagation());
      });
    });

    return drawer;
  }

  // Пороговые настройки — те же ключи chrome.storage.sync, что уже
  // используются в «Мой класс»/«Все классы» (АЗ-риск) и «Минимум
  // оценок» наверху панели: значение, выставленное там, подхватывается
  // и тут, просто без постоянной двусторонней синхронизации в реальном
  // времени (drawer и основная панель не видны одновременно) — вместо
  // этого подгружаем актуальное значение заново при каждом открытии.
  function setupThresholdInput(drawer, inputId, storageKey, defaultValue) {
    const input = drawer.querySelector(`#${inputId}`);
    if (!input) return;
    input.addEventListener("change", () => {
      const value = Number(input.value);
      const normalized = Number.isFinite(value) && value > 0 ? value : defaultValue;
      chrome.storage.sync.set({ [storageKey]: normalized });
    });
  }

  async function loadThresholds(drawer) {
    const data = await new Promise((resolve) => chrome.storage.sync.get(["classProblemAvg", "classAbsencePercent", "minGrades"], resolve));
    const avgInput = drawer.querySelector("#mhad-min-avg");
    const absenceInput = drawer.querySelector("#mhad-min-absence");
    const gradesInput = drawer.querySelector("#mhad-min-grades");
    if (avgInput) avgInput.value = typeof data.classProblemAvg === "number" ? data.classProblemAvg : 3;
    if (absenceInput) absenceInput.value = typeof data.classAbsencePercent === "number" ? data.classAbsencePercent : 50;
    if (gradesInput) gradesInput.value = typeof data.minGrades === "number" ? data.minGrades : 5;
  }

  function setStatus(drawer, message, tone) {
    const status = drawer.querySelector("#mhad-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function setProgress(drawer, percent) {
    const fill = drawer.querySelector("#mhad-progress-fill");
    const text = drawer.querySelector("#mhad-progress-text");
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
  }

  function hidePicker(drawer) {
    const picker = drawer.querySelector("#mhad-picker");
    if (picker) picker.style.display = "none";
    const list = drawer.querySelector("#mhad-picker-list");
    if (list) list.innerHTML = "";
  }

  function renderPicker(drawer, classes) {
    const picker = drawer.querySelector("#mhad-picker");
    const list = drawer.querySelector("#mhad-picker-list");
    if (!picker || !list) return;
    if (!classes.length) {
      setStatus(drawer, "Классы не найдены.", "warn");
      hidePicker(drawer);
      return;
    }
    list.innerHTML = "";

    const groups = new Map();
    classes.forEach((cls, index) => {
      const key = String(cls.parallel);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ cls, index });
    });

    const sortedKeys = [...groups.keys()].sort((a, b) => Number(a) - Number(b));

    sortedKeys.forEach((key) => {
      const items = groups.get(key);
      const groupEl = document.createElement("div");
      groupEl.className = "mh-allclasses-picker-group";

      const headerRow = document.createElement("div");
      headerRow.className = "mh-admin-group-header-row";

      const headerEl = document.createElement("label");
      headerEl.className = "mh-allclasses-picker-group-header";
      const headerCheckbox = document.createElement("input");
      headerCheckbox.type = "checkbox";
      const headerSpan = document.createElement("span");
      headerSpan.textContent = `${key} параллель (${items.length})`;
      headerEl.appendChild(headerCheckbox);
      headerEl.appendChild(headerSpan);

      const arrowBtn = document.createElement("button");
      arrowBtn.type = "button";
      arrowBtn.className = "mh-admin-group-arrow";
      arrowBtn.setAttribute("aria-label", "Развернуть/свернуть параллель");
      arrowBtn.textContent = "▸";

      headerRow.appendChild(headerEl);
      headerRow.appendChild(arrowBtn);
      groupEl.appendChild(headerRow);

      const rowsWrap = document.createElement("div");
      rowsWrap.className = "mh-admin-group-rows";
      rowsWrap.style.display = "none";
      groupEl.appendChild(rowsWrap);

      let expanded = false;
      arrowBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        expanded = !expanded;
        rowsWrap.style.display = expanded ? "grid" : "none";
        arrowBtn.textContent = expanded ? "▾" : "▸";
      });

      const rowCheckboxes = [];
      items.forEach(({ cls, index }) => {
        const row = document.createElement("label");
        row.className = "mh-allclasses-picker-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.mhIndex = String(index);
        const span = document.createElement("span");
        span.textContent = cls.label || "?";
        row.appendChild(checkbox);
        row.appendChild(span);
        rowsWrap.appendChild(row);
        rowCheckboxes.push(checkbox);
      });

      headerCheckbox.addEventListener("change", () => {
        rowCheckboxes.forEach((cb) => { cb.checked = headerCheckbox.checked; });
      });
      rowCheckboxes.forEach((cb) => {
        cb.addEventListener("change", () => {
          headerCheckbox.checked = rowCheckboxes.length > 0 && rowCheckboxes.every((c) => c.checked);
        });
      });

      list.appendChild(groupEl);
    });

    picker.dataset.classes = JSON.stringify(classes);
    picker.style.display = "block";
    setStatus(drawer, `Найдено классов: ${classes.length}. Отметь нужные и нажми «Собрать выбранные».`, "muted");
  }

  function setupLoadClasses(drawer) {
    const btn = drawer.querySelector("#mhad-load-classes");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      if (!collector) {
        setStatus(drawer, "Модуль admin-collector.js не загружен. Обновите страницу.", "warn");
        return;
      }
      btn.disabled = true;
      hidePicker(drawer);
      setStatus(drawer, "Загружаем список классов по всем параллелям — это может занять минуту...", "muted");
      try {
        const classes = await collector.listAllClasses();
        renderPicker(drawer, classes);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function setupStartSelected(drawer) {
    const btn = drawer.querySelector("#mhad-start-selected");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      const picker = drawer.querySelector("#mhad-picker");
      if (!collector || !picker) return;
      let classes = [];
      try {
        classes = JSON.parse(picker.dataset.classes || "[]");
      } catch (err) {
        classes = [];
      }
      const checkedIndexes = [...drawer.querySelectorAll("#mhad-picker-list input[type=checkbox]:checked")]
        .map((input) => Number(input.dataset.mhIndex))
        .filter((n) => Number.isFinite(n));
      const selected = classes.filter((cls, index) => checkedIndexes.includes(index));
      if (!selected.length) {
        setStatus(drawer, "Отметь хотя бы один класс.", "warn");
        return;
      }
      hidePicker(drawer);
      setStatus(drawer, "Запускаем сбор в фоновой вкладке...", "muted");
      const result = await collector.collectMissingHomeworkForSelectedClasses(selected);
      if (!result?.ok) {
        setStatus(drawer, "Не удалось запустить сбор.", "warn");
      } else {
        setStatus(drawer, `Сбор запущен (${result.total} журналов) в фоновой вкладке — можно продолжать работать здесь.`, "muted");
        refreshState(drawer);
      }
    });
  }

  function setupStop(drawer) {
    const btn = drawer.querySelector("#mhad-stop");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      if (!collector) return;
      await collector.stopAdminBatch();
      refreshState(drawer);
    });
  }

  function setupDownloads(drawer) {
    const csvBtn = drawer.querySelector("#mhad-download-csv");
    const xlsxBtn = drawer.querySelector("#mhad-download-xlsx");
    if (csvBtn) {
      csvBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
        if (!collector) return;
        const result = await collector.downloadMissingHomeworkResultsCsv();
        if (!result?.ok) setStatus(drawer, "Нечего выгружать — сначала запустите сбор.", "warn");
      });
    }
    if (xlsxBtn) {
      xlsxBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
        if (!collector) return;
        const result = await collector.downloadAdminParallelWorkbook();
        if (!result?.ok) setStatus(drawer, "Нечего выгружать — сначала запустите сбор.", "warn");
      });
    }
  }

  function refreshState(drawer) {
    const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
    if (!collector) return;
    collector.getAdminBatchState().then((batch) => {
      const stopBtn = drawer.querySelector("#mhad-stop");
      if (!batch) {
        if (stopBtn) stopBtn.style.display = "none";
        return;
      }
      if (stopBtn) stopBtn.style.display = batch.status === "running" ? "block" : "none";
      if (batch.status === "running") {
        const percent = batch.queue.length ? Math.round((batch.currentIndex / batch.queue.length) * 100) : 0;
        setProgress(drawer, percent);
        setStatus(drawer, `Собрано ${batch.currentIndex} из ${batch.queue.length} журналов — идёт в фоновой вкладке.`, "muted");
      } else if (batch.status === "done") {
        setProgress(drawer, 100);
        setStatus(drawer, `Готово: собрано ${batch.queue.length} журналов. Можно скачивать.`, "ok");
      } else if (batch.status === "error") {
        setProgress(drawer, 100);
        setStatus(drawer, batch.errorMessage || "Произошла ошибка сбора.", "warn");
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.meshHelperAdminBatch) return;
    const drawer = document.getElementById(DRAWER_ID);
    if (drawer) refreshState(drawer);
  });

  function positionDrawer(drawer) {
    const panel = document.getElementById("mesh-helper-panel");
    const width = drawer.offsetWidth || 360;
    if (!panel) {
      drawer.style.right = "300px";
      drawer.style.top = "0";
      drawer.style.height = "100vh";
      return;
    }
    const rect = panel.getBoundingClientRect();
    const left = Math.max(rect.left - width - 8, 8);
    drawer.style.left = `${left}px`;
    drawer.style.right = "auto";
    drawer.style.top = `${Math.max(rect.top, 0)}px`;
    drawer.style.height = `${Math.min(rect.height, window.innerHeight)}px`;
  }

  async function openDrawer() {
    const drawer = ensureDrawer();
    drawer.classList.add("mhad-open");
    positionDrawer(drawer);
    await loadThresholds(drawer);
    refreshState(drawer);
  }

  function closeDrawer() {
    const drawer = document.getElementById(DRAWER_ID);
    if (drawer) drawer.classList.remove("mhad-open");
  }

  function toggleDrawer() {
    const drawer = document.getElementById(DRAWER_ID);
    if (drawer && drawer.classList.contains("mhad-open")) closeDrawer();
    else openDrawer();
  }

  function ensureToggleButton() {
    const panel = document.getElementById("mesh-helper-panel");
    if (!panel) return false;
    const section = panel.querySelector(`#${SECTION_ID}`);
    const btn = panel.querySelector(`#${TOGGLE_ID}`);
    if (!section || !btn) return false;
    section.style.display = isAdminJournalsListPage() ? "block" : "none";
    if (btn.dataset.mhadReady === "1") return true;
    btn.dataset.mhadReady = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    });
    return true;
  }

  // Периодически перепроверяем и наличие кнопки (панель может ещё не быть
  // отрисована при первом запуске), и видимость секции (вдруг пользователь
  // перешёл со страницы журналов на другую без полной перезагрузки).
  function tryEnsureButton() {
    ensureToggleButton();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tryEnsureButton, { once: true });
  else tryEnsureButton();
  setInterval(tryEnsureButton, 1000);
})();
