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
//  Управление вручную из консоли (на странице «Журналы класса»,
//  в контексте content script расширения, не "top" — см. вкладку
//  «Консоль» → дропдаун контекста):
//    window.__MESH_HELPER_CLASS_AUTO_LOADER__.startBatch()
//    window.__MESH_HELPER_CLASS_AUTO_LOADER__.getResults().then(console.log)
//    window.__MESH_HELPER_CLASS_AUTO_LOADER__.exportCsv()
//    window.__MESH_HELPER_CLASS_AUTO_LOADER__.stopBatch()
// ==========================================================

(() => {
  if (window.__meshHelperClassAutoLoaderInstalled) return;
  window.__meshHelperClassAutoLoaderInstalled = true;

  const STORAGE_KEY = "meshHelperClassBatch";
  const LAST_PROBLEMS_KEY = "meshHelperLastProblems";
  const NAV_DELAY_MS = 900;
  const MARKS_WAIT_TIMEOUT_MS = 15000;
  const JOURNAL_LINK_SELECTOR = 'a[href*="/journal/grade/"]';
  const CLASS_CARD_SELECTOR = '[data-test-component="journalCardRoute"]';

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
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          console.error("[МЭШ помощник][class-auto-loader] ОШИБКА ЗАПИСИ в storage:", chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
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

  function collectMyClassesPage() {
    const seen = new Set();
    const results = [];
    document.querySelectorAll(CLASS_CARD_SELECTOR).forEach((card) => {
      const link = card.querySelector('a[href*="/journal/my/"]');
      if (!link) return;
      const match = link.href.match(/\/journal\/my\/(\d+)/);
      if (!match) return;
      const id = match[1];
      if (seen.has(id)) return;
      seen.add(id);
      const labelEl = card.querySelector(":scope > div:first-child span");
      const classLabel = (labelEl?.textContent || "").replace(/\s+/g, " ").trim().replace(/\s*класс\s*$/i, "") || "?";
      const text = (link.textContent || "").replace(/\s+/g, " ").trim();
      results.push({ id, text, classLabel });
    });
    return results;
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

  function startBatchInBackground() {
    return waitForParallelSections().then(() => {
      expandAllParallels();
      return new Promise((resolve) => {
        setTimeout(() => {
          const journals = collectJournalsFromList();
          if (!journals.length) {
            log("Список журналов не найден. Откройте страницу «Журналы класса» и повторите.");
            resolve({ ok: false, reason: "no-journals-found" });
            return;
          }
          log(`Старт в фоне: ${journals.length} журналов. Можно продолжать работать в этой вкладке.`);
          chrome.runtime.sendMessage({ source: "mesh-helper-background", type: "start", journals }, () => {
            resolve({ ok: true, total: journals.length });
          });
        }, 400);
      });
    });
  }

  const MY_JOURNALS_LIST_PATH = "/teacher/mentor/journals";
  const AUTO_START_CLASS_FLAG = "meshHelperAutoStartClass";

  function isJournalsListPage() {
    return location.pathname === MY_JOURNALS_LIST_PATH;
  }

  function requestClassFromAnyPage() {
    if (isJournalsListPage()) return startBatchInBackground();
    return new Promise((resolve) => {
      chrome.storage.local.set({ [AUTO_START_CLASS_FLAG]: true }, () => {
        location.href = MY_JOURNALS_LIST_PATH;
        resolve({ ok: true, navigating: true });
      });
    });
  }

  function autoStartClassIfRequested() {
    if (!isJournalsListPage()) return;
    chrome.storage.local.get(AUTO_START_CLASS_FLAG, (data) => {
      if (!data?.[AUTO_START_CLASS_FLAG]) return;
      chrome.storage.local.remove(AUTO_START_CLASS_FLAG, () => {
        startBatchInBackground();
      });
    });
  }

  const MY_CLASSES_PATH = "/teacher/study-process/journal/my";
  const AUTO_START_ALL_CLASSES_FLAG = "meshHelperAutoStartAllClasses";

  function isMyClassesListPage() {
    return location.pathname === MY_CLASSES_PATH;
  }

  const PARALLEL_SECTION_SELECTOR = 'section[data-test-component^="journalListSection-"]';

  function expandAllParallels() {
    document.querySelectorAll(PARALLEL_SECTION_SELECTOR).forEach((section) => {
      if (section.querySelector(CLASS_CARD_SELECTOR)) return;
      const heading = section.querySelector("h6");
      if (heading) heading.click();
    });
  }

  function waitForParallelSections(maxAttempts = 20, intervalMs = 400) {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        attempts += 1;
        const found = document.querySelectorAll(PARALLEL_SECTION_SELECTOR).length > 0;
        if (found || attempts >= maxAttempts) {
          resolve(found);
          return;
        }
        setTimeout(check, intervalMs);
      };
      check();
    });
  }

  function prepareAllClassesList() {
    return waitForParallelSections().then(() => {
      expandAllParallels();
      return new Promise((resolve) => {
        setTimeout(() => resolve(collectMyClassesPage()), 400);
      });
    });
  }

  function startAllClassesInBackground(journals) {
    const list = Array.isArray(journals) ? journals : [];
    if (!list.length) {
      log("Карточки классов не найдены. Откройте страницу «Мои классы», разверните нужные параллели и повторите.");
      return Promise.resolve({ ok: false, reason: "no-journals-found" });
    }
    log(`Старт в фоне (все классы по предмету): ${list.length} журналов.`);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ source: "mesh-helper-background", type: "start", journals: list, exportKind: "subject" }, () => {
        resolve({ ok: true, total: list.length });
      });
    });
  }

  function requestAllClassesFromAnyPage() {
    if (isMyClassesListPage()) return Promise.resolve({ ok: true, navigating: false });
    return new Promise((resolve) => {
      chrome.storage.local.set({ [AUTO_START_ALL_CLASSES_FLAG]: true }, () => {
        location.href = MY_CLASSES_PATH;
        resolve({ ok: true, navigating: true });
      });
    });
  }

  function autoStartAllClassesIfRequested() {
    if (!isMyClassesListPage()) return;
    chrome.storage.local.get(AUTO_START_ALL_CLASSES_FLAG, (data) => {
      if (!data?.[AUTO_START_ALL_CLASSES_FLAG]) return;
      chrome.storage.local.remove(AUTO_START_ALL_CLASSES_FLAG, () => {
        prepareAllClassesList().then((journals) => {
          window.dispatchEvent(new CustomEvent("mesh-helper-all-classes-ready", { detail: { journals } }));
        });
      });
    });
  }

  async function stopBatch() {
    const batch = await getStorage(STORAGE_KEY);
    if (batch) {
      batch.status = "stopped";
      await setStorage(STORAGE_KEY, batch);
      if (batch.mode === "background") {
        chrome.runtime.sendMessage({ source: "mesh-helper-background", type: "stop" });
      }
    }
    log("Остановлено пользователем.");
    await clearBatch();
  }

  function clearBatch() {
    return new Promise((resolve) => chrome.storage.local.remove(STORAGE_KEY, resolve));
  }

  function notifyBackgroundAdvance() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ source: "mesh-helper-background", type: "advance" }, () => resolve());
    });
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

  function waitForApiKind(kind, fallbackMs = 4000) {
    const GRACE_MS = 1200;
    const FALLBACK_MS = fallbackMs;
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
      setTimeout(finish, FALLBACK_MS);
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

  function captureAttendances() {
    const api = window.__MESH_HELPER_API__ || {};
    return Array.isArray(api.attendances) ? api.attendances : [];
  }

  function captureMedicalRecommendations() {
    const api = window.__MESH_HELPER_API__ || {};
    return Array.isArray(api.medicalRecommendations) ? api.medicalRecommendations : [];
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

  function countHeldLessons() {
    const api = window.__MESH_HELPER_API__ || {};
    const schedule = Array.isArray(api.schedule) ? api.schedule : [];
    return schedule.filter(isLessonHeld).length;
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

  function captureStudentProfiles() {
    const api = window.__MESH_HELPER_API__ || {};
    return Array.isArray(api.studentProfiles) ? api.studentProfiles : [];
  }

  function mergeStudentProfiles(batch, profiles) {
    if (!batch.studentProfiles) batch.studentProfiles = {};
    profiles.forEach((profile) => {
      const id = getProfileId(profile);
      if (!id || batch.studentProfiles[id]) return;
      batch.studentProfiles[id] = { id, name: getProfileName(profile) };
    });
  }

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

  // ---- Вес оценки (контрольная/самостоятельная и т.п. считаются как ----
  // ---- несколько одинаковых оценок при подсчёте среднего и количества) ----
  // ---- — явное числовое поле веса, если есть, иначе эвристика по ----
  // ---- названию формы контроля. ----
  function numericOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function getMarkWeight(mark) {
    const explicit = numericOrNull(
      mark?.weight ?? mark?.coefficient ?? mark?.mark_weight ?? mark?.markWeight ??
      mark?.weight_value ?? mark?.weightValue ??
      mark?.control_form_weight ?? mark?.controlFormWeight ??
      mark?.control_form?.weight ?? mark?.control_form?.coefficient ??
      mark?.controlForm?.weight ?? mark?.controlForm?.coefficient
    );
    if (explicit && explicit > 1) return Math.max(1, Math.min(5, Math.round(explicit)));

    const label = String(
      mark?.control_form_name || mark?.controlFormName ||
      mark?.control_form?.name || mark?.control_form?.short_name ||
      mark?.controlForm?.name || mark?.controlForm?.short_name || ""
    ).trim().toLowerCase();
    if (/\bкр\b|контрольн|диагност/.test(label)) return 3;
    if (/самостоятельн|тест|практическ|лабораторн|диктант|изложен|сочинен|проект/.test(label)) return 2;
    return 1;
  }

  function expandGradeValues(marks, studentId) {
    const grades = [];
    const display = [];
    marks
      .filter((mark) => getStudentIdFromMark(mark) === studentId)
      .forEach((mark) => {
        const value = getMarkValue(mark);
        if (!isGrade(value)) return;
        const grade = Number(value);
        const weight = getMarkWeight(mark);
        for (let i = 0; i < weight; i += 1) grades.push(grade);
        display.push(weight > 1 ? `${grade}×${weight}` : String(grade));
      });
    return { grades, display };
  }

  function getStudentIdFromAttendance(record) {
    const id = record?.student_profile_id ?? record?.studentProfileId;
    return id !== undefined && id !== null ? String(id) : null;
  }

  function averageForStudent(marks, studentId) {
    const { grades } = expandGradeValues(marks, studentId);
    if (!grades.length) return { count: 0, avg: null };
    const avg = Math.round((grades.reduce((sum, grade) => sum + grade, 0) / grades.length) * 100) / 100;
    return { count: grades.length, avg };
  }

  // ---- «Н по болезни» — подтверждено живыми данными: /emias_medical_recommendations ----
  // ---- отдаёт по каждому ученику даты с type "SICK"/"SICK_WITH_INFECTION" (это и есть ----
  // ---- буква «б» под «Н» в журнале, подтянутая автоматически из поликлиники — не путать ----
  // ---- с полем absence_reason_id у attendances, которое с этим никак не связано). ----
  function isSickRecommendation(rec) {
    return rec?.type === "SICK" || rec?.type === "SICK_WITH_INFECTION";
  }

  function normalizeDateToIso(value) {
    const m = String(value || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return String(value || "");
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  function illnessDatesForStudent(medicalRecommendations, studentId) {
    const dates = new Set();
    (medicalRecommendations || []).forEach((rec) => {
      if (String(rec?.student_profile_id) !== studentId) return;
      if (!isSickRecommendation(rec)) return;
      if (rec?.date) dates.add(String(rec.date));
    });
    return dates;
  }

  function attendanceForStudent(attendances, studentId, heldLessons, medicalRecommendations) {
    const own = attendances.filter((record) => getStudentIdFromAttendance(record) === studentId);
    const absences = own.length;
    const illnessDates = illnessDatesForStudent(medicalRecommendations, studentId);
    const illnessAbsences = own.filter((record) => illnessDates.has(normalizeDateToIso(record?.date))).length;
    const total = heldLessons || 0;
    const percent = total ? Math.round((absences / total) * 1000) / 10 : 0;
    return { absences, illnessAbsences, total, percent };
  }

  function csvValue(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  async function exportCsv() {
    const batch = await getStorage(STORAGE_KEY);
    if (!batch || batch.status !== "done") {
      log("Выгрузка ещё не завершена (или не запускалась) — сначала startBatch().");
      return { ok: false, reason: "not-done" };
    }

    const students = Object.values(batch.studentProfiles || {}).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    if (!students.length) {
      log("Нет данных об учениках — student_profiles не были пойманы ни на одном журнале.");
      return { ok: false, reason: "no-students" };
    }

    const subjects = batch.queue.map((item) => ({ id: item.id, text: item.text }));
    const headers = ["ФИО", ...subjects.map((subject) => subject.text)];
    const rows = students.map((student) => {
      const cells = subjects.map((subject) => {
        const marks = batch.results[subject.id]?.marks || [];
        const attendances = batch.results[subject.id]?.attendances || [];
        const heldLessons = batch.results[subject.id]?.heldLessons;
        const { count, avg } = averageForStudent(marks, student.id);
        const { absences, percent } = attendanceForStudent(attendances, student.id, heldLessons);
        const parts = [];
        if (count) parts.push(`${avg} (${count})`);
        if (absences) parts.push(`Н ${percent}%`);
        return parts.join(" · ");
      });
      return [student.name, ...cells];
    });

    const csv = "﻿" + [headers, ...rows].map((row) => row.map(csvValue).join(";")).join("\n");
    const date = new Date().toISOString().slice(0, 10);
    const filename = `mesh_moy_klass_${date}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    log(`Экспортировано: ${students.length} учеников × ${subjects.length} предметов → ${filename}`);
    return { ok: true, students: students.length, subjects: subjects.length };
  }

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

  function gradesTextForStudent(marks, studentId) {
    return expandGradeValues(marks, studentId).display.join(", ");
  }

  async function exportWorkbook() {
    const batch = await getStorage(STORAGE_KEY);
    if (!batch || batch.status !== "done") {
      log("Выгрузка ещё не завершена (или не запускалась) — сначала startBatch().");
      return { ok: false, reason: "not-done" };
    }

    const workbook = window.__MESH_HELPER_CLASS_WORKBOOK__;
    if (!workbook) {
      log("Модуль class-workbook.js не загружен — обновите страницу.");
      return { ok: false, reason: "no-workbook-module" };
    }

    const students = Object.values(batch.studentProfiles || {}).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    if (!students.length) {
      log("Нет данных об учениках — student_profiles не были пойманы ни на одном журнале.");
      return { ok: false, reason: "no-students" };
    }

    const subjects = batch.queue.map((item) => ({ id: item.id, text: item.text }));
    const SUBJECT_HEADER = ["№", "ФИО", "Оценки", "Средний балл", "Уроков проведено", "Н по факту", "Н по болезни", "Н % по факту", "Расчётный итог", "Н% (служ.)", "Риск академической задолженности", "Количество оценок"];
    const problemAvgThreshold = await getProblemAvgThreshold();
    const absencePercentThreshold = await getAbsencePercentThreshold();
    const finalGradeRanges = await getFinalGradeRanges();

    const subjectSheets = subjects.map((subject) => {
      const marks = batch.results[subject.id]?.marks || [];
      const attendances = batch.results[subject.id]?.attendances || [];
      const medicalRecommendations = batch.results[subject.id]?.medicalRecommendations || [];
      const heldLessons = batch.results[subject.id]?.heldLessons;
      const rows = [workbook.row(SUBJECT_HEADER, () => "Header")];
      students.forEach((student, index) => {
        const { count, avg } = averageForStudent(marks, student.id);
        const { absences, illnessAbsences, percent } = attendanceForStudent(attendances, student.id, heldLessons, medicalRecommendations);
        const avgRisk = count > 0 && avg <= problemAvgThreshold;
        const absenceRisk = heldLessons > 0 && percent >= absencePercentThreshold;
        const academicRisk = avgRisk || absenceRisk ? "Да" : "Нет";
        rows.push(workbook.row(
          [index + 1, student.name, gradesTextForStudent(marks, student.id), count ? avg : "", heldLessons || 0, absences, illnessAbsences, `${percent}%`, count ? possibleFinal(avg, finalGradeRanges) : "", percent, academicRisk, count],
          () => (academicRisk === "Да" ? "BadAbsence" : "Default")
        ));
      });
      return workbook.worksheet(subject.text, rows, { hiddenCols: [10] });
    });

    const problems = [];
    students.forEach((student) => {
      subjects.forEach((subject) => {
        const marks = batch.results[subject.id]?.marks || [];
        const attendances = batch.results[subject.id]?.attendances || [];
        const medicalRecommendations = batch.results[subject.id]?.medicalRecommendations || [];
        const heldLessons = batch.results[subject.id]?.heldLessons;
        const { count, avg } = averageForStudent(marks, student.id);
        const { illnessAbsences, percent } = attendanceForStudent(attendances, student.id, heldLessons, medicalRecommendations);
        if (count && avg <= problemAvgThreshold) problems.push({ student: student.name, subject: subject.text, label: "Низкий средний балл", value: avg, illnessAbsences });
        if (heldLessons && percent >= absencePercentThreshold) problems.push({ student: student.name, subject: subject.text, label: "Много пропусков", value: `${percent}%`, illnessAbsences });
      });
    });

    const svodRows = [
      workbook.row([`Проблемы по предметам (средний балл ≤ ${problemAvgThreshold} или пропуски ≥ ${absencePercentThreshold}%)`], () => "Header"),
      workbook.row(["№", "ФИО", "Предмет", "Проблема", "Значение", "Н по болезни"], () => "Header")
    ];
    if (problems.length) {
      problems.forEach((problem, index) => {
        svodRows.push(workbook.row([index + 1, problem.student, problem.subject, problem.label, problem.value, problem.illnessAbsences], () => "Default"));
      });
    } else {
      svodRows.push(workbook.row(["", "Проблемных учеников не найдено.", "", "", "", ""], () => "Default"));
    }

    const svodSheet = workbook.worksheet("СВОД", svodRows);

    const sheetRef = (sheetName) => `'${sheetName.replace(/'/g, "''")}'`;
    const masterSheet = subjectSheets[0];

    const studentRows = [
      workbook.row(["Ученик:", students[0]?.name || ""], (value, colIndex) => (colIndex === 0 ? "Header" : "Default")),
      workbook.row([]),
      workbook.row(["Предмет", "Оценки", "Средний балл", "Уроков проведено", "Н по факту", "Н по болезни", "Н % по факту", "Расчётный итог", "Риск академической задолженности", ""], () => "Header")
    ];

    subjectSheets.forEach((sheet, index) => {
      const range = `${sheetRef(sheet.name)}!$B:$K`;
      const lookup = (col, fallback) => workbook.formula(`IFERROR(VLOOKUP($B$1,${range},${col},FALSE),${fallback})`);
      studentRows.push(workbook.row([
        subjects[index].text,
        lookup(2, '""'),
        lookup(3, '""'),
        lookup(4, '""'),
        lookup(5, '""'),
        lookup(6, '""'),
        lookup(7, '""'),
        lookup(8, '""'),
        lookup(10, '"Нет"'),
        lookup(9, "0")
      ], () => "Default"));
    });

    const firstDataRow = 4;
    const lastDataRow = 3 + subjectSheets.length;
    const studentSheet = workbook.worksheet("Ученик", studentRows, {
      hiddenCols: [10],
      dataValidations: [{ sqref: "B1", formula1: "MESH_STUDENTS" }],
      conditionalFormats: [
        { sqref: `C${firstDataRow}:C${lastDataRow}`, formula: `AND(C${firstDataRow}<>"",C${firstDataRow}<=${problemAvgThreshold})`, dxfId: 0 },
        { sqref: `G${firstDataRow}:G${lastDataRow}`, formula: `$J${firstDataRow}>=${absencePercentThreshold}`, dxfId: 1 },
        { sqref: `I${firstDataRow}:I${lastDataRow}`, formula: `I${firstDataRow}="Да"`, dxfId: 1 }
      ]
    });

    const rosterLastRow = students.length + 1;
    const definedNames = [{ name: "MESH_STUDENTS", formula: `${sheetRef(masterSheet.name)}!$B$2:$B$${rosterLastRow}` }];

    const date = new Date().toISOString().slice(0, 10);
    workbook.downloadWorkbook(`mesh_class_workbook_${date}.xlsx`, [svodSheet, studentSheet, ...subjectSheets], { definedNames });

    log(`Excel сформирован: ${students.length} учеников × ${subjects.length} предметов + СВОД + лист «Ученик».`);
    return { ok: true, students: students.length, subjects: subjects.length };
  }

  // ---- Экспорт по ученикам отдельными файлами в одном .zip — тот же ----
  // ---- хендролленный подход к ZIP, что и внутри class-workbook.js для ----
  // ---- самого .xlsx (тут упаковываются уже готовые .xlsx-файлы как ----
  // ---- opaque-бинарники, без их распаковки/изменения). ----

  function zipCrc32(bytes) {
    let crc = ~0;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (~crc) >>> 0;
  }

  function zipU16(v) {
    return [v & 255, (v >>> 8) & 255];
  }

  function zipU32(v) {
    return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  }

  async function zipBlobs(entries) {
    const encoder = new TextEncoder();
    const local = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const dataBytes = new Uint8Array(await entry.blob.arrayBuffer());
      const crc = zipCrc32(dataBytes);

      const UTF8_FLAG = 0x0800; // имена файлов — ФИО на кириллице, иначе будут кракозябры

      const localHeader = new Uint8Array([
        ...zipU32(0x04034b50), ...zipU16(20), ...zipU16(UTF8_FLAG), ...zipU16(0), ...zipU16(0), ...zipU16(0),
        ...zipU32(crc), ...zipU32(dataBytes.length), ...zipU32(dataBytes.length),
        ...zipU16(nameBytes.length), ...zipU16(0)
      ]);
      local.push(localHeader, nameBytes, dataBytes);

      const centralHeader = new Uint8Array([
        ...zipU32(0x02014b50), ...zipU16(20), ...zipU16(20), ...zipU16(UTF8_FLAG), ...zipU16(0), ...zipU16(0), ...zipU16(0),
        ...zipU32(crc), ...zipU32(dataBytes.length), ...zipU32(dataBytes.length),
        ...zipU16(nameBytes.length), ...zipU16(0), ...zipU16(0), ...zipU16(0), ...zipU16(0),
        ...zipU32(0), ...zipU32(offset)
      ]);
      central.push(centralHeader, nameBytes);

      offset += localHeader.length + nameBytes.length + dataBytes.length;
    }

    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array([
      ...zipU32(0x06054b50), ...zipU16(0), ...zipU16(0), ...zipU16(entries.length), ...zipU16(entries.length),
      ...zipU32(centralSize), ...zipU32(offset), ...zipU16(0)
    ]);

    return new Blob([...local, ...central, end], { type: "application/zip" });
  }

  function safeFileName(name) {
    return String(name || "").replace(/[\\/:*?"<>|]/g, "_").trim() || "Ученик";
  }

  async function exportPerStudentZip() {
    const batch = await getStorage(STORAGE_KEY);
    if (!batch || batch.status !== "done") {
      log("Выгрузка ещё не завершена (или не запускалась) — сначала startBatch().");
      return { ok: false, reason: "not-done" };
    }

    const workbook = window.__MESH_HELPER_CLASS_WORKBOOK__;
    if (!workbook) {
      log("Модуль class-workbook.js не загружен — обновите страницу.");
      return { ok: false, reason: "no-workbook-module" };
    }

    const students = Object.values(batch.studentProfiles || {}).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    if (!students.length) {
      log("Нет данных об учениках — student_profiles не были пойманы ни на одном журнале.");
      return { ok: false, reason: "no-students" };
    }

    const subjects = batch.queue.map((item) => ({ id: item.id, text: item.text }));
    const problemAvgThreshold = await getProblemAvgThreshold();
    const absencePercentThreshold = await getAbsencePercentThreshold();
    const finalGradeRanges = await getFinalGradeRanges();

    const HEADER = ["Предмет", "Оценки", "Средний балл", "Уроков проведено", "Н по факту", "Н % по факту", "Расчётный итог", "Риск академической задолженности"];

    const usedNames = new Set();
    const entries = [];
    students.forEach((student) => {
      const rows = [
        workbook.row(["Ученик:", student.name], (value, colIndex) => (colIndex === 0 ? "Header" : "Default")),
        workbook.row([]),
        workbook.row(HEADER, () => "Header")
      ];
      subjects.forEach((subject) => {
        const marks = batch.results[subject.id]?.marks || [];
        const attendances = batch.results[subject.id]?.attendances || [];
        const heldLessons = batch.results[subject.id]?.heldLessons;
        const { count, avg } = averageForStudent(marks, student.id);
        const { absences, percent } = attendanceForStudent(attendances, student.id, heldLessons);
        const academicRisk = count && avg <= problemAvgThreshold ? "Да" : "Нет";
        rows.push(workbook.row(
          [subject.text, gradesTextForStudent(marks, student.id), count ? avg : "", heldLessons || 0, absences, `${percent}%`, count ? possibleFinal(avg, finalGradeRanges) : "", academicRisk],
          (value, colIndex) => {
            if (colIndex === 4 && percent >= absencePercentThreshold) return "BadAbsence";
            if (colIndex === 7 && academicRisk === "Да") return "BadAbsence";
            return "Default";
          }
        ));
      });

      const sheet = workbook.worksheet(student.name, rows);
      const blob = workbook.buildWorkbookBlob([sheet]);
      const baseName = safeFileName(student.name);
      let finalName = `${baseName}.xlsx`;
      let suffix = 2;
      while (usedNames.has(finalName)) {
        finalName = `${baseName} (${suffix}).xlsx`;
        suffix += 1;
      }
      usedNames.add(finalName);
      entries.push({ name: finalName, blob });
    });

    const zipBlob = await zipBlobs(entries);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `mesh_moy_klass_po_uchenikam_${date}.zip`;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    log(`Экспортировано по ученикам: ${entries.length} файлов → ${filename}`);
    return { ok: true, students: entries.length, filename };
  }

  async function exportAllClassesWorkbook() {
    const batch = await getStorage(STORAGE_KEY);
    if (!batch || batch.status !== "done") {
      log("Выгрузка ещё не завершена (или не запускалась) — сначала startAllClassesInBackground().");
      return { ok: false, reason: "not-done" };
    }

    const workbook = window.__MESH_HELPER_CLASS_WORKBOOK__;
    if (!workbook) {
      log("Модуль class-workbook.js не загружен — обновите страницу.");
      return { ok: false, reason: "no-workbook-module" };
    }

    const classes = batch.queue.map((item) => ({ id: item.id, classLabel: item.classLabel || item.text, text: item.text }));
    const problemAvgThreshold = await getProblemAvgThreshold();
    const absencePercentThreshold = await getAbsencePercentThreshold();
    const finalGradeRanges = await getFinalGradeRanges();
    const CLASS_HEADER = ["№", "ФИО", "Оценки", "Средний балл", "Уроков проведено", "Н по факту", "Н % по факту", "Расчётный итог", "Риск академической задолженности"];

    const problems = [];
    let studentsTotal = 0;

    const classSheets = classes.map((cls) => {
      const result = batch.results[cls.id];
      const marks = result?.marks || [];
      const attendances = result?.attendances || [];
      const heldLessons = result?.heldLessons;
      const students = (result?.students || []).slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));

      const rows = [workbook.row(CLASS_HEADER, () => "Header")];
      students.forEach((student, index) => {
        studentsTotal += 1;
        const { count, avg } = averageForStudent(marks, student.id);
        const { absences, percent } = attendanceForStudent(attendances, student.id, heldLessons);
        const academicRisk = count && avg <= problemAvgThreshold ? "Да" : "Нет";
        rows.push(workbook.row(
          [index + 1, student.name, gradesTextForStudent(marks, student.id), count ? avg : "", heldLessons || 0, absences, `${percent}%`, count ? possibleFinal(avg, finalGradeRanges) : "", academicRisk],
          (value, colIndex) => {
            if (colIndex === 6 && percent >= absencePercentThreshold) return "BadAbsence";
            if (colIndex === 8 && academicRisk === "Да") return "BadAbsence";
            return "Default";
          }
        ));
        const combinedAcademicRisk = (count && avg <= problemAvgThreshold) || (heldLessons && percent >= absencePercentThreshold) ? "Да" : "Нет";
        if (count && avg <= problemAvgThreshold) problems.push({ classLabel: cls.classLabel, student: student.name, label: "Низкий средний балл", value: avg, academicRisk: combinedAcademicRisk });
        if (heldLessons && percent >= absencePercentThreshold) problems.push({ classLabel: cls.classLabel, student: student.name, label: "Много пропусков", value: `${percent}%`, academicRisk: combinedAcademicRisk });
      });
      return workbook.worksheet(cls.classLabel, rows);
    });

    const problemsRows = [
      workbook.row([`Проблемы по всем классам (средний балл ≤ ${problemAvgThreshold} или пропуски ≥ ${absencePercentThreshold}%)`], () => "Header"),
      workbook.row(["Класс", "ФИО", "Проблема", "Значение", "Риск академической задолженности"], () => "Header")
    ];
    if (problems.length) {
      problems.forEach((problem) => problemsRows.push(workbook.row(
        [problem.classLabel, problem.student, problem.label, problem.value, problem.academicRisk],
        (value, colIndex) => (colIndex === 4 && problem.academicRisk === "Да" ? "BadAbsence" : "Default")
      )));
    } else {
      problemsRows.push(workbook.row(["", "Проблемных учеников не найдено.", "", "", ""], () => "Default"));
    }
    const problemsSheet = workbook.worksheet("Проблемы", problemsRows);

    await setStorage(LAST_PROBLEMS_KEY, { generatedAt: Date.now(), problems });

    const date = new Date().toISOString().slice(0, 10);
    workbook.downloadWorkbook(`mesh_vse_klassy_${date}.xlsx`, [problemsSheet, ...classSheets]);

    log(`Excel сформирован: ${classes.length} классов, ${studentsTotal} учеников.`);
    return { ok: true, classes: classes.length, students: studentsTotal };
  }

  async function resumeIfRunning() {
    const batch = await getStorage(STORAGE_KEY);
    if (!batch || batch.status !== "running") return;

    const journalId = currentJournalIdFromPath();
    const item = batch.queue[batch.currentIndex];
    if (!item || !journalId || String(item.id) !== String(journalId)) return;

    item.status = "loading";
    await setStorage(STORAGE_KEY, batch);

    const [found] = await Promise.all([waitForMarks(), waitForApiKind("studentProfiles"), waitForApiKind("attendances"), waitForApiKind("schedule", 12000), waitForApiKind("medicalRecommendations")]);

    const freshCheck = await getStorage(STORAGE_KEY);
    if (!freshCheck || freshCheck.status !== "running") {
      log("Сбор остановлен пользователем — не продолжаю.");
      return;
    }

    const marks = found ? captureMarksForJournal(journalId) : [];
    const attendances = captureAttendances();
    const medicalRecommendations = captureMedicalRecommendations();
    const heldLessons = countHeldLessons();
    const profiles = captureStudentProfiles();
    mergeStudentProfiles(batch, profiles);
    const students = profiles.map((profile) => ({ id: getProfileId(profile), name: getProfileName(profile) })).filter((student) => student.id);

    item.status = found ? "done" : "empty";
    batch.results[journalId] = { text: item.text, classLabel: item.classLabel, count: marks.length, marks, attendances, medicalRecommendations, heldLessons, students, capturedAt: Date.now() };
    log(`${item.text}: ${found ? `поймано записей: ${marks.length}` : "таймаут, оценок не поймано"}`);

    const nextIndex = batch.currentIndex + 1;
    batch.currentIndex = nextIndex;
    await setStorage(STORAGE_KEY, batch);

    if (nextIndex >= batch.queue.length) {
      batch.status = "done";
      await setStorage(STORAGE_KEY, batch);
      log(`Готово. Журналов обработано: ${batch.queue.length}.`);
      if (batch.mode === "background") {
        if (batch.exportKind === "subject") {
          await exportAllClassesWorkbook();
        } else {
          await exportWorkbook();
        }
        await notifyBackgroundAdvance();
        await clearBatch();
        log("Файл скачан автоматически, состояние сброшено — можно запускать заново.");
      }
      return;
    }

    if (batch.mode === "background") {
      chrome.runtime.sendMessage({ source: "mesh-helper-background", type: "advance" });
      return;
    }

    setTimeout(() => {
      getStorage(STORAGE_KEY).then((fresh) => {
        if (fresh?.status === "running") navigateToIndex(fresh, nextIndex);
      });
    }, NAV_DELAY_MS);
  }

  window.__MESH_HELPER_CLASS_AUTO_LOADER__ = {
    startBatch,
    startBatchInBackground,
    stopBatch,
    getResults,
    exportCsv,
    exportWorkbook,
    exportPerStudentZip,
    collectJournalsFromList,
    startAllClassesInBackground,
    exportAllClassesWorkbook,
    collectMyClassesPage,
    requestAllClassesFromAnyPage,
    prepareAllClassesList,
    isMyClassesListPage,
    requestClassFromAnyPage,
    isJournalsListPage
  };

  resumeIfRunning();
  autoStartAllClassesIfRequested();
  autoStartClassIfRequested();
})();
