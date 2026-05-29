(() => {
  if (window.__meshHelperClassDataInstalled) return;
  window.__meshHelperClassDataInstalled = true;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").replace(/[–—]/g, "-").trim();
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const text = String(value).trim();
    const ru = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (ru) {
      const [, dd, mm, yyyy, hh = "0", min = "0"] = ru;
      const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const iso = new Date(text);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }

  function getPeriodStart(period) {
    return parseDate(period?.start_date || period?.startDate || period?.date_start || period?.dateStart || period?.from || period?.begin_date || period?.beginDate);
  }

  function getPeriodEnd(period) {
    return parseDate(period?.end_date || period?.endDate || period?.date_end || period?.dateEnd || period?.to || period?.finish_date || period?.finishDate);
  }

  function getPeriodTitle(period) {
    return normalizeText(period?.title || period?.name || period?.period_name || period?.periodName || period?.number || "Текущий период");
  }

  function getPeriodId(period) {
    const source = period?.raw || period || {};
    return source?.id || source?.period_id || source?.periodId || source?.attestation_period_id || source?.attestationPeriodId || null;
  }

  function autoCurrentPeriod(now = new Date()) {
    const y = now.getFullYear();
    const m = now.getMonth();
    if (m >= 8 && m <= 10) return { id: null, title: "Текущий период (сентябрь-ноябрь)", start: new Date(y, 8, 1), end: new Date(y, 10, 30, 23, 59, 59), auto: true };
    if (m === 11 || m <= 1) {
      const startYear = m === 11 ? y : y - 1;
      return { id: null, title: "Текущий период (декабрь-февраль)", start: new Date(startYear, 11, 1), end: new Date(startYear + 1, 1, 28, 23, 59, 59), auto: true };
    }
    if (m >= 2 && m <= 5) return { id: null, title: "Текущий период (март-июнь)", start: new Date(y, 2, 1), end: new Date(y, 5, 30, 23, 59, 59), auto: true };
    return { id: null, title: "Текущий период (авто)", start: new Date(y, 8, 1), end: new Date(y, 11, 31, 23, 59, 59), auto: true };
  }

  function resolveCurrentPeriod(periods = [], now = new Date()) {
    const list = Array.isArray(periods) ? periods : [];
    const normalized = list
      .map((period) => ({ raw: period, id: getPeriodId(period), title: getPeriodTitle(period), start: getPeriodStart(period), end: getPeriodEnd(period) }))
      .filter((period) => period.start || period.end);
    const active = normalized.find((period) => (!period.start || now >= period.start) && (!period.end || now <= period.end));
    if (active) return active;
    const previous = normalized.filter((period) => period.start && period.start <= now).sort((a, b) => b.start - a.start)[0];
    return previous || autoCurrentPeriod(now);
  }

  function isMarkLike(value) {
    const markValue = normalizeText(value?.name || value?.value || value?.mark || value?.mark_value || value?.markValue || "");
    return Boolean(markValue && (/^[1-5]$/.test(markValue) || markValue.toLowerCase().includes("н")) && (value?.date || value?.lesson_date || value?.mark_date || value?.created_at || value?.updated_at || value?.weight || value?.control_form_id));
  }

  function hasProfileNameFields(value) {
    const source = value?.student_profile || value?.studentProfile || value?.student || value?.person || value?.profile || value?.user || value || {};
    return Boolean(source?.short_name || source?.shortName || source?.fio || source?.full_name || source?.fullName || source?.student_name || source?.studentName || source?.display_name || source?.displayName || source?.last_name || source?.lastName || source?.first_name || source?.firstName || source?.middle_name || source?.middleName || source?.lastname || source?.firstname || source?.middlename || source?.surname || source?.name || value?.short_name || value?.shortName || value?.fio || value?.full_name || value?.fullName || value?.student_name || value?.studentName || value?.display_name || value?.displayName || value?.last_name || value?.lastName || value?.first_name || value?.firstName || value?.middle_name || value?.middleName || value?.lastname || value?.firstname || value?.middlename || value?.surname || value?.name);
  }

  function normalizeId(id) {
    const numeric = Number(id);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : id || null;
  }

  function getStudentId(value) {
    const nested = value?.student_profile || value?.studentProfile || value?.student || value?.person || value?.profile || value?.user || null;
    const explicit = value?.student_profile_id || value?.studentProfileId || value?.profile_id || value?.profileId || value?.student_id || value?.studentId || value?.person_id || value?.personId || nested?.student_profile_id || nested?.studentProfileId || nested?.profile_id || nested?.profileId || nested?.student_id || nested?.studentId || nested?.person_id || nested?.personId || nested?.id || null;
    if (explicit) return normalizeId(explicit);
    if (!isMarkLike(value) && hasProfileNameFields(value)) return normalizeId(value?.id);
    return null;
  }

  function safeNameCandidate(value) {
    const text = normalizeText(value);
    if (!text || /^[1-5]$/.test(text) || /^н$/i.test(text) || text.length < 2) return "";
    if (/^ученик\s+\d+$/i.test(text)) return "";
    return text;
  }

  function nameFromParts(...parts) {
    return parts.map(safeNameCandidate).filter(Boolean).join(" ");
  }

  function getStudentName(profile) {
    const source = profile?.student_profile || profile?.studentProfile || profile?.student || profile?.person || profile?.profile || profile?.user || profile || {};
    const person = profile?.person || source?.person || profile?.user || source?.user || {};
    const fullFromParts = nameFromParts(source?.last_name || source?.lastName || source?.lastname || source?.surname || profile?.last_name || profile?.lastName || profile?.lastname || profile?.surname || person?.last_name || person?.lastName || person?.lastname || person?.surname, source?.first_name || source?.firstName || source?.firstname || profile?.first_name || profile?.firstName || profile?.firstname || person?.first_name || person?.firstName || person?.firstname, source?.middle_name || source?.middleName || source?.middlename || profile?.middle_name || profile?.middleName || profile?.middlename || person?.middle_name || person?.middleName || person?.middlename);
    return safeNameCandidate(source?.short_name || source?.shortName || profile?.short_name || profile?.shortName || person?.short_name || person?.shortName || source?.fio || source?.full_name || source?.fullName || source?.student_name || source?.studentName || source?.display_name || source?.displayName || profile?.fio || profile?.full_name || profile?.fullName || profile?.student_name || profile?.studentName || profile?.display_name || profile?.displayName || person?.fio || person?.full_name || person?.fullName || person?.display_name || person?.displayName || fullFromParts || source?.name || profile?.name || person?.name || "Без ФИО") || "Без ФИО";
  }

  function getJournalId(value) {
    const id = value?.journal_id || value?.journalId || value?.subject_journal_id || value?.subjectJournalId || value?.group_id || value?.groupId || value?.education_group_id || value?.educationGroupId || null;
    return normalizeId(id);
  }

  function getSubjectId(value) {
    return normalizeId(value?.subject_id || value?.subjectId || value?.subject?.id || value?.raw?.subject_id || value?.raw?.subjectId || null);
  }

  function getJournalStudentIds(journal) {
    const raw = journal?.raw || journal || {};
    const ids = Array.isArray(raw.student_ids) ? raw.student_ids : Array.isArray(raw.studentIds) ? raw.studentIds : [];
    return new Set(ids.map((id) => String(id)));
  }

  function studentBelongsToJournal(student, journal) {
    const ids = getJournalStudentIds(journal);
    if (!ids.size) return true;
    return ids.has(String(student?.id));
  }

  function sameJournal(item, journal) {
    if (!journal?.journalId) return true;
    const itemJournalId = getJournalId(item);
    if (!itemJournalId) return true;
    return String(itemJournalId) === String(journal.journalId);
  }

  function sameSubject(item, journal) {
    const journalSubjectId = getSubjectId(journal);
    const itemSubjectId = getSubjectId(item);
    if (!journalSubjectId || !itemSubjectId) return true;
    return String(journalSubjectId) === String(itemSubjectId);
  }

  function getMarkValue(mark) {
    return normalizeText(mark?.name || mark?.value || mark?.mark || mark?.mark_value || mark?.markValue || "");
  }

  function getFinalValue(item) {
    return normalizeText(item?.value || item?.name || item?.mark || item?.final_mark || item?.finalMark || item?.mark_value || item?.markValue || "");
  }

  function getFinalPeriodId(item) {
    return item?.period_id || item?.periodId || item?.attestation_period_id || item?.attestationPeriodId || item?.attestation_period?.id || null;
  }

  function getMarkPeriodId(item) {
    return item?.period_id || item?.periodId || item?.attestation_period_id || item?.attestationPeriodId || item?.attestation_period?.id || item?.lesson?.attestation_period_id || item?.lesson?.attestationPeriodId || null;
  }

  function getFinalKind(item) {
    if (item?.is_year_mark || item?.isYearMark || item?.year_mark || item?.yearMark) return "year";
    const value = normalizeText(item?.type || item?.kind || item?.period_type || item?.periodType || item?.title || item?.name || "").toLowerCase();
    if (value.includes("год") || value === "г") return "year";
    if (value.includes("па")) return "pa";
    return "period";
  }

  function isGrade(value) {
    return /^[1-5]$/.test(String(value || "").trim());
  }

  function isAbsence(value) {
    return String(value || "").toLowerCase().includes("н");
  }

  function getMarkDate(item) {
    return parseDate(item?.date || item?.mark_date || item?.lesson_date || item?.created_at || item?.updated_at || item?.lesson?.date);
  }

  function periodHasRealBounds(period) {
    return Boolean(period?.start || period?.end);
  }

  function isInPeriod(item, period) {
    if (!period) return true;
    const hasBounds = periodHasRealBounds(period);
    const periodId = period?.id ? String(period.id) : "";
    const itemPeriodId = getMarkPeriodId(item);
    if (hasBounds && periodId && itemPeriodId) return String(itemPeriodId) === periodId;
    const date = getMarkDate(item);
    if (!date) return true;
    if (hasBounds) return (!period.start || date >= period.start) && (!period.end || date <= period.end);
    return true;
  }

  function possibleFinal(avg) {
    const n = Number(avg);
    if (!Number.isFinite(n)) return "";
    if (n >= 4.6) return 5;
    if (n >= 3.6) return 4;
    if (n >= 2.6) return 3;
    return 2;
  }

  function profileFinalMarks(profile) {
    return Array.isArray(profile?.final_marks) ? profile.final_marks : Array.isArray(profile?.finalMarks) ? profile.finalMarks : [];
  }

  function makeStudent(id, source = null) {
    return { id, fio: getStudentName(source), marks: [], average: null, rawProfile: source, finalMarks: profileFinalMarks(source) };
  }

  function buildStudentsMap({ studentProfiles = [], marks = [], averageMarks = [] } = {}) {
    const students = new Map();
    studentProfiles.forEach((profile) => {
      const id = getStudentId(profile);
      if (!id) return;
      const key = String(id);
      const existing = students.get(key);
      const next = makeStudent(id, profile);
      if (existing) {
        next.marks = existing.marks;
        next.average = existing.average;
        next.finalMarks = [...(existing.finalMarks || []), ...profileFinalMarks(profile)];
      }
      students.set(key, next);
    });
    marks.forEach((mark) => {
      const id = getStudentId(mark);
      if (!id) return;
      const key = String(id);
      if (!students.has(key)) students.set(key, makeStudent(id, mark));
      const student = students.get(key);
      const markName = getStudentName(mark);
      if (student.fio === "Без ФИО" && markName !== "Без ФИО") student.fio = markName;
      student.marks.push(mark);
    });
    averageMarks.forEach((avg) => {
      const id = getStudentId(avg);
      if (!id) return;
      const key = String(id);
      if (!students.has(key)) students.set(key, makeStudent(id, avg));
      const student = students.get(key);
      const avgName = getStudentName(avg);
      if (student.fio === "Без ФИО" && avgName !== "Без ФИО") student.fio = avgName;
      student.average = avg;
    });
    return [...students.values()].sort((a, b) => a.fio.localeCompare(b.fio, "ru"));
  }

  function resolveFinalMarksForStudent({ studentId, finalMarks = [], profileFinalMarks = [], period = null, journal = null } = {}) {
    const sid = String(studentId || "");
    const allFinals = [...(Array.isArray(finalMarks) ? finalMarks : []), ...(Array.isArray(profileFinalMarks) ? profileFinalMarks : [])];
    const items = allFinals.filter((item) => String(getStudentId(item) || "") === sid).filter((item) => sameJournal(item, journal)).filter((item) => sameSubject(item, journal));
    const periodId = period?.id ? String(period.id) : "";
    const current = items.find((item) => periodHasRealBounds(period) && periodId && String(getFinalPeriodId(item) || "") === periodId) || items.find((item) => getFinalKind(item) === "period");
    const pa = items.find((item) => getFinalKind(item) === "pa");
    const year = items.find((item) => getFinalKind(item) === "year");
    return { current: getFinalValue(current), pa: getFinalValue(pa), year: getFinalValue(year), raw: items };
  }

  function buildCurrentPeriodRows({ students = [], period = null, finalMarks = [], journal = null } = {}) {
    return students.filter((student) => studentBelongsToJournal(student, journal)).map((student) => {
      let periodMarks = (student.marks || []).filter((mark) => sameJournal(mark, journal)).filter((mark) => sameSubject(mark, journal)).filter((mark) => isInPeriod(mark, period));
      if (!periodMarks.length && period) {
        periodMarks = (student.marks || []).filter((mark) => sameJournal(mark, journal)).filter((mark) => sameSubject(mark, journal));
      }
      const grades = periodMarks.map(getMarkValue).filter(isGrade).map(Number);
      const absences = periodMarks.map(getMarkValue).filter(isAbsence).length;
      const lessonsFact = periodMarks.length;
      const avg = grades.length ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length : null;
      const absencePercent = lessonsFact ? Math.round((absences / lessonsFact) * 1000) / 10 : 0;
      const calculatedFinal = possibleFinal(avg);
      const finals = resolveFinalMarksForStudent({ studentId: student.id, finalMarks, profileFinalMarks: student.finalMarks, period, journal });
      const profileName = getStudentName(student.rawProfile);
      return {
        studentId: student.id,
        fio: profileName !== "Без ФИО" ? profileName : student.fio,
        grades,
        gradesText: grades.length ? grades.join(", ") : "",
        average: avg === null ? "" : Math.round(avg * 100) / 100,
        possibleFinal: calculatedFinal,
        currentFinal: finals.current,
        paFinal: finals.pa,
        yearFinal: finals.year,
        finalMismatch: finals.current && calculatedFinal && String(finals.current) !== String(calculatedFinal),
        absences,
        lessonsFact,
        absencePercent,
        absenceRisk: absencePercent >= 50,
        journalId: journal?.journalId || "",
        subject: journal?.subject || "",
        rawStudent: student,
        rawFinalMarks: finals.raw
      };
    });
  }

  window.__MESH_HELPER_CLASS_DATA__ = { normalizeText, parseDate, resolveCurrentPeriod, getStudentId, getStudentName, getJournalId, buildStudentsMap, buildCurrentPeriodRows, resolveFinalMarksForStudent };
})();