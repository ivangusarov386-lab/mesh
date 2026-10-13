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
//
//  Отсутствует ДЗ — на странице конкретного журнала:
//    window.__MESH_HELPER_ADMIN_COLLECTOR__.getMissingHomeworkDatesForCurrentJournal()
//
//  Важное про семантику API (найдено экспериментально, см. сессию
//  переписки — не очевидно и легко перепутать заново):
//  каждый урок (schedule_item) из /schedule_items несёт два поля:
//    - homeworks_to_give   — ДЗ, у которого date_assigned_on СОВПАЛ
//      с датой именно этого урока. НЕНАДЁЖНО: учитель часто создаёт
//      ДЗ не в день урока (а, например, вечером того же дня или
//      через день), и тогда это поле у «правильного» урока = null,
//      хотя ДЗ реально было задано для проверки к следующему уроку.
//    - homeworks_to_verify — ДЗ, у которого date_prepared_for
//      (срок проверки) СОВПАЛ с датой этого урока. НАДЁЖНО: именно
//      это поле соответствует тому, что видит учитель во
//      всплывающем окне «Домашнее задание» при клике на дату, и
//      тексту «Домашнее задание отсутствует», когда оно пустое.
//  Поэтому «отсутствует ДЗ» для урока определяется по
//  homeworks_to_verify, а не по homeworks_to_give.
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

  async function collectAllClassesInCurrentParallel(classIdFilter) {
    const classes = await getClassOptions();
    let realClasses = classes.filter((c) => !/НДО/.test(c.label));
    if (Array.isArray(classIdFilter) && classIdFilter.length) {
      const filterIds = new Set(classIdFilter.map(String));
      realClasses = realClasses.filter((c) => filterIds.has(String(c.id)));
    }
    log(`классов для сбора: ${realClasses.length} из ${classes.length}`);
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

  async function collectParallel(n, classIdFilter) {
    await selectParallel(n);
    const data = await collectAllClassesInCurrentParallel(classIdFilter);
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

  // ---- Список классов по параллелям (без захода в предметы — быстро) ----
  // ---- для пикера в панели: отметить нужные классы галочками. ----

  async function listClassesForParallel(n) {
    const selected = await selectParallel(n);
    if (!selected) return []; // такой параллели нет в школе — не приписываем ей чужие классы
    const classes = await getClassOptions();
    return classes.filter((c) => !/НДО/.test(c.label)).map((c) => ({ id: c.id, label: c.label, parallel: n }));
  }

  async function listAllClasses(parallels) {
    const nums = Array.isArray(parallels) && parallels.length ? parallels : Array.from({ length: 11 }, (_, i) => i + 1);
    const all = [];
    for (const n of nums) {
      const classes = await listClassesForParallel(n);
      if (classes.length) all.push(...classes);
      log(`параллель ${n}: классов найдено — ${classes.length}`);
    }
    return all;
  }

  async function collectSelectedClasses(selection) {
    const byParallel = new Map();
    (selection || []).forEach((cls) => {
      const parallel = Number(cls.parallel);
      if (!byParallel.has(parallel)) byParallel.set(parallel, []);
      byParallel.get(parallel).push(cls.id);
    });
    const all = [];
    for (const [parallel, classIds] of byParallel) {
      const data = await collectParallel(parallel, classIds);
      all.push(...data);
    }
    return all;
  }

  async function collectMissingHomeworkForSelectedClasses(selection) {
    const journals = await collectSelectedClasses(selection);
    return startAdminBatchInBackground(journals);
  }

  // ---- «Отсутствует ДЗ»: дата урока считается «без ДЗ», если к ней ----
  // ---- не привязано ни одной записи homeworks_to_verify (см. выше), И ----
  // ---- при этом учитель явно НЕ нажимал «Без домашнего задания» — это ----
  // ---- действие создаёт отдельную запись через POST /homework_absences ----
  // ---- (group_id + date), никак не связанную с homeworks_to_give/verify. ----
  // ---- Такую дату нужно исключать: это осознанное решение «ДЗ не нужно», ----
  // ---- а не упущение, которое должен ловить этот столбец. ----

  function compareYmd(a, b) {
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  }

  function formatYmd([y, m, d]) {
    return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  }

  function todayYmd() {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  }

  function parseDdMmYyyy(str) {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(str || ""));
    return match ? [Number(match[3]), Number(match[2]), Number(match[1])] : null;
  }

  function buildHomeworkAbsenceKeys(homeworkAbsences) {
    const keys = new Set();
    (homeworkAbsences || []).forEach((rec) => {
      if (rec?.deleted_at) return;
      const ymd = parseDdMmYyyy(rec?.date);
      if (!ymd || rec?.group_id === undefined || rec?.group_id === null) return;
      keys.add(`${rec.group_id}-${ymd.join("-")}`);
    });
    return keys;
  }

  function findMissingHomeworkDates(scheduleItems, todayDate, homeworkAbsences) {
    const today = todayDate || todayYmd();
    const absenceKeys = buildHomeworkAbsenceKeys(homeworkAbsences);
    const seen = new Set();
    const results = [];

    (scheduleItems || [])
      .filter((item) => Array.isArray(item?.date) && item.date.length === 3 && item.lesson_name)
      .filter((item) => !item.cancelled)
      .filter((item) => compareYmd(item.date, today) <= 0)
      .forEach((item) => {
        const hasVerify = Array.isArray(item.homeworks_to_verify) && item.homeworks_to_verify.length > 0;
        if (hasVerify) return;
        if (absenceKeys.has(`${item.group_id}-${item.date.join("-")}`)) return;
        const key = item.date.join("-");
        if (seen.has(key)) return;
        seen.add(key);
        results.push(formatYmd(item.date));
      });

    results.sort((a, b) => {
      const pa = a.split(".").reverse().join("-");
      const pb = b.split(".").reverse().join("-");
      return pa.localeCompare(pb);
    });

    return results;
  }

  function getMissingHomeworkDatesForCurrentJournal(todayDate) {
    const schedule = window.__MESH_HELPER_API__?.schedule || [];
    const homeworkAbsences = window.__MESH_HELPER_API__?.homeworkAbsences || [];
    return findMissingHomeworkDates(schedule, todayDate, homeworkAbsences);
  }

  // ---- Фоновый обход журналов: открывает каждый targetGroupId в фоновой ----
  // ---- вкладке (как «Все классы»), ждёт загрузки и собирает «Отсутствует ----
  // ---- ДЗ» по каждому. Отдельный storage key — не пересекается с батчем ----
  // ---- «Мой класс»/«Все классы» в class-auto-loader.js. ----

  const ADMIN_STORAGE_KEY = "meshHelperAdminBatch";
  const ADMIN_LAST_RESULTS_KEY = "meshHelperAdminLastResults";
  const ADMIN_MARKS_WAIT_TIMEOUT_MS = 15000;

  function currentAdminJournalIdFromQuery() {
    return new URLSearchParams(location.search).get("targetGroupId");
  }

  function getStorage(key) {
    return new Promise((resolve) => chrome.storage.local.get(key, (result) => resolve(result?.[key])));
  }

  function setStorage(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          console.error("[МЭШ помощник][admin-collector] ОШИБКА ЗАПИСИ в storage:", chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  }

  function waitForAdminMarks() {
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
      setTimeout(() => finish(false), ADMIN_MARKS_WAIT_TIMEOUT_MS);
    });
  }

  // schedule_items (с полями homeworks_to_give/to_verify) грузится отдельным,
  // более медленным запросом, чем оценки — дожидаться только marks недостаточно
  // (проверено вживую: при быстром фоновом обходе расписание начала сентября
  // не успевало накопиться, и результат получался ложно пустым).
  function waitForAdminApiKind(kind, fallbackMs = 12000) {
    const GRACE_MS = 1200;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener("mesh-helper-api-updated", onUpdate);
        resolve();
      };
      const onUpdate = (event) => {
        if (event?.detail?.kind === kind) setTimeout(finish, GRACE_MS);
      };
      window.addEventListener("mesh-helper-api-updated", onUpdate);
      const current = window.__MESH_HELPER_API__?.[kind];
      if (Array.isArray(current) && current.length) {
        setTimeout(finish, GRACE_MS);
        return;
      }
      setTimeout(finish, fallbackMs);
    });
  }

  // ---- Захват оценок/посещаемости/учителя для текущего журнала — тот же ----
  // ---- подход, что в class-auto-loader.js, продублирован здесь, т.к. это ----
  // ---- отдельный модуль/closure и там эти функции не экспортированы. ----

  function getStudentIdFromMark(mark) {
    const id = mark?.student_profile_id ?? mark?.studentProfileId ?? mark?.student_profile?.id ?? mark?.student?.id;
    return id !== undefined && id !== null ? String(id) : null;
  }

  function getMarkValue(mark) {
    return String(mark?.name || mark?.value || mark?.mark || mark?.mark_value || "").trim();
  }

  function isGrade(value) {
    return /^[1-5]$/.test(value);
  }

  function getStudentIdFromAttendance(record) {
    const id = record?.student_profile_id ?? record?.studentProfileId;
    return id !== undefined && id !== null ? String(id) : null;
  }

  function getProfileId(profile) {
    const id = profile?.id ?? profile?.student_profile_id ?? profile?.studentProfileId;
    return id !== undefined && id !== null ? String(id) : null;
  }

  function getProfileName(profile) {
    const short = profile?.short_name || profile?.shortName;
    if (short) return String(short).trim();
    const parts = [profile?.last_name || profile?.lastName, profile?.first_name || profile?.firstName, profile?.middle_name || profile?.middleName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return parts || `Ученик ${profile?.id ?? ""}`.trim();
  }

  function averageForStudent(marks, studentId) {
    const grades = marks
      .filter((mark) => getStudentIdFromMark(mark) === studentId)
      .map(getMarkValue)
      .filter(isGrade)
      .map(Number);
    if (!grades.length) return { count: 0, avg: null };
    const avg = Math.round((grades.reduce((sum, grade) => sum + grade, 0) / grades.length) * 100) / 100;
    return { count: grades.length, avg };
  }

  function attendanceForStudent(attendances, studentId, heldLessons) {
    const absences = attendances.filter((record) => getStudentIdFromAttendance(record) === studentId).length;
    const total = heldLessons || 0;
    const percent = total ? Math.round((absences / total) * 1000) / 10 : 0;
    return { absences, total, percent };
  }

  function gradesTextForStudent(marks, studentId) {
    return marks
      .filter((mark) => getStudentIdFromMark(mark) === studentId)
      .map(getMarkValue)
      .filter(isGrade)
      .join(", ");
  }

  function overallStatsForStudentInClass(journalsForClass, studentId, absenceThreshold) {
    const allGrades = [];
    let absences = 0;
    let total = 0;
    let risk = false;
    (journalsForClass || []).forEach((journal) => {
      const marks = journal.marks || [];
      const attendances = journal.attendances || [];
      const heldLessons = journal.heldLessons || 0;
      marks
        .filter((mark) => getStudentIdFromMark(mark) === studentId)
        .map(getMarkValue)
        .filter(isGrade)
        .forEach((value) => allGrades.push(Number(value)));
      const subAbsences = attendances.filter((record) => getStudentIdFromAttendance(record) === studentId).length;
      absences += subAbsences;
      total += heldLessons;
      if (heldLessons && Math.round((subAbsences / heldLessons) * 1000) / 10 >= absenceThreshold) risk = true;
    });
    const avg = allGrades.length ? Math.round((allGrades.reduce((sum, grade) => sum + grade, 0) / allGrades.length) * 100) / 100 : null;
    const percent = total ? Math.round((absences / total) * 1000) / 10 : 0;
    return { avg, count: allGrades.length, absences, total, percent, risk };
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

  function isLessonHeld(record) {
    if (record?.cancelled) return false;
    const parts = Array.isArray(record?.date) ? record.date : null;
    if (!parts || parts.length < 3) return false;
    const [y, m, d] = parts;
    const lessonDate = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    lessonDate.setHours(0, 0, 0, 0);
    return lessonDate.getTime() <= today.getTime();
  }

  function countHeldLessonsForJournal(journalId) {
    const api = window.__MESH_HELPER_API__ || {};
    const schedule = Array.isArray(api.schedule) ? api.schedule : [];
    return schedule.filter((item) => String(item.group_id) === String(journalId) && isLessonHeld(item)).length;
  }

  function teacherNameForJournal(journalId) {
    const api = window.__MESH_HELPER_API__ || {};
    const schedule = Array.isArray(api.schedule) ? api.schedule : [];
    const withTeacher = schedule.find((item) => String(item.group_id) === String(journalId) && item.teacher_name);
    return withTeacher?.teacher_name || "";
  }

  function captureStudentsForJournal() {
    const api = window.__MESH_HELPER_API__ || {};
    const profiles = Array.isArray(api.studentProfiles) ? api.studentProfiles : [];
    const byId = new Map();
    profiles.forEach((profile) => {
      const id = getProfileId(profile);
      if (!id || byId.has(id)) return;
      byId.set(id, { id, name: getProfileName(profile) });
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  // ---- Настраиваемые пороги — те же ключи chrome.storage.sync, что уже ----
  // ---- редактируются в панели у «Мой класс»/«Все классы»: значение, ----
  // ---- выставленное там, автоматически действует и здесь. ----

  function getProblemAvgThreshold() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["classProblemAvg"], (data) => {
        const value = Number(data.classProblemAvg);
        resolve(Number.isFinite(value) && value > 0 ? value : 3);
      });
    });
  }

  function getAbsencePercentThreshold() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["classAbsencePercent"], (data) => {
        const value = Number(data.classAbsencePercent);
        resolve(Number.isFinite(value) && value > 0 ? value : 50);
      });
    });
  }

  const DEFAULT_FINAL_GRADE_RANGES = {
    2: { from: 1, to: 2.59 },
    3: { from: 2.6, to: 3.59 },
    4: { from: 3.6, to: 4.59 },
    5: { from: 4.6, to: 5 }
  };

  function getFinalGradeRanges() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["finalGradeRanges"], (data) => {
        resolve(data.finalGradeRanges || DEFAULT_FINAL_GRADE_RANGES);
      });
    });
  }

  function possibleFinal(avg, ranges = DEFAULT_FINAL_GRADE_RANGES) {
    const n = Number(avg);
    if (!Number.isFinite(n)) return "";
    for (const grade of [5, 4, 3, 2]) {
      const r = ranges[grade];
      if (r && n >= r.from && n <= r.to) return grade;
    }
    for (const grade of [5, 4, 3, 2]) {
      const r = ranges[grade];
      if (r && n >= r.from) return grade;
    }
    return 2;
  }

  async function startAdminBatchInBackground(journals) {
    if (!Array.isArray(journals) || !journals.length) {
      log("Пустой список журналов — нечего собирать.");
      return { ok: false, reason: "empty" };
    }
    const batch = {
      status: "running",
      mode: "background",
      startedAt: Date.now(),
      queue: journals.map((j) => ({ ...j, status: "pending" })),
      currentIndex: 0,
      results: {}
    };
    await setStorage(ADMIN_STORAGE_KEY, batch);
    log(`Старт в фоне (Отсутствует ДЗ): ${journals.length} журналов.`);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { source: "mesh-helper-background", type: "start", journals, exportKind: "admin", storageKey: ADMIN_STORAGE_KEY },
        () => resolve({ ok: true, total: journals.length })
      );
    });
  }

  async function collectMissingHomeworkForParallel(n) {
    const journals = await collectParallel(n);
    return startAdminBatchInBackground(journals);
  }

  function clearAdminBatch() {
    return new Promise((resolve) => chrome.storage.local.remove(ADMIN_STORAGE_KEY, resolve));
  }

  async function stopAdminBatch() {
    const batch = await getStorage(ADMIN_STORAGE_KEY);
    if (batch) {
      batch.status = "stopped";
      await setStorage(ADMIN_STORAGE_KEY, batch);
      if (batch.mode === "background") {
        chrome.runtime.sendMessage({ source: "mesh-helper-background", type: "stop", storageKey: ADMIN_STORAGE_KEY });
      }
      await setStorage(ADMIN_LAST_RESULTS_KEY, {
        results: batch.results,
        finishedAt: Date.now(),
        partial: true,
        processedCount: Object.keys(batch.results).length,
        totalCount: batch.queue.length
      });
      log(`Остановлено. Успело собраться: ${Object.keys(batch.results).length} из ${batch.queue.length}. Результат — getLastMissingHomeworkResults().`);
    }
    await clearAdminBatch();
  }

  async function getAdminBatchState() {
    return (await getStorage(ADMIN_STORAGE_KEY)) || null;
  }

  async function getLastMissingHomeworkResults() {
    return (await getStorage(ADMIN_LAST_RESULTS_KEY)) || null;
  }

  function csvValue(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  async function downloadMissingHomeworkResultsCsv() {
    const stored = await getLastMissingHomeworkResults();
    const rows = Object.values(stored?.results || {});
    if (!rows.length) {
      log("Нечего выгружать — сначала запустите сбор (collectMissingHomeworkForParallel).");
      return { ok: false, reason: "no-results" };
    }

    rows.sort((a, b) => a.classLabel.localeCompare(b.classLabel, "ru") || a.subject.localeCompare(b.subject, "ru"));

    const headers = ["Класс", "Предмет", "Отсутствует ДЗ (даты)", "targetGroupId"];
    const csvRows = rows.map((r) => [
      r.classLabel,
      r.subject,
      r.missingHomeworkDates?.length ? r.missingHomeworkDates.join(", ") : "",
      r.id
    ]);

    const csv = "﻿" + [headers, ...csvRows].map((row) => row.map(csvValue).join(";")).join("\n");
    const date = new Date().toISOString().slice(0, 10);
    const partialSuffix = stored.partial ? `_partial_${stored.processedCount}of${stored.totalCount}` : "";
    const filename = `mesh_admin_otsutstvuet_dz${partialSuffix}_${date}.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    log(`Экспортировано: ${rows.length} журналов → ${filename}`);
    return { ok: true, rows: rows.length, filename };
  }

  // ---- Выгрузка .xlsx: один лист на журнал (класс+предмет), без общего ----
  // ---- листа «Ученик» (по просьбе — это именно его явно не хотели видеть ----
  // ---- в режиме администратора). Пороги среднего балла/Н% и диапазоны ----
  // ---- итоговых — те же настраиваемые значения, что в «Мой класс». ----
  // ---- Риск академической задолженности подсвечивает ВСЮ строку целиком. ----

  async function downloadAdminParallelWorkbook() {
    const workbook = window.__MESH_HELPER_CLASS_WORKBOOK__;
    if (!workbook) {
      log("Модуль class-workbook.js не загружен — обновите страницу.");
      return { ok: false, reason: "no-workbook-module" };
    }

    const stored = await getLastMissingHomeworkResults();
    const rows = Object.values(stored?.results || {});
    if (!rows.length) {
      log("Нечего выгружать — сначала запустите сбор (collectMissingHomeworkForParallel).");
      return { ok: false, reason: "no-results" };
    }

    const problemAvgThreshold = await getProblemAvgThreshold();
    const absencePercentThreshold = await getAbsencePercentThreshold();
    const finalGradeRanges = await getFinalGradeRanges();

    const HEADER = [
      "№", "ФИО", "Оценки", "Средний балл", "Уроков проведено",
      "Н по факту", "Н % по факту", "Расчётный итог",
      "Риск академической задолженности", "ДЗ отсутствие", "Учитель"
    ];

    rows.sort((a, b) => a.classLabel.localeCompare(b.classLabel, "ru") || a.subject.localeCompare(b.subject, "ru"));

    const sheets = rows.map((journal) => {
      const students = journal.students || [];
      const marks = journal.marks || [];
      const attendances = journal.attendances || [];
      const heldLessons = journal.heldLessons || 0;
      const missingText = journal.missingHomeworkDates?.length ? journal.missingHomeworkDates.join(", ") : "";

      const sheetRows = [workbook.row(HEADER, () => "Header")];
      students.forEach((student, index) => {
        const { count, avg } = averageForStudent(marks, student.id);
        const { absences, percent } = attendanceForStudent(attendances, student.id, heldLessons);
        const avgRisk = count > 0 && avg <= problemAvgThreshold;
        const absenceRisk = heldLessons > 0 && percent >= absencePercentThreshold;
        const academicRisk = avgRisk || absenceRisk ? "Да" : "Нет";
        sheetRows.push(workbook.row(
          [
            index + 1,
            student.name,
            gradesTextForStudent(marks, student.id),
            count ? avg : "",
            heldLessons,
            absences,
            `${percent}%`,
            count ? possibleFinal(avg, finalGradeRanges) : "",
            academicRisk,
            missingText,
            journal.teacher || ""
          ],
          () => (academicRisk === "Да" ? "BadAbsence" : "Default")
        ));
      });

      return workbook.worksheet(`${journal.classLabel} ${journal.subject}`, sheetRows);
    });

    // ---- СВОД: проблемные ученики по всем собранным журналам, с учителем ----
    // ---- (в отличие от «Мой класс», тут у каждого предмета свой учитель, ----
    // ---- поэтому колонка «Учитель» обязательна — иначе непонятно, к кому ----
    // ---- с этим идти). Плюс агрегат по ученику в рамках его класса — ----
    // ---- через все собранные предметы ИМЕННО этого класса, не всей школы. ----

    const problems = [];
    rows.forEach((journal) => {
      const students = journal.students || [];
      const marks = journal.marks || [];
      const attendances = journal.attendances || [];
      const heldLessons = journal.heldLessons || 0;
      students.forEach((student) => {
        const { count, avg } = averageForStudent(marks, student.id);
        const { percent } = attendanceForStudent(attendances, student.id, heldLessons);
        if (count && avg <= problemAvgThreshold) {
          problems.push({ classLabel: journal.classLabel, student: student.name, subject: journal.subject, label: "Низкий средний балл", value: avg, teacher: journal.teacher || "" });
        }
        if (heldLessons && percent >= absencePercentThreshold) {
          problems.push({ classLabel: journal.classLabel, student: student.name, subject: journal.subject, label: "Много пропусков", value: `${percent}%`, teacher: journal.teacher || "" });
        }
      });
    });
    problems.sort((a, b) => a.classLabel.localeCompare(b.classLabel, "ru") || a.student.localeCompare(b.student, "ru"));

    const svodRows = [
      workbook.row([`Проблемы по предметам (средний балл ≤ ${problemAvgThreshold} или пропуски ≥ ${absencePercentThreshold}%)`], () => "Header"),
      workbook.row(["№", "ФИО", "Класс", "Предмет", "Проблема", "Значение", "Учитель"], () => "Header")
    ];
    if (problems.length) {
      problems.forEach((p, index) => {
        svodRows.push(workbook.row([index + 1, p.student, p.classLabel, p.subject, p.label, p.value, p.teacher], () => "Default"));
      });
    } else {
      svodRows.push(workbook.row(["", "Проблемных учеников не найдено.", "", "", "", "", ""], () => "Default"));
    }

    svodRows.push(workbook.row([""], () => "Default"));
    svodRows.push(workbook.row(["Итого по каждому ученику — агрегат по всем собранным предметам его класса"], () => "Header"));
    svodRows.push(workbook.row(["№", "Класс", "ФИО", "Средний балл", "Оценок всего", "Н по факту", "Н % по факту", "Риск академической задолженности"], () => "Header"));

    const journalsByClass = new Map();
    rows.forEach((journal) => {
      if (!journalsByClass.has(journal.classLabel)) journalsByClass.set(journal.classLabel, []);
      journalsByClass.get(journal.classLabel).push(journal);
    });

    let rowNum = 0;
    [...journalsByClass.keys()].sort((a, b) => a.localeCompare(b, "ru")).forEach((classLabel) => {
      const journalsForClass = journalsByClass.get(classLabel);
      const studentsById = new Map();
      journalsForClass.forEach((journal) => (journal.students || []).forEach((student) => {
        if (!studentsById.has(student.id)) studentsById.set(student.id, student);
      }));
      const students = [...studentsById.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));

      students.forEach((student) => {
        const stats = overallStatsForStudentInClass(journalsForClass, student.id, absencePercentThreshold);
        const academicRisk = (stats.avg !== null && stats.avg <= problemAvgThreshold) || stats.risk ? "Да" : "Нет";
        rowNum += 1;
        svodRows.push(workbook.row(
          [rowNum, classLabel, student.name, stats.avg ?? "", stats.count, stats.absences, `${stats.percent}%`, academicRisk],
          () => (academicRisk === "Да" ? "BadAbsence" : "Default")
        ));
      });
    });

    const svodSheet = workbook.worksheet("СВОД", svodRows);

    const date = new Date().toISOString().slice(0, 10);
    const partialSuffix = stored.partial ? `_partial_${stored.processedCount}of${stored.totalCount}` : "";
    const filename = `mesh_admin_parallel${partialSuffix}_${date}.xlsx`;

    const allSheets = [svodSheet, ...sheets];
    workbook.downloadWorkbook(filename, allSheets);
    log(`Экспортировано: ${sheets.length} журналов + СВОД → ${filename}`);
    return { ok: true, sheets: allSheets.length, filename };
  }

  async function resumeAdminBatchIfRunning() {
    const batch = await getStorage(ADMIN_STORAGE_KEY);
    if (!batch || batch.status !== "running") return;

    const journalId = currentAdminJournalIdFromQuery();
    const item = batch.queue[batch.currentIndex];
    if (!item || !journalId || String(item.id) !== String(journalId)) return;

    item.status = "loading";
    await setStorage(ADMIN_STORAGE_KEY, batch);

    const [found] = await Promise.all([
      waitForAdminMarks(),
      waitForAdminApiKind("schedule"),
      waitForAdminApiKind("homeworkAbsences"),
      waitForAdminApiKind("studentProfiles"),
      waitForAdminApiKind("attendances")
    ]);

    const freshCheck = await getStorage(ADMIN_STORAGE_KEY);
    if (!freshCheck || freshCheck.status !== "running") {
      log("Сбор остановлен пользователем — не продолжаю.");
      return;
    }

    const missingHomeworkDates = getMissingHomeworkDatesForCurrentJournal();
    const marks = found ? captureMarksForJournal(journalId) : [];
    const attendances = window.__MESH_HELPER_API__?.attendances || [];
    const heldLessons = countHeldLessonsForJournal(journalId);
    const students = captureStudentsForJournal();
    const teacher = teacherNameForJournal(journalId);

    item.status = found ? "done" : "empty";
    batch.results[journalId] = {
      id: item.id,
      subject: item.subject,
      classLabel: item.classLabel,
      classId: item.classId,
      missingHomeworkDates,
      marks,
      attendances,
      heldLessons,
      students,
      teacher,
      capturedAt: Date.now()
    };
    log(`${item.classLabel} / ${item.subject}: учеников ${students.length}, оценок ${marks.length}, ${missingHomeworkDates.length ? "отсутствует ДЗ — " + missingHomeworkDates.join(", ") : "ДЗ без пропусков"}`);

    const nextIndex = batch.currentIndex + 1;
    batch.currentIndex = nextIndex;
    await setStorage(ADMIN_STORAGE_KEY, batch);

    if (nextIndex >= batch.queue.length) {
      batch.status = "done";
      await setStorage(ADMIN_STORAGE_KEY, batch);
      await setStorage(ADMIN_LAST_RESULTS_KEY, {
        results: batch.results,
        finishedAt: Date.now(),
        partial: false,
        processedCount: Object.keys(batch.results).length,
        totalCount: batch.queue.length
      });
      log(`Готово. Журналов обработано: ${batch.queue.length}. Результат — getLastMissingHomeworkResults().`);
      if (batch.mode === "background") {
        chrome.runtime.sendMessage({ source: "mesh-helper-background", type: "advance", storageKey: ADMIN_STORAGE_KEY });
        await clearAdminBatch();
      }
      return;
    }

    if (batch.mode === "background") {
      chrome.runtime.sendMessage({ source: "mesh-helper-background", type: "advance", storageKey: ADMIN_STORAGE_KEY });
    }
  }

  window.__MESH_HELPER_ADMIN_COLLECTOR__ = {
    isAdminJournalsPage,
    selectParallel,
    getClassOptions,
    selectClassById,
    collectCurrentClassSubjects,
    collectAllClassesInCurrentParallel,
    collectParallel,
    collectParallels,
    findMissingHomeworkDates,
    getMissingHomeworkDatesForCurrentJournal,
    startAdminBatchInBackground,
    collectMissingHomeworkForParallel,
    listClassesForParallel,
    listAllClasses,
    collectSelectedClasses,
    collectMissingHomeworkForSelectedClasses,
    stopAdminBatch,
    getAdminBatchState,
    getLastMissingHomeworkResults,
    downloadMissingHomeworkResultsCsv,
    downloadAdminParallelWorkbook
  };

  if (isAdminJournalsPage()) {
    log("готов. window.__MESH_HELPER_ADMIN_COLLECTOR__.collectParallel(N) для сбора одной параллели.");
  }

  resumeAdminBatchIfRunning();
})();
