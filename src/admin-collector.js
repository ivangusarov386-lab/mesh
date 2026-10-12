// ==========================================================
//  МЭШ – Помощник учителя
//  Admin collector (эксперимент, «Режим администратора» —
//  пока только для личного использования, не часть публичной
//  сборки).
//
//  Задача: на странице «Журналы классов» админ-модуля
//  (school.mos.ru/educationmanagement/manage/journals) —
//  программно выбрать параллель, перебрать все классы через
//  фильтр «Класс» и собрать пары предмет → targetGroupId.
//
//  Список классов в этом модуле виртуализирован (простой
//  скролл даёт обрывки чужих карточек), поэтому обход идёт
//  не скроллом, а через нативный фильтр «Класс» — там список
//  классов конечный и не виртуализированный. Карточки вида
//  «N НДО Фамилия Имя Отчество» — это персональные карточки
//  учеников индивидуального обучения, дублирующие данные уже
//  существующего буквенного класса (проверено: совпадают
//  оценки и список учеников), поэтому исключаются при сборе.
//  Также внутри одного класса иногда всплывают 1-2 лишних
//  дубля предмета (утечка состояния виртуализированного
//  списка) — отбрасываются дедупом по названию предмета.
//
//  Захват самих оценок на странице журнала делает уже
//  существующий штатный канал marks-api-hook.js →
//  marks-api-bridge.js, этот файл его не трогает.
//
//  Ручное управление из консоли (на странице
//  /educationmanagement/manage/journals):
//    window.__MESH_HELPER_ADMIN_COLLECTOR__.collectParallel(8).then(console.log)
//    window.__MESH_HELPER_ADMIN_COLLECTOR__.collectParallels([7, 8]).then(console.log)
// ==========================================================

(() => {
  if (window.__meshHelperAdminCollectorInstalled) return;
  window.__meshHelperAdminCollectorInstalled = true;

  const ADMIN_JOURNALS_PATH = "/educationmanagement/manage/journals";
  const JOURNAL_GROUP_LINK_SELECTOR = 'a[href*="/educationmanagement/manage/journals/group"]';
  const PARALLEL_LABEL_TEXT = "Параллель";
  const CLASS_LABEL_TEXT = "Класс";
  const DROPDOWN_OPEN_WAIT_MS = 400;
  const AFTER_CLICK_WAIT_MS = 300;
  const SUBJECT_LINKS_TIMEOUT_MS = 5000;

  function log(...args) {
    console.log("[МЭШ помощник][admin-collector]", ...args);
  }

  function isAdminJournalsPage() {
    return location.pathname.startsWith(ADMIN_JOURNALS_PATH) && !location.pathname.includes("/group");
  }

  function leafWithText(text) {
    return [...document.querySelectorAll("*")].find(
      (el) => el.children.length === 0 && el.textContent.trim() === text
    );
  }

  // ---- «Параллель»: обычный выпадающий список, рендерится в <ul class="qtP2w1QM"> ----

  function openParallelDropdown() {
    const label = leafWithText(PARALLEL_LABEL_TEXT);
    const control = label?.nextElementSibling;
    const alreadyOpen = !!document.querySelector("ul.qtP2w1QM");
    if (!alreadyOpen) control?.click();
    return control;
  }

  function selectParallel(n) {
    return new Promise((resolve) => {
      openParallelDropdown();
      setTimeout(() => {
        const list = document.querySelector("ul.qtP2w1QM") || document.querySelector('[role="tooltip"] ul');
        const li = [...(list?.querySelectorAll("li") || [])].find((x) => x.textContent.trim() === String(n));
        li?.click();
        setTimeout(() => resolve(!!li), DROPDOWN_OPEN_WAIT_MS);
      }, AFTER_CLICK_WAIT_MS);
    });
  }

  // ---- «Класс»: MUI-тултип с data-test-component, список классов текущей параллели ----

  function classContainer() {
    return [...document.querySelectorAll('[data-test-component="undefined-TooltipInSingleSelect-TooltipContainer"]')].find(
      (c) => c.querySelector("span")
    );
  }

  function classToggleButton() {
    return classContainer()?.querySelector('button[data-test-component="undefined-iconButtonComponent"]');
  }

  function openClassDropdown() {
    const alreadyOpen = !!document.querySelector('[data-test-component="undefined-selectDropdown"]');
    if (!alreadyOpen) classToggleButton()?.click();
  }

  function getClassOptions() {
    return new Promise((resolve) => {
      openClassDropdown();
      setTimeout(() => {
        const pop = document.querySelector('[data-test-component="undefined-selectDropdown"]');
        const items = [...(pop?.querySelectorAll("li") || [])]
          .map((li) => {
            const dtc = li.getAttribute("data-test-component") || "";
            const match = dtc.match(/undefined-(-?\d+)/);
            return { id: match ? match[1] : null, label: li.textContent.trim() };
          })
          .filter((x) => x.id && x.id !== "-1");
        resolve(items);
      }, DROPDOWN_OPEN_WAIT_MS);
    });
  }

  function selectClassById(id) {
    return new Promise((resolve) => {
      openClassDropdown();
      setTimeout(() => {
        const li = document.querySelector(`[data-test-component="undefined-${id}"]`);
        li?.click();
        setTimeout(() => resolve(!!li), AFTER_CLICK_WAIT_MS);
      }, AFTER_CLICK_WAIT_MS);
    });
  }

  function waitForSubjectLinks(timeoutMs = SUBJECT_LINKS_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const start = Date.now();
      const iv = setInterval(() => {
        const n = document.querySelectorAll(JOURNAL_GROUP_LINK_SELECTOR).length;
        if (n > 0 || Date.now() - start > timeoutMs) {
          clearInterval(iv);
          resolve(n);
        }
      }, 150);
    });
  }

  function collectCurrentClassSubjects() {
    const raw = [...document.querySelectorAll(JOURNAL_GROUP_LINK_SELECTOR)]
      .map((a) => {
        const match = a.href.match(/targetGroupId=(\d+)/);
        return match ? { id: match[1], subject: (a.textContent || "").replace(/\s+/g, " ").trim() } : null;
      })
      .filter(Boolean);
    const seenSubjects = new Set();
    const deduped = [];
    for (const item of raw) {
      if (seenSubjects.has(item.subject)) continue;
      seenSubjects.add(item.subject);
      deduped.push(item);
    }
    return deduped;
  }

  async function collectAllClassesInCurrentParallel() {
    const classes = await getClassOptions();
    const realClasses = classes.filter((c) => !/НДО/.test(c.label));
    log(`классов для сбора (без НДО): ${realClasses.length} из ${classes.length}`);
    const result = [];
    for (const cls of realClasses) {
      await selectClassById(cls.id);
      await waitForSubjectLinks();
      const subs = collectCurrentClassSubjects();
      subs.forEach((s) => result.push({ ...s, classLabel: cls.label, classId: cls.id }));
      log(`собрано: ${cls.label} — ${subs.length} предметов`);
    }
    return result;
  }

  async function collectParallel(n) {
    await selectParallel(n);
    const data = await collectAllClassesInCurrentParallel();
    log(`параллель ${n}: итого записей — ${data.length}`);
    return data;
  }

  async function collectParallels(numbers) {
    const all = [];
    for (const n of numbers) {
      const data = await collectParallel(n);
      all.push(...data);
    }
    log(`всего по параллелям [${numbers.join(", ")}]: ${all.length} записей`);
    return all;
  }

  window.__MESH_HELPER_ADMIN_COLLECTOR__ = {
    isAdminJournalsPage,
    selectParallel,
    getClassOptions,
    selectClassById,
    collectCurrentClassSubjects,
    collectAllClassesInCurrentParallel,
    collectParallel,
    collectParallels
  };

  if (isAdminJournalsPage()) {
    log("готов. window.__MESH_HELPER_ADMIN_COLLECTOR__.collectParallel(N) для сбора одной параллели.");
  }
})();
