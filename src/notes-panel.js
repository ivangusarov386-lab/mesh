// ==========================================================
//  МЭШ – Помощник учителя
//  Заметки к классу — отдельная выезжающая панель слева от
//  основной. Заметки привязаны к конкретному журналу (id из
//  /journal/grade/<id>) и хранятся в chrome.storage.local, не
//  пересекаясь между разными классами/предметами.
// ==========================================================

(() => {
  if (window.__meshHelperNotesPanelInstalled) return;
  window.__meshHelperNotesPanelInstalled = true;

  const STORAGE_KEY = "meshHelperNotes";
  const DRAWER_ID = "mesh-helper-notes-drawer";
  const TOGGLE_ID = "mh-notes-toggle";

  function currentJournalId() {
    const match = location.pathname.match(/\/journal\/(?:grade|my)\/(\d+)/);
    return match ? match[1] : null;
  }

  function getAllNotes() {
    return new Promise((resolve) => chrome.storage.local.get(STORAGE_KEY, (data) => resolve(data?.[STORAGE_KEY] || {})));
  }

  function saveAllNotes(all) {
    return new Promise((resolve) => chrome.storage.local.set({ [STORAGE_KEY]: all }, resolve));
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function journalTitle() {
    return (document.querySelector("h1")?.textContent || document.title || "Текущий журнал").replace(/\s+/g, " ").trim();
  }

  function ensureDrawer() {
    let drawer = document.getElementById(DRAWER_ID);
    if (drawer) return drawer;

    drawer = document.createElement("div");
    drawer.id = DRAWER_ID;
    drawer.innerHTML = `
      <div class="mhn-header">
        <div class="mhn-title">Заметки к классу</div>
        <button class="mhn-close" type="button" aria-label="Закрыть">×</button>
      </div>
      <div class="mhn-subtitle"></div>
      <div class="mhn-add">
        <textarea class="mhn-input" rows="3" placeholder="Новая заметка..."></textarea>
        <button class="mhn-add-btn" type="button">Добавить</button>
      </div>
      <div class="mhn-list"></div>
    `;
    document.body.appendChild(drawer);

    drawer.querySelector(".mhn-close").addEventListener("click", closeDrawer);
    drawer.querySelector(".mhn-add-btn").addEventListener("click", addNote);
    return drawer;
  }

  async function addNote() {
    const journalId = currentJournalId();
    if (!journalId) return;
    const drawer = ensureDrawer();
    const input = drawer.querySelector(".mhn-input");
    const text = input.value.trim();
    if (!text) return;

    const all = await getAllNotes();
    if (!all[journalId]) all[journalId] = [];
    all[journalId].unshift({ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, date: Date.now(), text });
    await saveAllNotes(all);

    input.value = "";
    renderList(all[journalId]);
  }

  async function deleteNote(id) {
    const journalId = currentJournalId();
    if (!journalId) return;
    const all = await getAllNotes();
    all[journalId] = (all[journalId] || []).filter((note) => note.id !== id);
    await saveAllNotes(all);
    renderList(all[journalId]);
  }

  function renderList(notes) {
    const drawer = ensureDrawer();
    const list = drawer.querySelector(".mhn-list");
    if (!notes || !notes.length) {
      list.innerHTML = '<div class="mhn-empty">Заметок пока нет.</div>';
      return;
    }
    list.innerHTML = notes.map((note) => `
      <div class="mhn-item">
        <div class="mhn-item-date">${escapeHtml(formatDate(note.date))}</div>
        <div class="mhn-item-text">${escapeHtml(note.text)}</div>
        <button class="mhn-item-delete" type="button" data-id="${escapeHtml(note.id)}" aria-label="Удалить">×</button>
      </div>
    `).join("");
    list.querySelectorAll(".mhn-item-delete").forEach((btn) => {
      btn.addEventListener("click", () => deleteNote(btn.dataset.id));
    });
  }

  function positionDrawer(drawer) {
    const panel = document.getElementById("mesh-helper-panel");
    const width = drawer.offsetWidth || 340;
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
    const journalId = currentJournalId();
    const drawer = ensureDrawer();
    drawer.querySelector(".mhn-subtitle").textContent = journalId ? journalTitle() : "Откройте журнал класса, чтобы вести заметки.";
    drawer.querySelector(".mhn-add").style.display = journalId ? "block" : "none";
    drawer.classList.add("mhn-open");
    positionDrawer(drawer);
    renderList(journalId ? (await getAllNotes())[journalId] || [] : []);
  }

  function closeDrawer() {
    const drawer = document.getElementById(DRAWER_ID);
    if (drawer) drawer.classList.remove("mhn-open");
  }

  function toggleDrawer() {
    const drawer = document.getElementById(DRAWER_ID);
    if (drawer && drawer.classList.contains("mhn-open")) closeDrawer();
    else openDrawer();
  }

  function ensureToggleButton() {
    const panel = document.getElementById("mesh-helper-panel");
    if (!panel) return false;
    const header = panel.querySelector(".mh-header");
    if (!header || header.querySelector(`#${TOGGLE_ID}`)) return true;

    const btn = document.createElement("button");
    btn.id = TOGGLE_ID;
    btn.type = "button";
    btn.className = "mhn-toggle-btn";
    btn.textContent = "📝";
    btn.title = "Заметки к классу";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    });
    header.style.position = header.style.position || "relative";
    header.appendChild(btn);
    return true;
  }

  let attempts = 0;
  function tryEnsureButton() {
    attempts += 1;
    if (ensureToggleButton()) return;
    if (attempts < 15) setTimeout(tryEnsureButton, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tryEnsureButton, { once: true });
  else tryEnsureButton();
  setTimeout(tryEnsureButton, 1200);
  setTimeout(tryEnsureButton, 3000);
})();
