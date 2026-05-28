(() => {
  if (window.__meshHelperClassDataInstalled) return;
  window.__meshHelperClassDataInstalled = true;

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[–—]/g, "-")
      .trim();
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getPeriodStart(period) {
    return parseDate(period?.start_date || period?.startDate || period?.date_start || period?.dateStart || period?.from);
  }

  function getPeriodEnd(period) {
    return parseDate(period?.end_date || period?.endDate || period?.date_end || period?.dateEnd || period?.to);
  }

  function getPeriodTitle(period) {
    return normalizeText(period?.title || period?.name || period?.period_name || period?.periodName || period?.number || "Текущий период");
  }

  function getPeriodId(period) {
    const source = period?.raw || period || {};
    return source?.id || source?.period_id || source?.periodId || source?.attestation_period_id || source?.attestationPeriodId || null;
  }

  function resolveCurrentPeriod(periods = [], now = new Date()) {
    const list = Array.isArray(periods) ? periods : [];
    const normalized = list
      .map((period) => ({ raw: period, id: getPeriodId(period), title: getPeriodTitle(period), start: getPeriodStart(period), end: getPeriodEnd(period) }))
      .filter((period) => period.start || period.end || period.id);

    const active = normalized.find((period) => {
      const afterStart = !period.start || now >= period.start;
      const beforeEnd = !period.end || now <= period.end;
      return afterStart && beforeEnd;
    });

    if (active) return active;
    return normalized.filter((period) => period.start && period.start <= now).sort((a, b) => b.start - a.start)[0] || normalized[0] || null;
  }

  function isMarkLike(value) {
    const markValue = normalizeText(value?.name || value?.value || value?.mark || value?.mark_value || value?.markValue || "");
    return Boolean(
      markValue &&
      (/^[1-5]$/.test(markValue) || markValue.toLowerCase().includes("н")) &&
      (value?.date || value?.lesson_date || value?.mark_date || value?.created_at || value?.updated_at || value?.weight || value?.control_form_id)
    );
  }

  function hasProfileNameFields(value) {
    const source = value?.student_profile || value?.studentProfile || value?.student || value?.person || value?.profile || value || {};
    return Boolean(
      source?.fio || source?.full_name || source?.fullName || source?.student_name || source?.studentName || source?.display_name || source?.displayName ||
      source?.last_name || source?.lastName || source?.first_name || source?.firstName || source?.middle_name || source?.middleName ||
      value?.fio || value?.full_name || value?.fullName || value?.student_name || value?.studentName || value?.display_name || value?.displayName ||
      value?.last_name || value?.lastName || value?.first_name || value?.firstName || value?.middle_name || value?.middleName
    );
  }

  function normalizeId(id) {
    const numeric = Number(id);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : id || null;
  }

  function getStudentId(value) {
    const nested = value?.student_profile || value?.studentProfile || value?.student || value?.person || value?.profile || null;
    const explicit =
      value?.student_profile_id || value?.studentProfileId ||
      value?.profile_id || value?.profileId ||
      value?.student_id || value?.studentId ||
      value?.person_id || value?.personId ||
      nested?.student_profile_id || nested?.studentProfileId ||
      nested?.profile_id || nested?.profileId ||
      nested?.student_id || nested?.studentId ||
      nested?.person_id || nested?.personId ||
      nested?.id || null;

    if (explicit) return normalizeId(explicit);

    // Важно: у mark.id — это id оценки, а не id ученика. Поэтому голый id берем
    // только у объектов, которые похожи на профиль ученика, а не на оценку.
    if (!isMarkLike(value) && hasProfileNameFields(value)) return normalizeId(value?.id);

    return null;
  }

  function safeNameCandidate(value) {
    const text = normalizeText(value);
    if (!text) return "";
    if (/^[1-5]$/.test(text)) return "";
    if (/^н$/i.test(text)) return "";
    if (text.length < 2) return "";
    return text;
  }

  function getStudentName(profile) {
    const source = profile?.student_profile || profile?.studentProfile || profile?.student || profile?.person || profile?.profile || profile || {};
    const combined = [
      source?.last_name || source?.lastName || profile?.last_name || profile?.lastName,
      source?.first_name || source?.firstName || profile?.first_name || profile?.firstName,
      source?.middle_name || source?.middleName || profile?.middle_name || profile?.middleName
    ].filter(Boolean).join(" ");

    return safeNameCandidate(
      source?.fio || source?.full_name || source?.fullName || source?.student_name || source?.studentName || source?.display_name || source?.displayName ||
      profile?.fio || profile?.full_name || profile?.fullName || profile?.student_name || profile?.studentName || profile?.display_name || profile?.displayName ||
      combined ||
      source?.name || profile?.name ||
      "Без ФИО"
    ) || "Без ФИО";
  }

  function getJournalId(value) {
    const id = value?.journal_id || value?.journalId || value?.subject_journal_id || value?.subjectJournalId || value?.group_id || value?.groupId || value?.education_group_id || value?.educationGroupId || null;
    return normalizeId(id);
  }

  function sameJournal(item, journal) {
    if (!journal?.journalId) return true;
    const itemJournalId = getJournalId(item);
    if (!itemJournalId) return true;
    return String(itemJournalId) === String(journal.journalId);
  }

  function getMarkValue(mark) {
    return normalizeText(mark?.name || mark?.value || mark?.mark || mark?.mark_value || mark?.markValue || "");
  }

  function getFinalValue(item) {
    return normalizeText(item?.name || item?.value || item?.mark || item?.final_mark || item?.finalMark || item?.mark_value || item?.markValue || "");
  }

  function getFinalPeriodId(item) {
    return item?.period_id || item?.periodId || item?.attestation_period_id || item?.attestationPeriodId || item?.attestation_period?.id || null;
  }

  function getFinalKind(item) {
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

  function isInPeriod(item, period) {
    if (!period) return true;
    const date = parseDate(item?.date || item?.mark_date || item?.lesson_date || item?.created_at || item?.updated_at);
    if (!date) return true;
    const afterStart = !period.start || date >= period.start;
    const beforeEnd = !period.end || date <= period.end;
    return afterStart && beforeEnd;
  }

  function possibleFinal(avg) {
    const n = Number(avg);
    if (!Number.isFinite(n)) return "";
    if (n >= 4.6) return 5;
    if (n >= 3.6) return 4;
    if (n >= 2.6) return 3;
    return 2;
  }

  function makeStudent(id, source = null) {
    return { id, fio: getStudentName(source), marks: [], average: null, rawProfile: source };
  }

  function buildStudentsMap({ studentProfiles = [], marks = [], averageMarks = [] } = {}) {
    const students = new Map();

    studentProfiles.forEach((profile) => {
      const id = getStudentId(profile);
      if (!id) return;
      students.set(String(id), makeStudent(id, profile));
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

  function resolveFinalMarksForStudent({ studentId, finalMarks = [], period = null, journal = null } = {}) {
    const sid = String(studentId || "");
    const items = (Array.isArray(finalMarks) ? finalMarks : []).filter((item) => String(getStudentId(item) || "") === sid).filter((item) => sameJournal(item, journal));
    const periodId = period?.id ? String(period.id) : "";
    const current = items.find((item) => periodId && String(getFinalPeriodId(item) || "") === periodId) || items.find((item) => getFinalKind(item) === "period");
    const pa = items.find((item) => getFinalKind(item) === "pa");
    const year = items.find((item) => getFinalKind(item) === "year");
    return { current: getFinalValue(current), pa: getFinalValue(pa), year: getFinalValue(year), raw: items };
  }

  function buildCurrentPeriodRows({ students = [], period = null, finalMarks = [], journal = null } = {}) {
    return students.map((student) => {
      const periodMarks = (student.marks || []).filter((mark) => sameJournal(mark, journal)).filter((mark) => isInPeriod(mark, period));
      const grades = periodMarks.map(getMarkValue).filter(isGrade).map(Number);
      const absences = periodMarks.map(getMarkValue).filter(isAbsence).length;
      const lessonsFact = periodMarks.length;
      const avg = grades.length ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length : null;
      const absencePercent = lessonsFact ? Math.round((absences / lessonsFact) * 1000) / 10 : 0;
      const calculatedFinal = possibleFinal(avg);
      const finals = resolveFinalMarksForStudent({ studentId: student.id, finalMarks, period, journal });

      return {
        studentId: student.id,
        fio: getStudentName(student.rawProfile) !== "Без ФИО" ? getStudentName(student.rawProfile) : student.fio,
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

  window.__MESH_HELPER_CLASS_DATA__ = {
    normalizeText,
    parseDate,
    resolveCurrentPeriod,
    getStudentId,
    getStudentName,
    getJournalId,
    buildStudentsMap,
    buildCurrentPeriodRows,
    resolveFinalMarksForStudent
  };
})();
