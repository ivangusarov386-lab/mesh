// ==========================================================
//  МЭШ – Помощник учителя
//  Class auto loader (эксперимент, ветка stable-export-v2)
//
//  Задача: последовательно обойти все журналы класса —
//  настоящей навигацией браузера (location.href), точно так
//  же, как это делает сам учитель кликом по списку. Прямой
//  fetch к чужому journal_id в обход навигации МЭШ отдаёт 403,
//  это проверено на реальном журнале — поэтому обхода нет,
//  только честный последовательный переход по страницам.
//
//  На каждой странице оценки ловит уже существующий штатный
//  канал: marks-api-hook.js → marks-api-bridge.js. Этот файл
//  их не трогает, только ждёт события mesh-helper-marks-updated
//  и складывает пойманное в chrome.storage.local — она одна
//  переживает полную перезагрузку страницы между журналами.
//
//  Управление вручную из консоли (на странице «Журналы класса»):
//    window.__MESH_HELPER_CLASS_AUTO_LOADER__.startBatch()
//    window.__MESH_HELPER_CLASS_AUTO_LOADER__.getResults().then(console.log)
//    window.__MESH_HELPER_CLASS_AUTO_LOADER__.stopBatch()
// ==========================================================

(() => {
  if (window.__meshHelperClassAutoLoaderInstalled) return;
  window.__meshHelperClassAutoLoaderInstalled = true;

  const STORAGE_KEY = "meshHelperClassBatch";
  const NAV_DELAY_MS = 900;
  const MARKS_WAIT_TIMEOUT_MS = 7000;
  const JOURNAL_LINK_SELECTOR = 'a[href*="/journal/grade/"]';

  function log(...args) {
    console.log("[МЭШ помощник][class-auto-loader]", ...args);
  }

  function journalUrl(id) {
    return `/teacher/study-process/journal/grade/${id}?logon_source=teacher_mentor_journals`;
  }

  function getStorage(key) {
    return new Promise((resolve) => chrome.storage.local.get(key, (result) => resolve(result?.[key])));
  }

  function setStorage(key, value) {
    return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, resolve));
  }

  function currentJournalIdFromPath() {
    const match = location.pathname.match(/\/journal\/grade\/(\d+)/);
    return match ? match[1] : null;
  }

  function collectJournalsFromList() {
    const seen = new Set();
    return [...document.querySelectorAll(JOURNAL_LINK_SELECTOR)]
      .map((a) => {
        const match = a.href.match(/\/journal\/grade\/(\d+)/);
        return match ? { id: match[1], text: a.textContent.replace(/\s+/g, " ").trim() } : null;
      })
      .filter(Boolean)
      .filter((journal) => (seen.has(journal.id) ? false : (seen.add(journal.id), true)));
  }

  function navigateToIndex(batch, index) {
    const item = batch.queue[index];
    if (!item) return;
    location.href = journalUrl(item.id);
  }

  async function startBatch() {
    const journals = collectJournalsFromList();
    if (!journals.length) {
      log("Список журналов не найден. Откройте страницу «Журналы класса» и повторите.");
      return { ok: false, reason: "no-journals-found" };
    }

    const batch = {
      status: "running",
      startedAt: Date.now(),
      queue: journals.map((journal) => ({ ...journal, status: "pending" })),
      currentIndex: 0,
      results: {}
    };
    await setStorage(STORAGE_KEY, batch);
    log(`Старт: ${journals.length} журналов в очереди. Перехожу к первому.`);
    navigateToIndex(batch, 0);
    return { ok: true, total: journals.length };
  }

  async function stopBatch() {
    const batch = await getStorage(STORAGE_KEY);
    if (batch) {
      batch.status = "stopped";
      await setStorage(STORAGE_KEY, batch);
    }
    log("Остановлено пользователем.");
  }

  async function getResults() {
    return (await getStorage(STORAGE_KEY)) || null;
  }

  function waitForMarks() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (found) => {
        if (done) return;
        done = true;
        window.removeEventListener("mesh-helper-marks-updated", onUpdate);
        resolve(found);
      };
      const onUpdate = () => finish(true);
      window.addEventListener("mesh-helper-marks-updated", onUpdate);
      if (window.__MESH_HELPER_MARKS__?.loadedAt) {
        finish(true);
        return;
      }
      setTimeout(() => finish(false), MARKS_WAIT_TIMEOUT_MS);
    });
  }

  function captureMarksForJournal(journalId) {
    const api = window.__MESH_HELPER_API__ || {};
    const marks = Array.isArray(api.marks) ? api.marks : [];
    const own = marks.filter((mark) => {
      const groupId = mark?.group_id || mark?.groupId || mark?.journal_id || mark?.journalId;
      return groupId !== undefined && String(groupId) === String(journalId);
    });
    return own.length ? own : marks;
  }

  async function resumeIfRunning() {
    const batch = await getStorage(STORAGE_KEY);
    if (!batch || batch.status !== "running") return;

    const journalId = currentJournalIdFromPath();
    const item = batch.queue[batch.currentIndex];
    if (!item || !journalId || String(item.id) !== String(journalId)) return;

    item.status = "loading";
    await setStorage(STORAGE_KEY, batch);

    const found = await waitForMarks();
    const marks = found ? captureMarksForJournal(journalId) : [];

    item.status = found ? "done" : "empty";
    batch.results[journalId] = { text: item.text, count: marks.length, marks, capturedAt: Date.now() };
    log(`${item.text}: ${found ? `поймано записей: ${marks.length}` : "таймаут, оценок не поймано"}`);

    const nextIndex = batch.currentIndex + 1;
    batch.currentIndex = nextIndex;
    await setStorage(STORAGE_KEY, batch);

    if (nextIndex >= batch.queue.length) {
      batch.status = "done";
      await setStorage(STORAGE_KEY, batch);
      log(`Готово. Журналов обработано: ${batch.queue.length}.`);
      return;
    }

    setTimeout(() => {
      getStorage(STORAGE_KEY).then((fresh) => {
        if (fresh?.status === "running") navigateToIndex(fresh, nextIndex);
      });
    }, NAV_DELAY_MS);
  }

  window.__MESH_HELPER_CLASS_AUTO_LOADER__ = { startBatch, stopBatch, getResults, collectJournalsFromList };

  resumeIfRunning();
})();
