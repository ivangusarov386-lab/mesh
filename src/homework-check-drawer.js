// ==========================================================
//  МЭШ – Помощник учителя
//  «Отсутствует ДЗ» — своя выезжающая панель, отдельная от «Режима
//  администратора» (admin-drawer.js) и «Проверки итогов»
//  (finals-check-drawer.js). Самый лёгкий из трёх сборов — не ждёт
//  марки/учеников/посещаемость/итоги, только расписание и
//  homework_absences, которые реально нужны для этой проверки.
// ==========================================================

(() => {
  if (window.__meshHelperHomeworkDrawerInstalled) return;
  window.__meshHelperHomeworkDrawerInstalled = true;

  const DRAWER_ID = "mesh-helper-homework-drawer";
  const TOGGLE_ID = "mh-homework-open";
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
        <div class="mhad-title">Отсутствует ДЗ</div>
        <button class="mhad-close" type="button" aria-label="Закрыть">×</button>
      </div>
      <div class="mhn-subtitle">Только даты без домашнего задания по выбранным классам — отдельно от общего сбора, самый быстрый из трёх.</div>
      <button id="mhwd-load-classes" class="mh-class-export-btn" type="button">Загрузить список классов</button>
      <div id="mhwd-picker" class="mh-allclasses-picker" style="display:none;">
        <div id="mhwd-picker-list" class="mh-allclasses-picker-list"></div>
        <button id="mhwd-start-selected" class="mh-class-export-btn" type="button">Собрать</button>
      </div>
      <button id="mhwd-stop" class="mh-class-stop-btn" type="button" style="display:none;">Остановить сбор</button>
      <div class="mh-class-progress-track"><div id="mhwd-progress-fill" class="mh-class-progress-fill" style="width:0%"></div></div>
      <div id="mhwd-progress-text" class="mh-class-progress-text">0%</div>
      <div id="mhwd-status" class="mh-class-status" data-tone="muted">Нажми «Загрузить список классов», отметь нужные и запусти сбор.</div>
      <button id="mhwd-download" class="mh-class-export-btn mh-btn-secondary" type="button">Скачать CSV (Отсутствует ДЗ)</button>
    `;
    document.body.appendChild(drawer);

    drawer.querySelector(".mhad-close").addEventListener("click", closeDrawer);
    setupLoadClasses(drawer);
    setupStartSelected(drawer);
    setupStop(drawer);
    setupDownload(drawer);
    [...drawer.querySelectorAll("input")].forEach((input) => {
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventName) => {
        input.addEventListener(eventName, (e) => e.stopPropagation());
      });
    });

    return drawer;
  }

  function setStatus(drawer, message, tone) {
    const status = drawer.querySelector("#mhwd-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function setProgress(drawer, percent) {
    const fill = drawer.querySelector("#mhwd-progress-fill");
    const text = drawer.querySelector("#mhwd-progress-text");
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
  }

  function hidePicker(drawer) {
    const picker = drawer.querySelector("#mhwd-picker");
    if (picker) picker.style.display = "none";
    const list = drawer.querySelector("#mhwd-picker-list");
    if (list) list.innerHTML = "";
  }

  function renderPicker(drawer, classes) {
    const picker = drawer.querySelector("#mhwd-picker");
    const list = drawer.querySelector("#mhwd-picker-list");
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
    setStatus(drawer, `Найдено классов: ${classes.length}. Отметь нужные и нажми «Собрать».`, "muted");
  }

  function setupLoadClasses(drawer) {
    const btn = drawer.querySelector("#mhwd-load-classes");
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
    const btn = drawer.querySelector("#mhwd-start-selected");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      const picker = drawer.querySelector("#mhwd-picker");
      if (!collector || !picker) return;
      let classes = [];
      try {
        classes = JSON.parse(picker.dataset.classes || "[]");
      } catch (err) {
        classes = [];
      }
      const checkedIndexes = [...drawer.querySelectorAll("#mhwd-picker-list input[type=checkbox]:checked")]
        .map((input) => Number(input.dataset.mhIndex))
        .filter((n) => Number.isFinite(n));
      const selected = classes.filter((cls, index) => checkedIndexes.includes(index));
      if (!selected.length) {
        setStatus(drawer, "Отметь хотя бы один класс.", "warn");
        return;
      }
      hidePicker(drawer);
      setStatus(drawer, "Запускаем сбор в фоновой вкладке...", "muted");
      const result = await collector.collectMissingHomeworkOnlyForSelectedClasses(selected);
      if (!result?.ok) {
        setStatus(drawer, "Не удалось запустить сбор.", "warn");
      } else {
        setStatus(drawer, `Сбор запущен (${result.total} журналов) в фоновой вкладке — можно продолжать работать здесь.`, "muted");
        refreshState(drawer);
      }
    });
  }

  function setupStop(drawer) {
    const btn = drawer.querySelector("#mhwd-stop");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      if (!collector) return;
      await collector.stopAdminHomeworkBatch();
      refreshState(drawer);
    });
  }

  function setupDownload(drawer) {
    const btn = drawer.querySelector("#mhwd-download");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      if (!collector) return;
      const result = await collector.downloadMissingHomeworkOnlyResultsCsv();
      if (!result?.ok) setStatus(drawer, "Нечего выгружать — сначала запустите сбор.", "warn");
    });
  }

  function refreshState(drawer) {
    const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
    if (!collector) return;
    collector.getAdminHomeworkBatchState().then((batch) => {
      const stopBtn = drawer.querySelector("#mhwd-stop");
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
    if (area !== "local" || !changes.meshHelperAdminHomeworkBatch) return;
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
    if (btn.dataset.mhwdReady === "1") return true;
    btn.dataset.mhwdReady = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    });
    return true;
  }

  function tryEnsureButton() {
    ensureToggleButton();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tryEnsureButton, { once: true });
  else tryEnsureButton();
  setInterval(tryEnsureButton, 1000);
})();
