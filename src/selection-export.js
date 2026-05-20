// ==========================================================
//  МЭШ – Помощник учителя
//  Выбор учеников из списка проблемных и базовый экспорт ФИО.
//
//  Важно:
//  - не трогает подсчёты и подсветку;
//  - не меняет существующие экспорты;
//  - работает поверх уже отрисованной панели.
// ==========================================================

(() => {
  const SELECTED_CLASS = "mh-selected-student";
  const SELECT_BTN_CLASS = "mh-select-student";
  const EXPORT_SELECTED_ID = "mh-export-selected";

  const selected = new Map();
  let timer = null;

  function text(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function csvValue(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function downloadSelectedCsv() {
    const rows = [...selected.values()].map((name) => ({ "ФИО": name }));

    if (!rows.length) {
      alert("Выберите хотя бы одного ученика.");
      return;
    }

    const headers = ["ФИО"];
    const csv = "\ufeff" + [
      headers.map(csvValue).join(";"),
      ...rows.map((row) => headers.map((h) => csvValue(row[h])).join(";"))
    ].join("\n");

    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mesh_vybrannye_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function ensureExportSelectedButton() {
    const menu = document.querySelector("#mesh-helper-panel .mh-export-menu");
    if (!menu || document.getElementById(EXPORT_SELECTED_ID)) return;

    const btn = document.createElement("button");
    btn.id = EXPORT_SELECTED_ID;
    btn.className = "mh-export";
    btn.type = "button";
    btn.textContent = "Выгрузить выбранных";
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      downloadSelectedCsv();
    });

    menu.appendChild(btn);
  }

  function applyButtonState(button, item, name) {
    const isSelected = selected.has(name);
    button.textContent = isSelected ? "Выбран" : "Выбрать";
    button.classList.toggle(SELECTED_CLASS, isSelected);
    item?.classList.toggle(SELECTED_CLASS, isSelected);
  }

  function enhanceListButtons() {
    const list = document.querySelector("#mesh-helper-panel #mh-list");
    if (!list) return;

    list.querySelectorAll(".mh-item").forEach((item) => {
      const name = text(item.querySelector(".mh-name"));
      if (!name) return;

      const button = item.querySelector(".mh-goto, .mh-select-student");
      if (!button) return;

      button.classList.add(SELECT_BTN_CLASS);
      button.classList.remove("mh-goto");
      button.removeAttribute("data-hybrid-id");
      button.dataset.studentName = name;
      applyButtonState(button, item, name);

      if (button.dataset.selectionReady === "1") return;
      button.dataset.selectionReady = "1";

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentName = button.dataset.studentName || name;
        if (selected.has(currentName)) selected.delete(currentName);
        else selected.set(currentName, currentName);

        applyButtonState(button, item, currentName);
      }, true);
    });
  }

  function refresh() {
    ensureExportSelectedButton();
    enhanceListButtons();
  }

  function scheduleRefresh(delay = 120) {
    clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  }

  window.addEventListener("mesh-helper-panel-ready", () => scheduleRefresh(100));
  window.addEventListener("mesh-helper-min-grades-changed", () => scheduleRefresh(200));
  window.addEventListener("mesh-helper-marks-updated", () => scheduleRefresh(500));

  new MutationObserver(() => scheduleRefresh(120)).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scheduleRefresh(300), { once: true });
  } else {
    scheduleRefresh(300);
  }
})();
