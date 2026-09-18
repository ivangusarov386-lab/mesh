// ==========================================================
//  МЭШ – Помощник учителя
//  Background service worker (эксперимент)
//
//  Единственная задача: вести фоновую (неактивную) вкладку через
//  все журналы класса, чтобы не занимать текущую вкладку учителя.
//  Сама логика сбора данных (marks/attendances/schedule_items/
//  student_profiles) не меняется и не переезжает сюда — она
//  по-прежнему целиком в class-auto-loader.js. Этот файл только
//  открывает вкладку на первом журнале и переключает её на
//  следующий, когда content script сообщает, что закончил.
// ==========================================================

const STORAGE_KEY = "meshHelperClassBatch";
const SOURCE = "mesh-helper-background";

function journalUrl(id) {
  return `https://school.mos.ru/teacher/study-process/journal/grade/${id}?logon_source=teacher_mentor_journals`;
}

async function getBatch() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data?.[STORAGE_KEY] || null;
}

async function startBackgroundBatch(journals) {
  if (!Array.isArray(journals) || !journals.length) return;

  const batch = {
    status: "running",
    mode: "background",
    startedAt: Date.now(),
    queue: journals.map((journal) => ({ ...journal, status: "pending" })),
    currentIndex: 0,
    results: {}
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: batch });
  await chrome.tabs.create({ url: journalUrl(journals[0].id), active: false });
}

async function advanceBackgroundBatch(tabId) {
  const batch = await getBatch();
  if (!batch || batch.status !== "running" || batch.mode !== "background") return;

  if (batch.currentIndex >= batch.queue.length) {
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
    return;
  }

  const nextItem = batch.queue[batch.currentIndex];
  if (tabId && nextItem) chrome.tabs.update(tabId, { url: journalUrl(nextItem.id) }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source !== SOURCE) return undefined;

  if (message.type === "start") {
    startBackgroundBatch(message.journals).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "advance") {
    advanceBackgroundBatch(sender.tab?.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  return undefined;
});
