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

  function readRawByName(name) {
    const raw = apiStore().raw || {};
    return Object.entries(raw)
      .filter(([key]) => key.includes(name))
      .flatMap(([, payload]) => asArray(payload));
  }

  function getPeriods() {
    const direct = asArray(apiStore().periods);
    return direct.length ? direct : readRawByName("attestation_periods");
  }

  function getGroups() {
    const direct = asArray(apiStore().groups);
    return direct.length ? direct : readRawByName("groups");
  }

  function getStudentProfiles() {
    const direct = asArray(apiStore().studentProfiles);
    return direct.length ? direct : readRawByName("student_profiles");
  }

  function getAverageMarks() {
    const direct = asArray(apiStore().averageMarks);
    return direct.length ? direct : readRawByName("average_marks");
  }

  function getMarks() {
    const direct = asArray(apiStore().marks);
    if (direct.length) return direct;
    const current = window.__MESH_HELPER_MARKS__?.marks;
    if (Array.isArray(current) && current.length) return current;
    return readRawByName("/marks");
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
    const value = group?.journal_id || group?.journalId || group?.id || group?.group_id || group?.groupId || null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : value;
  }

  function getGroupName(group) {
    return normalizeText(group?.group_name || group?.groupName || group?.name || group?.title || "");
  }

  function collectJournals() {
    const groups = getGroups();
    const periodCount = getPeriods().length;
    const byKey = new Map();

    groups.forEach((group) => {
      const journalId = getJournalId(group);
      const subject = getSubjectName(group);
      if (!journalId || !subject) return;

      const key = `${journalId}:${subject.toLowerCase()}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          journalId,
          subject,
          groupName: getGroupName(group),
          periodCount,
          raw: group
        });
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
      .map((item, index) => `
        <div class="mh-class-subject">
          <div><strong>${index + 1}. ${escapeHtml(item.subject)}</strong></div>
          <div class="mh-class-meta">journalId: ${escapeHtml(item.journalId || "id?")} · периодов: ${escapeHtml(item.periodCount || 0)}</div>
          ${item.groupName ? `<div class="mh-class-meta">группа: ${escapeHtml(item.groupName)}</div>` : ""}
        </div>`)
      .join("");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function downloadExcelHtml(journals) {
    if (!journals.length) {
      setStatus("Нет журналов для выгрузки. Сначала откройте список предметов класса.", "warn");
      return;
    }

    const rows = journals.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.subject)}</td>
        <td>${escapeHtml(item.groupName || "")}</td>
        <td>${escapeHtml(item.journalId || "")}</td>
        <td>${escapeHtml(item.periodCount || 0)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>`).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px}td,th{border:1px solid #999;padding:6px}th{background:#eaf2ff;font-weight:700}</style></head><body><table><tr><th>№</th><th>Предмет</th><th>Группа</th><th>journalId</th><th>Периодов</th><th>ФИО</th><th>Оценки периода</th><th>Средний</th><th>Итог</th><th>% Н</th></tr>${rows}</table></body></html>`;

    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mesh_class_export_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      setStatus(`Preview готов: найдено предметов — ${journals.length}. Проверьте список ниже.`, "ok");
    }

    window.__MESH_HELPER_CLASS_EXPORT_DEBUG__ = {
      checkedAt: Date.now(),
      teacherMode,
      journals,
      periods: getPeriods(),
      studentProfiles: getStudentProfiles(),
      marks: getMarks(),
      averageMarks: getAverageMarks()
    };

    console.log("[МЭШ помощник][class-export] journals:", journals);
  }

  function handleDownloadClick() {
    const journals = collectJournals();
    renderSubjects(journals);
    downloadExcelHtml(journals);
    window.__MESH_HELPER_CLASS_EXPORT_DEBUG__ = {
      checkedAt: Date.now(),
      teacherMode: isClassTeacherMode(),
      journals,
      periods: getPeriods(),
      studentProfiles: getStudentProfiles(),
      marks: getMarks(),
      averageMarks: getAverageMarks(),
      exportType: "excel-html"
    };
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
        <button id="mh-class-export-btn" class="mh-class-export-btn" type="button">Проверить журналы</button>
        <button id="mh-class-download-btn" class="mh-class-export-btn" type="button">Скачать Excel</button>
        <div id="mh-class-export-status" class="mh-class-status" data-tone="muted">Этап 1.5: сбор данных журналов.</div>
        <div id="mh-class-export-list" class="mh-class-list"></div>
      </div>`;

    const results = panel.querySelector(".mh-results");
    if (results) results.insertAdjacentElement("afterend", section);
    else panel.appendChild(section);

    const toggle = section.querySelector("#mh-class-toggle");
    const button = section.querySelector("#mh-class-export-btn");
    const downloadButton = section.querySelector("#mh-class-download-btn");

    setupToggle(panel, toggle);
    button?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleExportClick();
    });
    downloadButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleDownloadClick();
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
