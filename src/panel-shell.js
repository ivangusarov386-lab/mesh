(() => {
  const DEFAULT_MIN = 5;
  const DEFAULT_CLASS_PROBLEM_AVG = 3;
  const DEFAULT_CLASS_ABSENCE_PERCENT = 50;
  const DEFAULT_FINAL_GRADE_RANGES = {
    2: { from: 1, to: 2.59 },
    3: { from: 2.6, to: 3.59 },
    4: { from: 3.6, to: 4.59 },
    5: { from: 4.6, to: 5 }
  };
  const PANEL_ID = "mesh-helper-panel";
  const MINI_MIN_ID = "mh-mini-min";
  const CHECKS_OPEN_KEY = "meshHelperChecksOpen";
  const PENDING_PER_STUDENT_ZIP_KEY = "meshHelperPendingPerStudentZip";
  let panelAttempts = 0;
  let minSaveTimer = null;
  const thresholdSaveTimers = {};
  let batchStorageListenerReady = false;

  function getPendingPerStudentZip() {
    return new Promise((resolve) => chrome.storage.local.get(PENDING_PER_STUDENT_ZIP_KEY, (data) => resolve(!!data?.[PENDING_PER_STUDENT_ZIP_KEY])));
  }

  function setPendingPerStudentZip(value) {
    return new Promise((resolve) => {
      if (value) chrome.storage.local.set({ [PENDING_PER_STUDENT_ZIP_KEY]: true }, resolve);
      else chrome.storage.local.remove(PENDING_PER_STUDENT_ZIP_KEY, resolve);
    });
  }

  async function runPendingPerStudentZipIfReady(panel) {
    const pending = await getPendingPerStudentZip();
    if (!pending) return;
    const loader = window.__MESH_HELPER_CLASS_AUTO_LOADER__;
    if (!loader) return;
    const batch = await loader.getResults();
    if (!batch || batch.exportKind === "subject") return;
    if (batch.status !== "done") return;
    await setPendingPerStudentZip(false);
    const result = await loader.exportPerStudentZip();
    if (!result?.ok) {
      setClassStatus(panel, "Не удалось собрать файлы по ученикам.", "warn");
    } else {
      setClassStatus(panel, `Готово: ${result.students} файлов по ученикам в архиве.`, "ok");
    }
  }

  function setupBatchStorageListener() {
    if (batchStorageListenerReady) return;
    batchStorageListenerReady = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const panel = document.getElementById(PANEL_ID);
      if (!panel) return;
      if (changes.meshHelperClassBatch) {
        refreshClassExportLabel(panel);
        refreshAllClassesExportLabel(panel);
        runPendingPerStudentZipIfReady(panel);
      }
      if (changes.meshHelperAdminBatch || changes.meshHelperAdminFinalsBatch) refreshAdminExportLabel(panel);
    });
  }

  function ensureTitle(panel) {
    const title = panel.querySelector(".mh-title");
    if (!title || title.querySelector(".mh-title-main")) return;
    title.innerHTML = '<div class="mh-title-main">Помощник учителя</div><div class="mh-title-sub">Проблемных: <span id="mh-problem-count">0</span></div>';
  }

  function syncMiniMin(panel, value) {
    const mini = panel.querySelector(`#${MINI_MIN_ID}`);
    const min = panel.querySelector("#mh-min");
    const adminMin = panel.querySelector("#mh-admin-min-grades");
    if (mini && String(mini.value) !== String(value)) mini.value = value;
    if (min && String(min.value) !== String(value)) min.value = value;
    if (adminMin && String(adminMin.value) !== String(value)) adminMin.value = value;
  }

  function normalizeMin(rawValue) {
    const n = Number(rawValue || DEFAULT_MIN);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MIN;
  }

  function notifyMinChanged() {
    window.dispatchEvent(new CustomEvent("mesh-helper-min-grades-changed"));
    setTimeout(() => window.dispatchEvent(new CustomEvent("mesh-helper-min-grades-changed")), 120);
  }

  function notifyFinalsState(finals, correctFinals) {
    window.dispatchEvent(new CustomEvent("mesh-helper-finals-toggle", { detail: { enabled: finals?.checked === true } }));
    window.dispatchEvent(new CustomEvent("mesh-helper-correct-finals-toggle", { detail: { enabled: correctFinals?.checked === true } }));
  }

  function saveMin(panel, rawValue) {
    const value = normalizeMin(rawValue);
    syncMiniMin(panel, value);
    clearTimeout(minSaveTimer);
    minSaveTimer = setTimeout(() => chrome.storage.sync.set({ minGrades: value }), 120);
    notifyMinChanged();
  }

  function ensureMiniMin(panel) {
    const header = panel.querySelector(".mh-header") || panel;
    if (header.querySelector(`#${MINI_MIN_ID}`)) return;
    const wrap = document.createElement("div");
    wrap.className = "mh-mini-min-wrap";
    wrap.innerHTML = `<span class="mh-mini-min-label">Мин</span><input id="${MINI_MIN_ID}" class="mh-mini-min" type="number" min="1" max="20" title="Минимум оценок">`;
    header.insertBefore(wrap, header.firstChild);
    const mini = wrap.querySelector(`#${MINI_MIN_ID}`);
    ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventName) => {
      mini.addEventListener(eventName, (e) => e.stopPropagation());
      wrap.addEventListener(eventName, (e) => e.stopPropagation());
    });
    mini.addEventListener("input", () => saveMin(panel, mini.value));
    mini.addEventListener("change", () => saveMin(panel, mini.value));
    mini.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        saveMin(panel, mini.value);
        mini.blur();
      }
    });
  }

  function setupCollapse(panel) {
    if (panel.querySelector(".mh-collapse-btn")) return;
    const header = panel.querySelector(".mh-header") || panel;
    const btn = document.createElement("button");
    btn.className = "mh-collapse-btn";
    btn.type = "button";
    header.appendChild(btn);
    let collapsed = localStorage.getItem("meshHelperCollapsed") === "1";
    const apply = () => {
      panel.classList.toggle("mh-collapsed-top", collapsed);
      btn.textContent = collapsed ? "▼" : "▲";
    };
    apply();
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      collapsed = !collapsed;
      localStorage.setItem("meshHelperCollapsed", collapsed ? "1" : "0");
      apply();
    });
  }

  // ---- Плавное раскрытие/закрытие аккордеон-секций через max-height. ----
  // ---- Готовое "auto" значение не анимируется, а фиксированная цифра ----
  // ---- "на глаз" обрезала бы длинные списки (например, список учеников ----
  // ---- с проблемами) — поэтому высота меряется в моменте (scrollHeight), ----
  // ---- а после открытия снимается ограничение (max-height: none), чтобы ----
  // ---- контент мог дальше меняться (догружаться/перестраиваться) без ----
  // ---- обрезки уже открытой секции. ----
  function setMenuExpanded(menu, open, animate = true) {
    if (!menu) return;
    if (!animate) {
      menu.style.transition = "none";
      menu.style.maxHeight = open ? "none" : "0px";
      void menu.offsetHeight;
      menu.style.transition = "";
      menu.dataset.mhWantOpen = open ? "1" : "0";
      return;
    }
    menu.dataset.mhWantOpen = open ? "1" : "0";
    if (open) {
      menu.style.maxHeight = `${menu.scrollHeight}px`;
      // Несколько свойств (max-height/margin-top/padding) анимируются
      // одновременно и каждое шлёт свой transitionend — с {once:true}
      // слушатель мог бы снять себя на ПЕРВОМ из них (например margin-top)
      // и max-height так и остался бы зажат числом вместо "none". Поэтому
      // снимаем слушатель сами и только после события именно max-height.
      menu.addEventListener("transitionend", function onEnd(e) {
        if (e.propertyName !== "max-height") return;
        menu.removeEventListener("transitionend", onEnd);
        if (menu.dataset.mhWantOpen === "1") menu.style.maxHeight = "none";
      });
    } else {
      menu.style.maxHeight = `${menu.scrollHeight}px`;
      void menu.offsetHeight;
      requestAnimationFrame(() => {
        if (menu.dataset.mhWantOpen === "0") menu.style.maxHeight = "0px";
      });
    }
  }

  function setupChecksMenu(panel) {
    const toggle = panel.querySelector("#mh-checks-toggle");
    const menu = panel.querySelector(".mh-checks-menu");
    const arrow = panel.querySelector(".mh-checks-arrow");
    const help = panel.querySelector("#mh-checks-help");
    if (!toggle || !menu || toggle.dataset.ready === "1") return;
    toggle.dataset.ready = "1";
    let open = localStorage.getItem(CHECKS_OPEN_KEY) === "1";
    const apply = (animate) => {
      panel.classList.toggle("mh-checks-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (arrow) arrow.textContent = open ? "▲" : "▼";
      setMenuExpanded(menu, open, animate);
    };
    apply(false);
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      open = !open;
      localStorage.setItem(CHECKS_OPEN_KEY, open ? "1" : "0");
      apply(true);
    });
    if (help) {
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventName) => {
        help.addEventListener(eventName, (e) => e.stopPropagation());
      });
    }
  }

  const RESULTS_OPEN_KEY = "meshHelperResultsOpen";

  function setupResultsToggle(panel) {
    const toggle = panel.querySelector("#mh-results-toggle");
    const menu = panel.querySelector(".mh-results-menu");
    const arrow = toggle?.querySelector(".mh-checks-arrow");
    if (!toggle || !menu || toggle.dataset.ready === "1") return;
    toggle.dataset.ready = "1";
    let open = localStorage.getItem(RESULTS_OPEN_KEY) === "1";
    const apply = (animate) => {
      panel.classList.toggle("mh-results-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (arrow) arrow.textContent = open ? "▲" : "▼";
      setMenuExpanded(menu, open, animate);
    };
    apply(false);
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      open = !open;
      localStorage.setItem(RESULTS_OPEN_KEY, open ? "1" : "0");
      apply(true);
    });
  }

  function setupExportMenu(panel) {
    const toggle = panel.querySelector("#mh-export-toggle");
    const menu = panel.querySelector(".mh-export-menu");
    if (!toggle || !menu || toggle.dataset.ready === "1") return;
    toggle.dataset.ready = "1";
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = panel.classList.toggle("mh-export-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.remove("mh-export-open");
      toggle.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("click", () => {
      panel.classList.remove("mh-export-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  }

  function setClassProgress(panel, percent) {
    const fill = panel.querySelector("#mh-class-progress-fill");
    const text = panel.querySelector("#mh-class-progress-text");
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
  }

  function setClassStatus(panel, message, tone) {
    const status = panel.querySelector("#mh-class-export-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function refreshClassExportLabel(panel) {
    const btn = panel.querySelector("#mh-export-class");
    const stopBtn = panel.querySelector("#mh-class-stop");
    const loader = window.__MESH_HELPER_CLASS_AUTO_LOADER__;
    if (!btn || !loader) return;
    loader.getResults().then((batch) => {
      const mine = batch && batch.exportKind !== "subject";
      if (stopBtn) stopBtn.style.display = mine && batch.status === "running" ? "block" : "none";
      if (mine && batch.status === "done") {
        btn.textContent = "Скачать Excel";
        btn.disabled = false;
        setClassProgress(panel, 100);
        setClassStatus(panel, `Готово: собраны данные по ${batch.queue.length} предметам. Можно скачать файл.`, "ok");
      } else if (mine && batch.status === "running") {
        const percent = batch.queue.length ? Math.round((batch.currentIndex / batch.queue.length) * 100) : 0;
        btn.textContent = "Идёт сбор...";
        btn.disabled = true;
        setClassProgress(panel, percent);
        setClassStatus(panel, `Собрано ${batch.currentIndex} из ${batch.queue.length} предметов — идёт в фоновой вкладке, можно продолжать работать здесь.`, "muted");
      } else {
        btn.textContent = "Собрать все предметы";
        btn.disabled = false;
        setClassProgress(panel, 0);
        setClassStatus(panel, "Соберите оценки, пропуски и итоги по всем предметам класса в один Excel-файл.", "muted");
      }
    });
  }

  function setupClassToggle(panel) {
    const toggle = panel.querySelector("#mh-class-toggle");
    const arrow = toggle?.querySelector(".mh-class-arrow");
    const menu = panel.querySelector(".mh-class-menu");
    if (!toggle || !menu || toggle.dataset.ready === "1") return;
    toggle.dataset.ready = "1";
    let open = localStorage.getItem("meshHelperClassOpen") === "1";
    const apply = (animate) => {
      panel.classList.toggle("mh-class-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (arrow) arrow.textContent = open ? "▲" : "▼";
      setMenuExpanded(menu, open, animate);
    };
    apply(false);
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      open = !open;
      localStorage.setItem("meshHelperClassOpen", open ? "1" : "0");
      apply(true);
    });
  }

  function setupThresholdInputs(panel, storageKey, selectors, defaultValue) {
    const inputs = selectors.map((id) => panel.querySelector(`#${id}`)).filter(Boolean);
    inputs.forEach((input) => {
      if (input.dataset.ready === "1") return;
      input.dataset.ready = "1";
      const save = () => {
        const value = Number(input.value);
        const normalized = Number.isFinite(value) && value > 0 ? value : defaultValue;
        clearTimeout(thresholdSaveTimers[storageKey]);
        thresholdSaveTimers[storageKey] = setTimeout(() => {
          chrome.storage.sync.set({ [storageKey]: normalized });
          inputs.forEach((other) => {
            if (other !== input) other.value = normalized;
          });
        }, 150);
      };
      input.addEventListener("input", save);
      input.addEventListener("change", save);
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventName) => {
        input.addEventListener(eventName, (e) => e.stopPropagation());
      });
    });
  }

  function applyFinalRanges(ranges) {
    window.__MESH_HELPER_FINAL_RANGES__ = ranges;
    window.dispatchEvent(new CustomEvent("mesh-helper-final-criteria-changed"));
  }

  function setupFinalCriteria(panel) {
    const box = panel.querySelector("#mh-final-criteria");
    const correctFinals = panel.querySelector("#mh-check-correct-finals");
    const saveBtn = panel.querySelector("#mh-final-criteria-save");
    const status = panel.querySelector("#mh-final-criteria-status");
    if (!box) return;

    if (correctFinals && correctFinals.dataset.mhCriteriaBound !== "1") {
      correctFinals.dataset.mhCriteriaBound = "1";
      correctFinals.addEventListener("change", () => {
        box.style.display = correctFinals.checked ? "block" : "none";
      });
    }
    if (correctFinals) box.style.display = correctFinals.checked ? "block" : "none";

    const periodsSelect = panel.querySelector("#mh-academic-periods");
    [...box.querySelectorAll("input"), periodsSelect].filter(Boolean).forEach((input) => {
      if (input.dataset.ready === "1") return;
      input.dataset.ready = "1";
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventName) => {
        input.addEventListener(eventName, (e) => e.stopPropagation());
      });
    });

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
      applyFinalRanges(ranges);
    });

    if (saveBtn && saveBtn.dataset.ready !== "1") {
      saveBtn.dataset.ready = "1";
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
          applyFinalRanges(ranges);
          if (status) {
            status.textContent = "Критерии сохранены.";
            status.dataset.tone = "ok";
          }
        });
      });
    }
  }

  function setupClassStop(panel) {
    const stopBtn = panel.querySelector("#mh-class-stop");
    if (!stopBtn || stopBtn.dataset.ready === "1") return;
    stopBtn.dataset.ready = "1";
    stopBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const loader = window.__MESH_HELPER_CLASS_AUTO_LOADER__;
      if (!loader) return;
      await loader.stopBatch();
      refreshClassExportLabel(panel);
      refreshAllClassesExportLabel(panel);
    });
  }

  function setupClassExport(panel) {
    setupClassToggle(panel);
    setupClassStop(panel);
    const btn = panel.querySelector("#mh-export-class");
    if (btn && btn.dataset.ready !== "1") {
      btn.dataset.ready = "1";
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const loader = window.__MESH_HELPER_CLASS_AUTO_LOADER__;
        if (!loader) {
          setClassStatus(panel, "Модуль выгрузки класса не загружен. Обновите страницу и попробуйте снова.", "warn");
          return;
        }
        const batch = await loader.getResults();
        if (batch?.status === "done" && batch.exportKind !== "subject") {
          loader.exportWorkbook();
          return;
        }
        if (batch?.status === "running") {
          if (batch.exportKind === "subject") {
            setClassStatus(panel, "Сейчас уже идёт другой сбор («Все классы») — дождитесь завершения.", "warn");
          }
          return;
        }
        const result = await loader.requestClassFromAnyPage();
        if (result.navigating) {
          setClassStatus(panel, "Открываем страницу «Журналы класса»...", "muted");
        } else if (!result.ok) {
          setClassStatus(panel, "Список журналов не найден. Разверните нужную параллель и нажмите ещё раз.", "warn");
        } else {
          setClassStatus(panel, "Сбор запущен в фоновой вкладке — можно продолжать работать здесь, она сама закроется по завершении.", "muted");
          refreshClassExportLabel(panel);
        }
      });
    }
    const perStudentBtn = panel.querySelector("#mh-export-class-per-student");
    if (perStudentBtn && perStudentBtn.dataset.ready !== "1") {
      perStudentBtn.dataset.ready = "1";
      perStudentBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const loader = window.__MESH_HELPER_CLASS_AUTO_LOADER__;
        if (!loader) {
          setClassStatus(panel, "Модуль выгрузки класса не загружен. Обновите страницу и попробуйте снова.", "warn");
          return;
        }
        const batch = await loader.getResults();
        if (batch?.status === "done" && batch.exportKind !== "subject") {
          perStudentBtn.disabled = true;
          const result = await loader.exportPerStudentZip();
          perStudentBtn.disabled = false;
          if (!result?.ok) {
            setClassStatus(panel, "Не удалось собрать файлы по ученикам.", "warn");
          } else {
            setClassStatus(panel, `Готово: ${result.students} файлов по ученикам в архиве.`, "ok");
          }
          return;
        }
        if (batch?.status === "running") {
          if (batch.exportKind === "subject") {
            setClassStatus(panel, "Сейчас уже идёт другой сбор («Все классы») — дождитесь завершения.", "warn");
            return;
          }
          await setPendingPerStudentZip(true);
          setClassStatus(panel, "Сбор ещё не завершён — архив по ученикам скачается автоматически, как только он закончится.", "muted");
          return;
        }
        await setPendingPerStudentZip(true);
        const result = await loader.requestClassFromAnyPage();
        if (result.navigating) {
          setClassStatus(panel, "Открываем страницу «Журналы класса»... Архив по ученикам скачается автоматически после сбора данных.", "muted");
        } else if (!result.ok) {
          await setPendingPerStudentZip(false);
          setClassStatus(panel, "Список журналов не найден. Разверните нужную параллель и нажмите ещё раз.", "warn");
        } else {
          setClassStatus(panel, "Сбор запущен в фоновой вкладке — архив по ученикам скачается автоматически по завершении.", "muted");
          refreshClassExportLabel(panel);
        }
      });
    }
    refreshClassExportLabel(panel);
    runPendingPerStudentZipIfReady(panel);
  }

  function setAllClassesProgress(panel, percent) {
    const fill = panel.querySelector("#mh-allclasses-progress-fill");
    const text = panel.querySelector("#mh-allclasses-progress-text");
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
  }

  function setAllClassesStatus(panel, message, tone) {
    const status = panel.querySelector("#mh-allclasses-export-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function getAllClassesSelectAllSetting() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["allClassesSelectAll"], (data) => resolve(data.allClassesSelectAll !== false));
    });
  }

  function hideAllClassesPicker(panel) {
    const picker = panel.querySelector("#mh-allclasses-picker");
    if (picker) picker.style.display = "none";
    const list = panel.querySelector("#mh-allclasses-picker-list");
    if (list) list.innerHTML = "";
  }

  function parallelGroupKey(journal) {
    const match = String(journal.classLabel || "").match(/^(\d+)/);
    return match ? match[1] : "?";
  }

  function renderAllClassesPicker(panel, journals) {
    const picker = panel.querySelector("#mh-allclasses-picker");
    const list = panel.querySelector("#mh-allclasses-picker-list");
    if (!picker || !list) return;
    if (!journals.length) {
      setAllClassesStatus(panel, "Карточки классов не найдены. Разверните нужные параллели и нажмите ещё раз.", "warn");
      hideAllClassesPicker(panel);
      return;
    }
    list.innerHTML = "";

    const groups = new Map();
    journals.forEach((journal, index) => {
      const key = parallelGroupKey(journal);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ journal, index });
    });

    const sortedKeys = [...groups.keys()].sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b), "ru");
    });

    sortedKeys.forEach((key) => {
      const items = groups.get(key);
      const groupEl = document.createElement("div");
      groupEl.className = "mh-allclasses-picker-group";

      const headerEl = document.createElement("label");
      headerEl.className = "mh-allclasses-picker-group-header";
      const headerCheckbox = document.createElement("input");
      headerCheckbox.type = "checkbox";
      headerCheckbox.checked = true;
      const headerSpan = document.createElement("span");
      headerSpan.textContent = key === "?" ? "Без параллели" : `${key} параллель`;
      headerEl.appendChild(headerCheckbox);
      headerEl.appendChild(headerSpan);
      groupEl.appendChild(headerEl);

      const rowCheckboxes = [];
      items.forEach(({ journal, index }) => {
        const row = document.createElement("label");
        row.className = "mh-allclasses-picker-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.dataset.mhIndex = String(index);
        const span = document.createElement("span");
        span.textContent = journal.classLabel || journal.text || "?";
        row.appendChild(checkbox);
        row.appendChild(span);
        groupEl.appendChild(row);
        rowCheckboxes.push(checkbox);
      });

      headerCheckbox.addEventListener("change", () => {
        rowCheckboxes.forEach((cb) => { cb.checked = headerCheckbox.checked; });
      });
      rowCheckboxes.forEach((cb) => {
        cb.addEventListener("change", () => {
          headerCheckbox.checked = rowCheckboxes.every((c) => c.checked);
        });
      });

      list.appendChild(groupEl);
    });

    picker.dataset.journals = JSON.stringify(journals);
    picker.style.display = "block";
    setAllClassesStatus(panel, `Найдено классов: ${journals.length}. Отметь нужные и нажми «Собрать выбранные».`, "muted");
  }

  function refreshAllClassesExportLabel(panel) {
    const btn = panel.querySelector("#mh-export-allclasses");
    const stopBtn = panel.querySelector("#mh-allclasses-stop");
    const loader = window.__MESH_HELPER_CLASS_AUTO_LOADER__;
    if (!btn || !loader) return;
    loader.getResults().then((batch) => {
      const mine = batch && batch.exportKind === "subject";
      if (stopBtn) stopBtn.style.display = mine && batch.status === "running" ? "block" : "none";
      if (mine && batch.status === "done") {
        btn.textContent = "Скачать Excel";
        btn.disabled = false;
        setAllClassesProgress(panel, 100);
        setAllClassesStatus(panel, `Готово: собраны данные по ${batch.queue.length} классам. Можно скачать файл.`, "ok");
      } else if (mine && batch.status === "running") {
        const percent = batch.queue.length ? Math.round((batch.currentIndex / batch.queue.length) * 100) : 0;
        btn.textContent = "Идёт сбор...";
        btn.disabled = true;
        setAllClassesProgress(panel, percent);
        setAllClassesStatus(panel, `Собрано ${batch.currentIndex} из ${batch.queue.length} классов — идёт в фоновой вкладке, можно продолжать работать здесь.`, "muted");
      } else {
        btn.textContent = "Собрать по всем классам";
        btn.disabled = false;
        setAllClassesProgress(panel, 0);
        setAllClassesStatus(panel, "На странице «Мои классы» разверните нужные параллели и нажмите — соберёт проблемных учеников и общий список по всем классам сразу.", "muted");
      }
    });
  }

  function setupAllClassesToggle(panel) {
    const toggle = panel.querySelector("#mh-allclasses-toggle");
    const arrow = toggle?.querySelector(".mh-class-arrow");
    const menu = panel.querySelector(".mh-allclasses-menu");
    if (!toggle || !menu || toggle.dataset.ready === "1") return;
    toggle.dataset.ready = "1";
    let open = localStorage.getItem("meshHelperAllClassesOpen") === "1";
    const apply = (animate) => {
      panel.classList.toggle("mh-allclasses-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (arrow) arrow.textContent = open ? "▲" : "▼";
      setMenuExpanded(menu, open, animate);
    };
    apply(false);
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      open = !open;
      localStorage.setItem("meshHelperAllClassesOpen", open ? "1" : "0");
      apply(true);
    });
  }

  function setupAllClassesSelectAll(panel) {
    const checkbox = panel.querySelector("#mh-allclasses-select-all");
    if (!checkbox || checkbox.dataset.ready === "1") return;
    checkbox.dataset.ready = "1";
    chrome.storage.sync.get(["allClassesSelectAll"], (data) => {
      checkbox.checked = data.allClassesSelectAll !== false;
    });
    checkbox.addEventListener("change", () => {
      chrome.storage.sync.set({ allClassesSelectAll: checkbox.checked });
      if (checkbox.checked) hideAllClassesPicker(panel);
    });
    ["click", "mousedown", "mouseup"].forEach((eventName) => {
      checkbox.addEventListener(eventName, (e) => e.stopPropagation());
    });
  }

  function setupAllClassesPickerConfirm(panel) {
    const btn = panel.querySelector("#mh-allclasses-start-selected");
    if (!btn || btn.dataset.ready === "1") return;
    btn.dataset.ready = "1";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const loader = window.__MESH_HELPER_CLASS_AUTO_LOADER__;
      const picker = panel.querySelector("#mh-allclasses-picker");
      if (!loader || !picker) return;
      let journals = [];
      try {
        journals = JSON.parse(picker.dataset.journals || "[]");
      } catch (err) {
        journals = [];
      }
      const checkedIndexes = [...panel.querySelectorAll("#mh-allclasses-picker-list input[type=checkbox]:checked")]
        .map((input) => Number(input.dataset.mhIndex));
      const selected = journals.filter((journal, index) => checkedIndexes.includes(index));
      if (!selected.length) {
        setAllClassesStatus(panel, "Отметь хотя бы один класс.", "warn");
        return;
      }
      hideAllClassesPicker(panel);
      const result = await loader.startAllClassesInBackground(selected);
      if (!result.ok) {
        setAllClassesStatus(panel, "Не удалось запустить сбор.", "warn");
      } else {
        setAllClassesStatus(panel, "Сбор запущен в фоновой вкладке — можно продолжать работать здесь, она сама закроется по завершении.", "muted");
        refreshAllClassesExportLabel(panel);
      }
    });
  }

  let allClassesReadyListenerBound = false;
  function setupAllClassesAutoReadyListener() {
    if (allClassesReadyListenerBound) return;
    allClassesReadyListenerBound = true;
    window.addEventListener("mesh-helper-all-classes-ready", async (e) => {
      const journals = (e.detail && e.detail.journals) || [];
      const panel = document.getElementById(PANEL_ID);
      if (!panel) return;
      const loader = window.__MESH_HELPER_CLASS_AUTO_LOADER__;
      const selectAll = await getAllClassesSelectAllSetting();
      if (selectAll) {
        if (!loader || !journals.length) {
          setAllClassesStatus(panel, "Карточки классов не найдены. Разверните нужные параллели и нажмите ещё раз.", "warn");
          return;
        }
        const result = await loader.startAllClassesInBackground(journals);
        if (!result.ok) {
          setAllClassesStatus(panel, "Карточки классов не найдены. Разверните нужные параллели и нажмите ещё раз.", "warn");
        } else {
          setAllClassesStatus(panel, "Сбор запущен в фоновой вкладке — можно продолжать работать здесь, она сама закроется по завершении.", "muted");
          refreshAllClassesExportLabel(panel);
        }
      } else {
        renderAllClassesPicker(panel, journals);
      }
    });
  }

  function setupAllClassesStop(panel) {
    const stopBtn = panel.querySelector("#mh-allclasses-stop");
    if (!stopBtn || stopBtn.dataset.ready === "1") return;
    stopBtn.dataset.ready = "1";
    stopBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const loader = window.__MESH_HELPER_CLASS_AUTO_LOADER__;
      if (!loader) return;
      await loader.stopBatch();
      hideAllClassesPicker(panel);
      refreshClassExportLabel(panel);
      refreshAllClassesExportLabel(panel);
    });
  }

  function setupMemoButton(panel) {
    const btn = panel.querySelector("#mh-open-memo");
    if (!btn || btn.dataset.ready === "1") return;
    btn.dataset.ready = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ source: "mesh-helper-background", type: "open-memo" });
    });
  }

  function setupAllClassesExport(panel) {
    setupAllClassesToggle(panel);
    setupAllClassesSelectAll(panel);
    setupAllClassesPickerConfirm(panel);
    setupAllClassesAutoReadyListener();
    setupAllClassesStop(panel);
    setupMemoButton(panel);
    const btn = panel.querySelector("#mh-export-allclasses");
    if (btn && btn.dataset.ready !== "1") {
      btn.dataset.ready = "1";
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const loader = window.__MESH_HELPER_CLASS_AUTO_LOADER__;
        if (!loader) {
          setAllClassesStatus(panel, "Модуль выгрузки не загружен. Обновите страницу и попробуйте снова.", "warn");
          return;
        }
        const batch = await loader.getResults();
        if (batch?.status === "done" && batch.exportKind === "subject") {
          loader.exportAllClassesWorkbook();
          return;
        }
        if (batch?.status === "running") {
          if (batch.exportKind !== "subject") {
            setAllClassesStatus(panel, "Сейчас уже идёт другой сбор («Мой класс») — дождитесь завершения.", "warn");
          }
          return;
        }
        hideAllClassesPicker(panel);
        const navResult = await loader.requestAllClassesFromAnyPage();
        if (navResult.navigating) {
          setAllClassesStatus(panel, "Открываем страницу «Мои классы»...", "muted");
          return;
        }
        setAllClassesStatus(panel, "Ищем классы на странице...", "muted");
        const [selectAll, journals] = await Promise.all([getAllClassesSelectAllSetting(), loader.prepareAllClassesList()]);
        if (selectAll) {
          const result = await loader.startAllClassesInBackground(journals);
          if (!result.ok) {
            setAllClassesStatus(panel, "Карточки классов не найдены. Разверните нужные параллели и нажмите ещё раз.", "warn");
          } else {
            setAllClassesStatus(panel, "Сбор запущен в фоновой вкладке — можно продолжать работать здесь, она сама закроется по завершении.", "muted");
            refreshAllClassesExportLabel(panel);
          }
        } else {
          renderAllClassesPicker(panel, journals);
        }
      });
    }
    refreshAllClassesExportLabel(panel);
  }

  function isAdminJournalsListPage() {
    return location.pathname.startsWith("/educationmanagement/manage/journals") && !location.pathname.includes("/group");
  }

  function setupAdminToggle(panel) {
    const toggle = panel.querySelector("#mh-admin-toggle");
    const arrow = toggle?.querySelector(".mh-class-arrow");
    const menu = panel.querySelector(".mh-admin-menu");
    if (!toggle || !menu || toggle.dataset.ready === "1") return;
    toggle.dataset.ready = "1";
    let open = localStorage.getItem("meshHelperAdminOpen") === "1";
    const apply = (animate) => {
      panel.classList.toggle("mh-admin-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (arrow) arrow.textContent = open ? "▲" : "▼";
      setMenuExpanded(menu, open, animate);
    };
    apply(false);
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      open = !open;
      localStorage.setItem("meshHelperAdminOpen", open ? "1" : "0");
      apply(true);
    });
  }

  function setAdminProgress(panel, percent) {
    const fill = panel.querySelector("#mh-admin-progress-fill");
    const text = panel.querySelector("#mh-admin-progress-text");
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
  }

  function setAdminStatus(panel, message, tone) {
    const status = panel.querySelector("#mh-admin-export-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function hideAdminPicker(panel) {
    const picker = panel.querySelector("#mh-admin-picker");
    if (picker) picker.style.display = "none";
    const list = panel.querySelector("#mh-admin-picker-list");
    if (list) list.innerHTML = "";
  }

  function renderAdminPicker(panel, classes) {
    const picker = panel.querySelector("#mh-admin-picker");
    const list = panel.querySelector("#mh-admin-picker-list");
    if (!picker || !list) return;
    if (!classes.length) {
      setAdminStatus(panel, "Классы не найдены.", "warn");
      hideAdminPicker(panel);
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
    setAdminStatus(panel, `Найдено классов: ${classes.length}. Отметь нужные и нажми «Собрать выбранные».`, "muted");
  }

  function setupAdminLoadClasses(panel) {
    const btn = panel.querySelector("#mh-admin-load-classes");
    if (!btn || btn.dataset.ready === "1") return;
    btn.dataset.ready = "1";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      if (!collector) {
        setAdminStatus(panel, "Модуль admin-collector.js не загружен. Обновите страницу.", "warn");
        return;
      }
      btn.disabled = true;
      hideAdminPicker(panel);
      setAdminStatus(panel, "Загружаем список классов по всем параллелям — это может занять минуту...", "muted");
      try {
        const classes = await collector.listAllClasses();
        renderAdminPicker(panel, classes);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function setupAdminPickerStartButton(panel, buttonId, collectorMethod) {
    const btn = panel.querySelector(`#${buttonId}`);
    if (!btn || btn.dataset.ready === "1") return;
    btn.dataset.ready = "1";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      const picker = panel.querySelector("#mh-admin-picker");
      if (!collector || !picker) return;
      let classes = [];
      try {
        classes = JSON.parse(picker.dataset.classes || "[]");
      } catch (err) {
        classes = [];
      }
      const checkedIndexes = [...panel.querySelectorAll("#mh-admin-picker-list input[type=checkbox]:checked")]
        .map((input) => Number(input.dataset.mhIndex))
        .filter((n) => Number.isFinite(n));
      const selected = classes.filter((cls, index) => checkedIndexes.includes(index));
      if (!selected.length) {
        setAdminStatus(panel, "Отметь хотя бы один класс.", "warn");
        return;
      }
      hideAdminPicker(panel);
      setAdminStatus(panel, "Запускаем сбор в фоновой вкладке...", "muted");
      const result = await collector[collectorMethod](selected);
      if (!result?.ok) {
        setAdminStatus(panel, "Не удалось запустить сбор.", "warn");
      } else {
        setAdminStatus(panel, `Сбор запущен (${result.total} журналов) в фоновой вкладке — можно продолжать работать здесь.`, "muted");
        refreshAdminExportLabel(panel);
      }
    });
  }

  function setupAdminPickerConfirm(panel) {
    // «Полный сбор» — для Excel/СВОД/Аналитики/ДЗ (нужны марки, расписание,
    // посещаемость, ДЗ, мед.данные — ждёт всё это по каждому журналу).
    setupAdminPickerStartButton(panel, "mh-admin-start-selected", "collectMissingHomeworkForSelectedClasses");
    // «Только проверка итогов» — свой независимый, более лёгкий сбор
    // (ждёт только оценки/ФИО/саму таблицу итогов, без лишнего).
    setupAdminPickerStartButton(panel, "mh-admin-start-finals", "collectFinalGradesForSelectedClasses");
  }

  function setupAdminStop(panel) {
    const stopBtn = panel.querySelector("#mh-admin-stop");
    if (!stopBtn || stopBtn.dataset.ready === "1") return;
    stopBtn.dataset.ready = "1";
    stopBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
      if (!collector) return;
      // Основной и «только итоги» сборы независимы — останавливаем тот
      // (или те), что реально сейчас идёт.
      const [mainBatch, finalsBatch] = await Promise.all([collector.getAdminBatchState(), collector.getAdminFinalsBatchState()]);
      const tasks = [];
      if (mainBatch?.status === "running") tasks.push(collector.stopAdminBatch());
      if (finalsBatch?.status === "running") tasks.push(collector.stopAdminFinalsBatch());
      await Promise.all(tasks);
      refreshAdminExportLabel(panel);
    });
  }

  function setupAdminDownloads(panel) {
    const csvBtn = panel.querySelector("#mh-admin-download-csv");
    const finalsCsvBtn = panel.querySelector("#mh-admin-download-finals-csv");
    const xlsxBtn = panel.querySelector("#mh-admin-download-xlsx");
    if (csvBtn && csvBtn.dataset.ready !== "1") {
      csvBtn.dataset.ready = "1";
      csvBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
        if (!collector) return;
        const result = await collector.downloadMissingHomeworkResultsCsv();
        if (!result?.ok) setAdminStatus(panel, "Нечего выгружать — сначала запустите сбор.", "warn");
      });
    }
    if (finalsCsvBtn && finalsCsvBtn.dataset.ready !== "1") {
      finalsCsvBtn.dataset.ready = "1";
      finalsCsvBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
        if (!collector) return;
        const result = await collector.downloadFinalGradesCsv();
        if (!result?.ok) setAdminStatus(panel, "Нечего выгружать — сначала запустите сбор.", "warn");
      });
    }
    if (xlsxBtn && xlsxBtn.dataset.ready !== "1") {
      xlsxBtn.dataset.ready = "1";
      xlsxBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
        if (!collector) return;
        const result = await collector.downloadAdminParallelWorkbook();
        if (!result?.ok) setAdminStatus(panel, "Нечего выгружать — сначала запустите сбор.", "warn");
      });
    }
  }

  function showAdminBatchState(panel, batch, label) {
    const stopBtn = panel.querySelector("#mh-admin-stop");
    if (stopBtn) stopBtn.style.display = batch.status === "running" ? "block" : "none";
    if (batch.status === "running") {
      const percent = batch.queue.length ? Math.round((batch.currentIndex / batch.queue.length) * 100) : 0;
      setAdminProgress(panel, percent);
      setAdminStatus(panel, `${label}Собрано ${batch.currentIndex} из ${batch.queue.length} журналов — идёт в фоновой вкладке.`, "muted");
    } else if (batch.status === "done") {
      setAdminProgress(panel, 100);
      setAdminStatus(panel, `${label}Готово: собрано ${batch.queue.length} журналов. Можно скачивать.`, "ok");
    } else if (batch.status === "error") {
      setAdminProgress(panel, 100);
      setAdminStatus(panel, batch.errorMessage || "Произошла ошибка сбора.", "warn");
    }
  }

  // Основной сбор (для Excel/СВОД/Аналитики/ДЗ) и лёгкий сбор «только для
  // проверки итогов» — независимые батчи, оба могут показывать прогресс в
  // одном и том же статус-блоке. Приоритет — тому, что реально сейчас идёт;
  // если оба завершены/ни один не запускался, показываем основной (как раньше).
  function refreshAdminExportLabel(panel) {
    const collector = window.__MESH_HELPER_ADMIN_COLLECTOR__;
    if (!collector) return;
    Promise.all([collector.getAdminBatchState(), collector.getAdminFinalsBatchState()]).then(([mainBatch, finalsBatch]) => {
      if (mainBatch?.status === "running") {
        showAdminBatchState(panel, mainBatch, "");
        return;
      }
      if (finalsBatch?.status === "running") {
        showAdminBatchState(panel, finalsBatch, "[Проверка итогов] ");
        return;
      }
      if (mainBatch) {
        showAdminBatchState(panel, mainBatch, "");
        return;
      }
      if (finalsBatch) {
        showAdminBatchState(panel, finalsBatch, "[Проверка итогов] ");
        return;
      }
      const stopBtn = panel.querySelector("#mh-admin-stop");
      if (stopBtn) stopBtn.style.display = "none";
    });
  }

  function setupAdminExport(panel) {
    const section = panel.querySelector("#mh-admin-export");
    if (section) section.style.display = isAdminJournalsListPage() ? "block" : "none";
    if (!isAdminJournalsListPage()) return;
    setupAdminToggle(panel);
    setupAdminLoadClasses(panel);
    setupAdminPickerConfirm(panel);
    setupAdminStop(panel);
    setupAdminDownloads(panel);
    refreshAdminExportLabel(panel);
  }

  function setupDrag(panel) {
    if (panel.dataset.mhDragReady === "1") return;
    panel.dataset.mhDragReady = "1";
    const header = panel.querySelector(".mh-header") || panel;
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    try {
      const saved = JSON.parse(localStorage.getItem("meshHelperPosition") || "null");
      if (saved) {
        panel.style.right = "auto";
        panel.style.left = saved.left + "px";
        panel.style.top = saved.top + "px";
      }
    } catch (e) {}
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button, input, label, .mh-mini-min-wrap")) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      panel.style.right = "auto";
      panel.style.left = startLeft + e.clientX - startX + "px";
      panel.style.top = startTop + e.clientY - startY + "px";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = "";
      const rect = panel.getBoundingClientRect();
      localStorage.setItem("meshHelperPosition", JSON.stringify({ left: rect.left, top: rect.top }));
    });
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.innerHTML = `
        <div class="mh-header"><div class="mh-title">Помощник учителя</div></div>
        <div class="mh-section mh-settings"><label class="mh-label" for="mh-min">Минимум оценок</label><div class="mh-settings-row"><input id="mh-min" type="number" min="1"><button id="mh-save" type="button">Сохранить</button></div></div>
        <div class="mh-section mh-notes-row"><button id="mh-notes-open" class="mh-class-toggle mh-notes-toggle" type="button"><span class="mh-notes-label-wrap"><svg class="mh-icon mh-notes-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg><span class="mh-notes-label">Заметки к классу</span></span><span class="mh-notes-arrow">▸</span></button></div>
        <div class="mh-section mh-checks">
          <div id="mh-checks-toggle" class="mh-checks-toggle" role="button" aria-expanded="false"><span><svg class="mh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Проверка оценок</span><span class="mh-checks-actions"><button id="mh-checks-help" class="mh-help" type="button" aria-label="Справка">?</button><span class="mh-checks-arrow">▼</span></span><div class="mh-help-popover"><b>Подсветка недобора</b> — красная подсветка учеников, у которых меньше оценок, чем указано в минимуме.<br><br><b>Контроль итогов</b> — синяя рамка, если итоговая оценка или «Г» не выставлены.<br><br><b>Проверка итогов</b> — жёлтая подсветка, если итог выставлен не по расчёту, по правилу из «Порог округления итоговых» ниже.</div></div>
          <div class="mh-checks-menu">
            <label class="mh-toggle-row" for="mh-highlight-low"><input id="mh-highlight-low" type="checkbox"><span>Подсветка недобора</span></label>
            <label class="mh-toggle-row" for="mh-check-finals"><input id="mh-check-finals" type="checkbox"><span>Контроль итогов</span></label>
            <label class="mh-toggle-row" for="mh-check-correct-finals"><input id="mh-check-correct-finals" type="checkbox"><span>Проверка итогов</span></label>
            <div id="mh-final-criteria" class="mh-final-criteria" style="display:none;">
              <div class="mh-final-criteria-title">Критерии округления итоговой</div>
              <div class="mh-final-periods-row"><label for="mh-academic-periods" class="mh-final-grade-label">Учебных периодов в году</label><select id="mh-academic-periods"><option value="4">4 (четверти)</option><option value="3">3 (триместры)</option><option value="2">2 (полугодия)</option></select></div>
              <div class="mh-final-criteria-row"><span class="mh-final-grade-label">Оценка 2</span><input class="mh-final-from" data-grade="2" type="number" step="0.01" min="1" max="5"><span class="mh-final-dash">—</span><input class="mh-final-to" data-grade="2" type="number" step="0.01" min="1" max="5"></div>
              <div class="mh-final-criteria-row"><span class="mh-final-grade-label">Оценка 3</span><input class="mh-final-from" data-grade="3" type="number" step="0.01" min="1" max="5"><span class="mh-final-dash">—</span><input class="mh-final-to" data-grade="3" type="number" step="0.01" min="1" max="5"></div>
              <div class="mh-final-criteria-row"><span class="mh-final-grade-label">Оценка 4</span><input class="mh-final-from" data-grade="4" type="number" step="0.01" min="1" max="5"><span class="mh-final-dash">—</span><input class="mh-final-to" data-grade="4" type="number" step="0.01" min="1" max="5"></div>
              <div class="mh-final-criteria-row"><span class="mh-final-grade-label">Оценка 5</span><input class="mh-final-from" data-grade="5" type="number" step="0.01" min="1" max="5"><span class="mh-final-dash">—</span><input class="mh-final-to" data-grade="5" type="number" step="0.01" min="1" max="5"></div>
              <button id="mh-final-criteria-save" class="mh-class-export-btn mh-btn-secondary" type="button">Сохранить критерии</button>
              <div id="mh-final-criteria-status" class="mh-class-status" data-tone="muted"></div>
            </div>
          </div>
        </div>
        <div class="mh-section mh-results">
          <div id="mh-results-toggle" class="mh-checks-toggle" role="button" aria-expanded="false"><span><svg class="mh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg> Текущий урок</span><span class="mh-checks-arrow">▼</span></div>
          <div class="mh-results-menu">
            <div id="mh-summary" class="mh-subtitle">Ученики ниже нормы по оценкам: 0</div>
            <div class="mh-export-wrap"><button id="mh-export-toggle" class="mh-export-toggle" type="button" aria-expanded="false">Экспорт ▼</button><div class="mh-export-menu"><button id="mh-export-problems" class="mh-export" type="button">Выгрузить проблемных</button><button id="mh-export-all" class="mh-export" type="button">Выгрузить весь класс</button></div></div>
            <div id="mh-list" class="mh-list"></div>
          </div>
        </div>
        <div class="mh-section mh-class-export">
          <div id="mh-class-toggle" class="mh-class-toggle" role="button" aria-expanded="false"><span><svg class="mh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg> Мой класс</span><span class="mh-class-arrow">▼</span></div>
          <div class="mh-class-menu">
            <div class="mh-class-threshold-row"><label for="mh-class-min-avg">Проблема при среднем ≤</label><input id="mh-class-min-avg" type="number" min="1" max="5" step="0.1"></div>
            <div class="mh-class-threshold-row"><label for="mh-class-min-absence">Проблема при пропусках ≥ (%)</label><input id="mh-class-min-absence" type="number" min="1" max="100" step="1"></div>
            <button id="mh-export-class" class="mh-class-export-btn" type="button">Собрать все предметы</button>
            <button id="mh-class-stop" class="mh-class-stop-btn" type="button" style="display:none;">Остановить сбор</button>
            <div class="mh-class-progress-track"><div id="mh-class-progress-fill" class="mh-class-progress-fill" style="width:0%"></div></div>
            <div id="mh-class-progress-text" class="mh-class-progress-text">0%</div>
            <div id="mh-class-export-status" class="mh-class-status" data-tone="muted">Соберите оценки, пропуски и итоги по всем предметам класса в один Excel-файл.</div>
            <button id="mh-export-class-per-student" class="mh-class-export-btn mh-btn-secondary" type="button">Скачать по ученикам (.zip)</button>
          </div>
        </div>
        <div class="mh-section mh-allclasses-export">
          <div id="mh-allclasses-toggle" class="mh-class-toggle" role="button" aria-expanded="false"><span><svg class="mh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg> Все классы (по предмету)</span><span class="mh-class-arrow">▼</span></div>
          <div class="mh-allclasses-menu">
            <div class="mh-class-threshold-row"><label for="mh-allclasses-min-avg">Проблема при среднем ≤</label><input id="mh-allclasses-min-avg" type="number" min="1" max="5" step="0.1"></div>
            <div class="mh-class-threshold-row"><label for="mh-allclasses-min-absence">Проблема при пропусках ≥ (%)</label><input id="mh-allclasses-min-absence" type="number" min="1" max="100" step="1"></div>
            <label class="mh-toggle-row" for="mh-allclasses-select-all"><input id="mh-allclasses-select-all" type="checkbox" checked><span>Все видимые классы</span></label>
            <button id="mh-export-allclasses" class="mh-class-export-btn" type="button">Собрать по всем классам</button>
            <button id="mh-allclasses-stop" class="mh-class-stop-btn" type="button" style="display:none;">Остановить сбор</button>
            <div class="mh-class-progress-track"><div id="mh-allclasses-progress-fill" class="mh-class-progress-fill" style="width:0%"></div></div>
            <div id="mh-allclasses-progress-text" class="mh-class-progress-text">0%</div>
            <div id="mh-allclasses-export-status" class="mh-class-status" data-tone="muted">На странице «Мои классы» разверните нужные параллели и нажмите — соберёт проблемных учеников и общий список по всем классам сразу.</div>
            <div id="mh-allclasses-picker" class="mh-allclasses-picker" style="display:none;">
              <div id="mh-allclasses-picker-list" class="mh-allclasses-picker-list"></div>
              <button id="mh-allclasses-start-selected" class="mh-class-export-btn" type="button">Собрать выбранные</button>
            </div>
            <button id="mh-open-memo" class="mh-class-export-btn mh-memo-btn" type="button">Служебная записка</button>
          </div>
        </div>
        <div class="mh-section mh-admin-export" id="mh-admin-export" style="display:none;">
          <div id="mh-admin-toggle" class="mh-class-toggle" role="button" aria-expanded="false"><span><svg class="mh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg> Режим администратора</span><span class="mh-class-arrow">▼</span></div>
          <div class="mh-admin-menu">
            <div class="mh-class-threshold-row"><label for="mh-admin-min-avg">Проблема при среднем ≤</label><input id="mh-admin-min-avg" type="number" min="1" max="5" step="0.1"></div>
            <div class="mh-class-threshold-row"><label for="mh-admin-min-absence">Проблема при пропусках ≥ (%)</label><input id="mh-admin-min-absence" type="number" min="1" max="100" step="1"></div>
            <div class="mh-class-threshold-row"><label for="mh-admin-min-grades">Мин. оценок</label><input id="mh-admin-min-grades" type="number" min="1" step="1"></div>
            <button id="mh-admin-load-classes" class="mh-class-export-btn" type="button">Загрузить список классов</button>
            <div id="mh-admin-picker" class="mh-allclasses-picker" style="display:none;">
              <div id="mh-admin-picker-list" class="mh-allclasses-picker-list"></div>
              <button id="mh-admin-start-selected" class="mh-class-export-btn" type="button">Собрать выбранные (полный сбор)</button>
              <button id="mh-admin-start-finals" class="mh-class-export-btn mh-btn-secondary" type="button">Собрать только для проверки итогов</button>
            </div>
            <button id="mh-admin-stop" class="mh-class-stop-btn" type="button" style="display:none;">Остановить сбор</button>
            <div class="mh-class-progress-track"><div id="mh-admin-progress-fill" class="mh-class-progress-fill" style="width:0%"></div></div>
            <div id="mh-admin-progress-text" class="mh-class-progress-text">0%</div>
            <div id="mh-admin-export-status" class="mh-class-status" data-tone="muted">Нажми «Загрузить список классов», отметь нужные и запусти сбор.</div>
            <button id="mh-admin-download-csv" class="mh-class-export-btn mh-btn-secondary" type="button">Скачать CSV (Отсутствует ДЗ)</button>
            <button id="mh-admin-download-finals-csv" class="mh-class-export-btn mh-btn-secondary" type="button">Скачать CSV (Проверка итогов)</button>
            <button id="mh-admin-download-xlsx" class="mh-class-export-btn mh-btn-secondary" type="button">Скачать Excel</button>
          </div>
        </div>`;
      document.body.appendChild(panel);
    }
    ensureTitle(panel);
    ensureMiniMin(panel);
    setupCollapse(panel);
    setupChecksMenu(panel);
    setupResultsToggle(panel);
    setupExportMenu(panel);
    setupClassExport(panel);
    setupAllClassesExport(panel);
    setupAdminExport(panel);
    setupBatchStorageListener();
    setupDrag(panel);
    const minInput = panel.querySelector("#mh-min");
    const save = panel.querySelector("#mh-save");
    const finals = panel.querySelector("#mh-check-finals");
    const correctFinals = panel.querySelector("#mh-check-correct-finals");
    const classAvgInputs = [panel.querySelector("#mh-class-min-avg"), panel.querySelector("#mh-allclasses-min-avg"), panel.querySelector("#mh-admin-min-avg")].filter(Boolean);
    const classAbsenceInputs = [panel.querySelector("#mh-class-min-absence"), panel.querySelector("#mh-allclasses-min-absence"), panel.querySelector("#mh-admin-min-absence")].filter(Boolean);
    chrome.storage.sync.get(["minGrades", "checkFinals", "checkCorrectFinals", "classProblemAvg", "classAbsencePercent"], (data) => {
      const value = typeof data.minGrades === "number" ? data.minGrades : DEFAULT_MIN;
      syncMiniMin(panel, value);
      if (finals) finals.checked = data.checkFinals === true;
      if (correctFinals) correctFinals.checked = data.checkCorrectFinals === true;
      const avgValue = typeof data.classProblemAvg === "number" ? data.classProblemAvg : DEFAULT_CLASS_PROBLEM_AVG;
      const absenceValue = typeof data.classAbsencePercent === "number" ? data.classAbsencePercent : DEFAULT_CLASS_ABSENCE_PERCENT;
      classAvgInputs.forEach((input) => { input.value = avgValue; });
      classAbsenceInputs.forEach((input) => { input.value = absenceValue; });
      notifyFinalsState(finals, correctFinals);
    });
    setupThresholdInputs(panel, "classProblemAvg", ["mh-class-min-avg", "mh-allclasses-min-avg", "mh-admin-min-avg"], DEFAULT_CLASS_PROBLEM_AVG);
    setupThresholdInputs(panel, "classAbsencePercent", ["mh-class-min-absence", "mh-allclasses-min-absence", "mh-admin-min-absence"], DEFAULT_CLASS_ABSENCE_PERCENT);
    setupFinalCriteria(panel);
    if (save && save.dataset.ready !== "1") {
      save.dataset.ready = "1";
      save.addEventListener("click", () => saveMin(panel, minInput.value));
    }
    if (minInput && minInput.dataset.ready !== "1") {
      minInput.dataset.ready = "1";
      minInput.addEventListener("input", () => saveMin(panel, minInput.value));
      minInput.addEventListener("change", () => saveMin(panel, minInput.value));
      minInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          saveMin(panel, minInput.value);
          minInput.blur();
        }
      });
    }
    const adminMinInput = panel.querySelector("#mh-admin-min-grades");
    if (adminMinInput && adminMinInput.dataset.ready !== "1") {
      adminMinInput.dataset.ready = "1";
      adminMinInput.addEventListener("input", () => saveMin(panel, adminMinInput.value));
      adminMinInput.addEventListener("change", () => saveMin(panel, adminMinInput.value));
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventName) => {
        adminMinInput.addEventListener(eventName, (e) => e.stopPropagation());
      });
    }
    if (finals && finals.dataset.ready !== "1") {
      finals.dataset.ready = "1";
      finals.addEventListener("change", () => {
        chrome.storage.sync.set({ checkFinals: finals.checked });
        window.dispatchEvent(new CustomEvent("mesh-helper-finals-toggle", { detail: { enabled: finals.checked } }));
      });
    }
    if (correctFinals && correctFinals.dataset.ready !== "1") {
      correctFinals.dataset.ready = "1";
      correctFinals.addEventListener("change", () => {
        chrome.storage.sync.set({ checkCorrectFinals: correctFinals.checked });
        window.dispatchEvent(new CustomEvent("mesh-helper-correct-finals-toggle", { detail: { enabled: correctFinals.checked } }));
      });
    }
    window.dispatchEvent(new CustomEvent("mesh-helper-panel-ready"));
    setTimeout(() => notifyFinalsState(finals, correctFinals), 80);
    return panel;
  }

  function tryEnsurePanelLimited() {
    panelAttempts += 1;
    try { ensurePanel(); } catch (e) { console.warn("[МЭШ помощник][panel] init error", e); }
    if (!document.getElementById(PANEL_ID) && panelAttempts < 10) setTimeout(tryEnsurePanelLimited, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tryEnsurePanelLimited, { once: true });
  else tryEnsurePanelLimited();
  setTimeout(tryEnsurePanelLimited, 1200);
  setTimeout(tryEnsurePanelLimited, 3000);
})();