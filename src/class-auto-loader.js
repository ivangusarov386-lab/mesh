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
  const NAV_DELAY_MS = 900;
  const MARKS_WAIT_TIMEOUT_MS = 15000;
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

  function waitForApiKind(kind) {
    const GRACE_MS = 1200;
    const FALLBACK_MS = 4000;
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

  function getStudentIdFromAttendance(record) {
    const id = record?.student_profile_id ?? record?.studentProfileId;
    return id !== undefined && id !== null ? String(id) : null;
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

  function attendanceForStudent(marks, attendances, studentId) {
    const gradeCount = marks
      .filter((mark) => getStudentIdFromMark(mark) === studentId)
      .map(getMarkValue)
      .filter(isGrade).length;
    const absences = attendances.filter((record) => getStudentIdFromAttendance(record) === studentId).length;
    const total = gradeCount + absences;
    const percent = total ? Math.round((absences / total) * 1000) / 10 : 0;
    return { absences, total, percent };
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
        const { count, avg } = averageForStudent(marks, student.id);
        const { absences, percent } = attendanceForStudent(marks, attendances, student.id);
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

  function possibleFinal(avg) {
    const n = Number(avg);
    if (!Number.isFinite(n)) return "";
    if (n >= 4.6) return 5;
    if (n >= 3.6) return 4;
    if (n >= 2.6) return 3;
    return 2;
  }

  function gradesTextForStudent(marks, studentId) {
    return marks
      .filter((mark) => getStudentIdFromMark(mark) === studentId)
      .map(getMarkValue)
      .filter(isGrade)
      .join(", ");
  }

  function overallStatsForStudent(subjects, batch, studentId) {
    const allGrades = [];
    let absences = 0;
    let total = 0;
    let risk = false;
    subjects.forEach((subject) => {
      const marks = batch.results[subject.id]?.marks || [];
      const attendances = batch.results[subject.id]?.attendances || [];
      const gradeValues = marks.filter((mark) => getStudentIdFromMark(mark) === studentId).map(getMarkValue).filter(isGrade);
      gradeValues.forEach((value) => allGrades.push(Number(value)));
      const subAbsences = attendances.filter((record) => getStudentIdFromAttendance(record) === studentId).length;
      const subTotal = gradeValues.length + subAbsences;
      absences += subAbsences;
      total += subTotal;
      if (subTotal && Math.round((subAbsences / subTotal) * 1000) / 10 >= 50) risk = true;
    });
    const avg = allGrades.length ? Math.round((allGrades.reduce((sum, grade) => sum + grade, 0) / allGrades.length) * 100) / 100 : null;
    const percent = total ? Math.round((absences / total) * 1000) / 10 : 0;
    return { avg, count: allGrades.length, absences, total, percent, risk };
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
    const SUBJECT_HEADER = ["№", "ФИО", "Оценки", "Средний балл", "Н по факту", "Н % по факту", "Расчётный итог"];

    const subjectSheets = subjects.map((subject) => {
      const marks = batch.results[subject.id]?.marks || [];
      const attendances = batch.results[subject.id]?.attendances || [];
      const rows = [workbook.row(SUBJECT_HEADER, () => "Header")];
      students.forEach((student, index) => {
        const { count, avg } = averageForStudent(marks, student.id);
        const { absences, percent } = attendanceForStudent(marks, attendances, student.id);
        rows.push(workbook.row(
          [index + 1, student.name, gradesTextForStudent(marks, student.id), count ? avg : "", absences, `${percent}%`, count ? possibleFinal(avg) : ""],
          (value, colIndex) => (colIndex === 5 && percent >= 50 ? "BadAbsence" : "Default")
        ));
      });
      return workbook.worksheet(subject.text, rows);
    });

    const svodRows = [workbook.row(["№", "ФИО", "Средний балл (все предметы)", "Оценок всего", "Н по факту", "Н % по факту", "Риск (Н ≥ 50%)"], () => "Header")];
    students.forEach((student, index) => {
      const stats = overallStatsForStudent(subjects, batch, student.id);
      svodRows.push(workbook.row(
        [index + 1, student.name, stats.avg ?? "", stats.count, stats.absences, `${stats.percent}%`, stats.risk ? "да" : ""],
        (value, colIndex) => (colIndex === 6 && stats.risk ? "BadAbsence" : "Default")
      ));
    });
    const svodSheet = workbook.worksheet("СВОД", svodRows);

    const date = new Date().toISOString().slice(0, 10);
    workbook.downloadWorkbook(`mesh_class_workbook_${date}.xlsx`, [svodSheet, ...subjectSheets]);

    log(`Excel сформирован: ${students.length} учеников × ${subjects.length} предметов + СВОД.`);
    return { ok: true, students: students.length, subjects: subjects.length };
  }

  async function resumeIfRunning() {
    const batch = await getStorage(STORAGE_KEY);
    if (!batch || batch.status !== "running") return;

    const journalId = currentJournalIdFromPath();
    const item = batch.queue[batch.currentIndex];
    if (!item || !journalId || String(item.id) !== String(journalId)) return;

    item.status = "loading";
    await setStorage(STORAGE_KEY, batch);

    const [found] = await Promise.all([waitForMarks(), waitForApiKind("studentProfiles"), waitForApiKind("attendances")]);
    const marks = found ? captureMarksForJournal(journalId) : [];
    const attendances = captureAttendances();
    mergeStudentProfiles(batch, captureStudentProfiles());

    item.status = found ? "done" : "empty";
    batch.results[journalId] = { text: item.text, count: marks.length, marks, attendances, capturedAt: Date.now() };
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

  window.__MESH_HELPER_CLASS_AUTO_LOADER__ = { startBatch, stopBatch, getResults, exportCsv, exportWorkbook, collectJournalsFromList };

  resumeIfRunning();
})();
