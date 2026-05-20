(() => {
  const DEFAULT_MIN = 5;
  const PANEL_ID = "mesh-helper-panel";
  const MINI_MIN_ID = "mh-mini-min";
  const CHECKS_OPEN_KEY = "meshHelperChecksOpen";
  let panelAttempts = 0;
  let minSaveTimer = null;

  function ensureTitle(panel) {
    const title = panel.querySelector(".mh-title");
    if (!title || title.querySelector(".mh-title-main")) return;
    title.innerHTML = '<div class="mh-title-main">Помощник учителя</div><div class="mh-title-sub">Проблемных: <span id="mh-problem-count">0</span></div>';
  }

  function syncMiniMin(panel, value) {
    const mini = panel.querySelector(`#${MINI_MIN_ID}`);
    const min = panel.querySelector("#mh-min");
    if (mini && String(mini.value) !== String(value)) mini.value = value;
    if (min && String(min.value) !== String(value)) min.value = value;
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

  function setupChecksMenu(panel) {
    const toggle = panel.querySelector("#mh-checks-toggle");
    const menu = panel.querySelector(".mh-checks-menu");
    const arrow = panel.querySelector(".mh-checks-arrow");
    const help = panel.querySelector("#mh-checks-help");
    if (!toggle || !menu || toggle.dataset.ready === "1") return;
    toggle.dataset.ready = "1";
    let open = localStorage.getItem(CHECKS_OPEN_KEY) === "1";
    const apply = () => {
      panel.classList.toggle("mh-checks-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (arrow) arrow.textContent = open ? "▲" : "▼";
    };
    apply();
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      open = !open;
      localStorage.setItem(CHECKS_OPEN_KEY, open ? "1" : "0");
      apply();
    });
    if (help) {
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventName) => {
        help.addEventListener(eventName, (e) => e.stopPropagation());
      });
    }
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
        <div class="mh-section mh-checks">
          <div id="mh-checks-toggle" class="mh-checks-toggle" role="button" aria-expanded="false"><span>Проверка оценок</span><span class="mh-checks-actions"><button id="mh-checks-help" class="mh-help" type="button" aria-label="Справка">?</button><span class="mh-checks-arrow">▼</span></span><div class="mh-help-popover"><b>Подсветка недобора</b> — красная подсветка учеников, у которых меньше оценок, чем указано в минимуме.<br><br><b>Контроль итогов</b> — синяя рамка, если итоговая оценка или «Г» не выставлены.<br><br><b>Проверка итогов</b> — жёлтая подсветка, если итог выставлен не по расчёту.</div></div>
          <div class="mh-checks-menu">
            <label class="mh-toggle-row" for="mh-highlight-low"><input id="mh-highlight-low" type="checkbox"><span>Подсветка недобора</span></label>
            <label class="mh-toggle-row" for="mh-check-finals"><input id="mh-check-finals" type="checkbox"><span>Контроль итогов</span></label>
            <label class="mh-toggle-row" for="mh-check-correct-finals"><input id="mh-check-correct-finals" type="checkbox"><span>Проверка итогов</span></label>
          </div>
        </div>
        <div class="mh-section mh-results"><div id="mh-summary" class="mh-subtitle">Ученики ниже нормы по оценкам: 0</div><div class="mh-export-wrap"><button id="mh-export-toggle" class="mh-export-toggle" type="button" aria-expanded="false">Экспорт ▼</button><div class="mh-export-menu"><button id="mh-export-problems" class="mh-export" type="button">Выгрузить проблемных</button><button id="mh-export-all" class="mh-export" type="button">Выгрузить весь класс</button></div></div><div id="mh-list" class="mh-list"></div></div>`;
      document.body.appendChild(panel);
    }
    ensureTitle(panel);
    ensureMiniMin(panel);
    setupCollapse(panel);
    setupChecksMenu(panel);
    setupExportMenu(panel);
    setupDrag(panel);
    const minInput = panel.querySelector("#mh-min");
    const save = panel.querySelector("#mh-save");
    const finals = panel.querySelector("#mh-check-finals");
    const correctFinals = panel.querySelector("#mh-check-correct-finals");
    chrome.storage.sync.get(["minGrades", "checkFinals", "checkCorrectFinals"], (data) => {
      const value = typeof data.minGrades === "number" ? data.minGrades : DEFAULT_MIN;
      syncMiniMin(panel, value);
      if (finals) finals.checked = data.checkFinals === true;
      if (correctFinals) correctFinals.checked = data.checkCorrectFinals === true;
      notifyFinalsState(finals, correctFinals);
    });
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