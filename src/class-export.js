(() => {
  const PANEL_ID = "mesh-helper-panel";
  const SECTION_ID = "mh-class-export-section";
  const OPEN_KEY = "meshHelperClassOpen";

  if (window.__meshHelperClassExportInstalled) return;
  window.__meshHelperClassExportInstalled = true;

  const text = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();

  function apiStore() {
    return window.__MESH_HELPER_API__ || {};
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.response)) return value.response;
    if (Array.isArray(value?.data?.items)) return value.data.items;
    if (Array.isArray(value?.payload?.items)) return value.payload.items;
    return [];
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[–—]/g, "-")
      .trim();
  }

  function getPeriods() {
    const store = apiStore();
    const direct = asArray(store.periods);
    if (direct.length) return direct;

    const raw = store.raw || {};
    return Object.entries(raw)
      .filter(([key]) => key.includes("attestation_periods"))
      .flatMap(([, payload]) => asArray(payload));
  }

  function getGroups() {
    const store = apiStore();
    const direct = asArray(store.groups);
    if (direct.length) return direct;

    const raw = store.raw || {};
    return Object.entries(raw)
      .filter(([key]) => key.includes("groups"))
      .flatMap(([, payload]) => asArray(payload));
  }

  function getSubjectName(group) {
    return normalizeText(
      group?.subject_name ||
      group?.subject?.name ||
      group?.subject?.title ||
      group?.discipline_name ||
      group?.name ||
      group?.title ||
      "Без названия"
    );
  }

  function getJournalId(group) {
    return group?.journal_id || group?.journalId || group?.id || group?.group_id || group?.groupId || null;
  }

  function collectJournals() {
    const groups = getGroups();
    const byKey = new Map();

    groups.forEach((group) => {
      const journalId = getJournalId(group);
      const subject = getSubjectName(group);
      const key = `${journalId || "no-id"}:${subject}`;
      if (!byKey.has(key)) {
        byKey.set(key, { journalId, subject, raw: group });
      }
    });

    return [...byKey.values()].sort((a, b) => a.subject.localeCompare(b.subject, "ru"));
  }

  function isClassTeacherMode() {
    const url = location.href.toLowerCase();
    const pageText = text(document.body).toLowerCase();
    return (
      url.includes("class") ||
      url.includes("klass") ||
      pageText.includes("классное руководство") ||
      pageText.includes("мой класс") ||
      pageText.includes("классный руководитель")
    );
  }

  function setStatus(message, tone = "muted") {
    const status = document.getElementById("mh-class-export-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function renderSubjects(journals) {
    const list = document.getElementById("mh-class-export-list");
    if (!list) return;

    if (!journals.length) {
      list.innerHTML = '<div class="mh-class-empty">Журналы пока не найдены. Откройте страницу классного руководителя или дождитесь загрузки МЭШ.</div>';
      return;
    }

    list.innerHTML = journals
      .map((item) => `<div class="mh-class-subject"><span>${escapeHtml(item.subject)}</span><b>${escapeHtml(item.journalId || "id?")}</b></div>`)
      .join("");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function handleExportClick() {
    const journals = collectJournals();
    const teacherMode = isClassTeacherMode();

    renderSubjects(journals);

    if (!teacherMode) {
      setStatus(`Режим классного руководителя не подтверждён. Найдено журналов: ${journals.length}.`, "warn");
    } else if (!journals.length) {
      setStatus("Режим найден, но список журналов пока пуст. Обновите/откройте список предметов.", "warn");
    } else {
      setStatus(`Готово: найдено журналов/предметов — ${journals.length}. XLSX подключим следующим шагом.`, "ok");
    }

    window.__MESH_HELPER_CLASS_EXPORT_DEBUG__ = {
      checkedAt: Date.now(),
      teacherMode,
      journals,
      periods: getPeriods()
    };

    console.log("[МЭШ помощник][class-export] journals:", journals);
  }

  function setupToggle(panel, toggle) {
    if (toggle.dataset.ready === "1") return;
    toggle.dataset.ready = "1";

    let open = localStorage.getItem(OPEN_KEY) === "1";
    const apply = () => {
      panel.classList.toggle("mh-class-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      const arrow = toggle.querySelector(".mh-class-arrow");
      if (arrow) arrow.textContent = open ? "▲" : "▼";
    };

    apply();
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      open = !open;
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
      apply();
    });
  }

  function ensureSection() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || document.getElementById(SECTION_ID)) return;

    const section = document.createElement("div");
    section.id = SECTION_ID;
    section.className = "mh-section mh-class-export";
    section.innerHTML = `
      <div id="mh-class-toggle" class="mh-class-toggle" role="button" aria-expanded="false">
        <span>Мой класс</span>
        <span class="mh-class-arrow">▼</span>
      </div>
      <div class="mh-class-menu">
        <button id="mh-class-export-btn" class="mh-class-export-btn" type="button">Выгрузить класс</button>
        <div id="mh-class-export-status" class="mh-class-status" data-tone="muted">Этап 1: проверка режима и сбор списка журналов.</div>
        <div id="mh-class-export-list" class="mh-class-list"></div>
      </div>`;

    const results = panel.querySelector(".mh-results");
    if (results) results.insertAdjacentElement("afterend", section);
    else panel.appendChild(section);

    const toggle = section.querySelector("#mh-class-toggle");
    const button = section.querySelector("#mh-class-export-btn");

    setupToggle(panel, toggle);
    button?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleExportClick();
    });
  }

  function scheduleEnsure() {
    setTimeout(ensureSection, 50);
  }

  window.addEventListener("mesh-helper-panel-ready", scheduleEnsure);
  window.addEventListener("mesh-helper-api-updated", () => {
    const debug = window.__MESH_HELPER_CLASS_EXPORT_DEBUG__;
    if (debug) handleExportClick();
  });

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", scheduleEnsure, { once: true })
    : scheduleEnsure();
})();
