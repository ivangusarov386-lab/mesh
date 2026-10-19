// ==========================================================
//  МЭШ – Помощник учителя
//  «Проверка итогов» — своя выезжающая панель, отдельная от
//  «Режима администратора» (admin-drawer.js). Два разных сбора —
//  две разные кнопки, два разных drawer'а: не делят между собой ни
//  пикер классов, ни прогресс, ни статус.
// ==========================================================

(() => {
  if (window.__meshHelperFinalsDrawerInstalled) return;
  window.__meshHelperFinalsDrawerInstalled = true;

  const DRAWER_ID = "mesh-helper-finals-drawer";
  const TOGGLE_ID = "mh-finals-open";
  const SECTION_ID = "mh-admin-group";

  const DEFAULT_FINAL_GRADE_RANGES = {
    2: { from: 1, to: 2.59 },
    3: { from: 2.6, to: 3.59 },
    4: { from: 3.6, to: 4.59 },
    5: { from: 4.6, to: 5 }
  };

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
        <div class="mhad-title">Проверка итогов</div>
        <button class="mhad-close" type="button" aria-label="Закрыть">×</button>
      </div>
      <div class="mhn-subtitle">Текущие оценки, средний балл и итоги за период/год по выбранным классам — отдельно от общего сбора, без лишнего ожидания.</div>
      <div class="mh-final-criteria">
        <div class="mh-final-criteria-title">Критерии округления итоговой (по ним в СВОДе определяется «итог не совпадает с расчётным»)</div>
        <div class="mh-final-periods-row"><label for="mhfd-academic-periods" class="mh-final-grade-label">Учебных периодов в году</label><select id="mhfd-academic-periods"><option value="4">4 (четверти)</option><option value="3">3 (триместры)</option><option value="2">2 (полугодия)</option></select></div>
        <div class="mh-final-criteria-row"><span class="mh-final-grade-label">Оценка 2</span><input class="mh-final-from" data-grade="2" type="number" step="0.01" min="1" max="5"><span class="mh-final-dash">—</span><input class="mh-final-to" data-grade="2" type="number" step="0.01" min="1" max="5"></div>
        <div class="mh-final-criteria-row"><span class="mh-final-grade-label">Оценка 3</span><input class="mh-final-from" data-grade="3" type="number" step="0.01" min="1" max="5"><span class="mh-final-dash">—</span><input class="mh-final-to" data-grade="3" type="number" step="0.01" min="1" max="5"></div>
        <div class="mh-final-criteria-row"><span class="mh-final-grade-label">Оценка 4</span><input class="mh-final-from" data-grade="4" type="number" step="0.01" min="1" max="5"><span class="mh-final-dash">—</span><input class="mh-final-to" data-grade="4" type="number" step="0.01" min="1" max="5"></div>
        <div class="mh-final-criteria-row"><span class="mh-final-grade-label">Оценка 5</span><input class="mh-final-from" data-grade="5" type="number" step="0.01" min="1" max="5"><span class="mh-final-dash">—</span><input class="mh-final-to" data-grade="5" type="number" step="0.01" min="1" max="5"></div>
        <button id="mhfd-final-criteria-save" class="mh-class-export-btn mh-btn-secondary" type="button">Сохранить критерии</button>
        <div id="mhfd-final-criteria-status" class="mh-class-status" data-tone="muted"></div>
      </div>
      <button id="mhfd-load-classes" class="mh-class-export-btn" type="button">Загрузить список классов</button>
      <div id="mhfd-picker" class="mh-allclasses-picker" style="display:none;">
        <div id="mhfd-picker-list" class="mh-allclasses-picker-list"></div>
        <button id="mhfd-start-selected" class="mh-class-export-btn" type="button">Собрать</button>
      </div>
      <button id="mhfd-stop" class="mh-class-stop-btn" type="button" style="display:none;">Остановить сбор</button>
      <div class="mh-class-progress-track"><div id="mhfd-progress-fill" class="mh-class-progress-fill" style="width:0%"></div></div>
      <div id="mhfd-progress-text" class="mh-class-progress-text">0%</div>
      <div id="mhfd-status" class="mh-class-status" data-tone="muted">Нажми «Загрузить список классов», отметь нужные и запусти сбор.</div>
      <button id="mhfd-download" class="mh-class-export-btn mh-btn-secondary" type="button">Скачать Excel (Проверка итогов)</button>
    `;
    document.body.appendChild(drawer);

    drawer.querySelector(".mhad-close").addEventListener("click", closeDrawer);
    setupFinalCriteria(drawer);
    setupLoadClasses(drawer);
    setupStartSelected(drawer);
    setupStop(drawer);
    setupDownload(drawer);
    [...drawer.querySelectorAll("input, select")].forEach((input) => {
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventName) => {
        input.addEventListener(eventName, (e) => e.stopPropagation());
      });
    });

    return drawer;
  }

  // Та же логика и те же chrome.storage.sync-ключи (finalGradeRanges/
  // academicPeriodsCount), что и у «Критериев округления итоговой» в
  // основной панели («Проверка оценок» → «Проверка итогов») — настройка
  // общая, просто теперь редактируется и отсюда тоже, раз именно эта
  // выгрузка использует её для подсветки проблем в СВОДе.
  function setupFinalCriteria(drawer) {
    const box = drawer.querySelector(".mh-final-criteria");
    const periodsSelect = drawer.querySelector("#mhfd-academic-periods");
    const saveBtn = drawer.querySelector("#mhfd-final-criteria-save");
    const status = drawer.querySelector("#mhfd-final-criteria-status");
    if (!box) return;

    chrome.storage.sync.get(["finalGradeRanges", "academicPeriodsCount"], (data) => {
      const ranges = data.finalGradeRanges || DEFAULT_FINAL_GRADE_RANGES;
      [2, 3, 4, 5].forEach((grade) => {
        const range = ranges[grade] || DEFAULT_FINAL_GRADE_RANGES[grade];
        const fromInput = box.querySelector(`.mh-final-from[data-grade="${grade}"]`);
        const toInput = box.querySelector(`.mh-final-to[data-grade="${grade}"]`);
        if (fromInput) fromInput.value = range.from;
        if (toInput) toInput.value = range.to;
      });
      if (periodsSelect) periodsSelect.value = [2, 3, 4].includes(data.academicPeriodsCount) ? data.academicPeriodsCount : 4;
    });

    if (saveBtn) {
      saveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ranges = {};
        [2, 3, 4, 5].forEach((grade) => {
          const fromInput = box.querySelector(`.mh-final-from[data-grade="${grade}"]`);
          const toInput = box.querySelector(`.mh-final-to[data-grade="${grade}"]`);
          const from = Number(fromInput?.value);
          const to = Number(toInput?.value);
          ranges[grade] = {
            from: Number.isFinite(from) ? from : DEFAULT_FINAL_GRADE_RANGES[grade].from,
            to: Number.isFinite(to) ? to : DEFAULT_FINAL_GRADE_RANGES[grade].to
          };
        });
        const periodsValue = Number(periodsSelect?.value);
        const periodsCount = [2, 3, 4].includes(periodsValue) ? periodsValue : 4;
        chrome.storage.sync.set({ finalGradeRanges: ranges, academicPeriodsCount: periodsCount }, () => {
          if (status) {
            status.textContent = "Критерии сохранены.";
            status.dataset.tone = "ok";
          }
        });
      });
    }
  }

  function setStatus(drawer, message, tone) {
    const status = drawer.querySelector("#mhfd-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function setProgress(drawer, percent) {
    const fill = drawer.querySelector("#mhfd-progress-fill");
    const text = drawer.querySelector("#mhfd-progress-text");
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
  }

  function hidePicker(drawer) {
    const picker = drawer.querySelector("#mhfd-picker");
    if (picker) picker.style.display = "none";
    const list = drawer.querySelector("#mhfd-picker-list");
    if (list) list.innerHTML = "";
  }

  function renderPicker(drawer, classes) {
    const picker = drawer.querySelector("#mhfd-picker");
    const list = drawer.querySelector("#mhfd-picker-list");
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
    const btn = drawer.querySelector("#mhfd-load-classes");
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
    const btn = drawer.querySelector("#mhfd-start-selected");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      const picker = drawer.querySelector("#mhfd-picker");
      if (!collector || !picker) return;
      let classes = [];
      try {
        classes = JSON.parse(picker.dataset.classes || "[]");
      } catch (err) {
        classes = [];
      }
      const checkedIndexes = [...drawer.querySelectorAll("#mhfd-picker-list input[type=checkbox]:checked")]
        .map((input) => Number(input.dataset.mhIndex))
        .filter((n) => Number.isFinite(n));
      const selected = classes.filter((cls, index) => checkedIndexes.includes(index));
      if (!selected.length) {
        setStatus(drawer, "Отметь хотя бы один класс.", "warn");
        return;
      }
      hidePicker(drawer);
      setStatus(drawer, "Запускаем сбор в фоновой вкладке...", "muted");
      const result = await collector.collectFinalGradesForSelectedClasses(selected);
      if (!result?.ok) {
        setStatus(drawer, "Не удалось запустить сбор.", "warn");
      } else {
        setStatus(drawer, `Сбор запущен (${result.total} журналов) в фоновой вкладке — можно продолжать работать здесь.`, "muted");
        refreshState(drawer);
      }
    });
  }

  function setupStop(drawer) {
    const btn = drawer.querySelector("#mhfd-stop");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      if (!collector) return;
      await collector.stopAdminFinalsBatch();
      refreshState(drawer);
    });
  }

  function setupDownload(drawer) {
    const btn = drawer.querySelector("#mhfd-download");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      if (!collector) return;
      const result = await collector.downloadFinalGradesWorkbook();
      if (!result?.ok) setStatus(drawer, "Нечего выгружать — сначала запустите сбор.", "warn");
    });
  }

  function refreshState(drawer) {
    const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
    if (!collector) return;
    collector.getAdminFinalsBatchState().then((batch) => {
      const stopBtn = drawer.querySelector("#mhfd-stop");
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
    if (area !== "local" || !changes.meshHelperAdminFinalsBatch) return;
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
    window.dispatchEvent(new CustomEvent("mesh-helper-drawer-opened", { detail: { id: DRAWER_ID } }));
  }

  function closeDrawer() {
    const drawer = document.getElementById(DRAWER_ID);
    if (drawer) drawer.classList.remove("mhad-open");
  }

  // См. admin-drawer.js — drawer'ы независимы, но координируют взаимное
  // закрытие через DOM-событие, чтобы не накладываться друг на друга.
  window.addEventListener("mesh-helper-drawer-opened", (e) => {
    if (e.detail && e.detail.id !== DRAWER_ID) closeDrawer();
  });

  // Сворачивание основной панели в "таблетку" должно закрывать и этот
  // drawer — иначе он остаётся висеть поверх свёрнутой панели.
  window.addEventListener("mesh-helper-panel-collapsed", closeDrawer);

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
    if (btn.dataset.mhfdReady === "1") return true;
    btn.dataset.mhfdReady = "1";
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
