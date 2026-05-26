(() => {
  if (window.__meshHelperClassDataInstalled) return;
  window.__meshHelperClassDataInstalled = true;

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[–—]/g, "-")
      .trim();
  }

  function getStudentId(value) {
    const id = value?.student_profile_id ||
      value?.studentProfileId ||
      value?.profile_id ||
      value?.student_id ||
      value?.studentId ||
      value?.id ||
      null;

    const numeric = Number(id);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : id;
  }

  function getStudentName(profile) {
    return normalizeText(
      profile?.fio ||
      profile?.full_name ||
      profile?.fullName ||
      profile?.student_name ||
      profile?.name ||
      [
        profile?.last_name || profile?.lastName,
        profile?.first_name || profile?.firstName,
        profile?.middle_name || profile?.middleName
      ].filter(Boolean).join(" ") ||
      "Без ФИО"
    );
  }

  function buildStudentsMap({
    studentProfiles = [],
    marks = [],
    averageMarks = []
  } = {}) {
    const students = new Map();

    studentProfiles.forEach((profile) => {
      const id = getStudentId(profile);
      if (!id) return;

      students.set(String(id), {
        id,
        fio: getStudentName(profile),
        marks: [],
        average: null,
        rawProfile: profile
      });
    });

    marks.forEach((mark) => {
      const id = getStudentId(mark);
      if (!id) return;

      const key = String(id);

      if (!students.has(key)) {
        students.set(key, {
          id,
          fio: "Без ФИО",
          marks: [],
          average: null,
          rawProfile: null
        });
      }

      students.get(key).marks.push(mark);
    });

    averageMarks.forEach((avg) => {
      const id = getStudentId(avg);
      if (!id) return;

      const key = String(id);

      if (!students.has(key)) {
        students.set(key, {
          id,
          fio: "Без ФИО",
          marks: [],
          average: null,
          rawProfile: null
        });
      }

      students.get(key).average = avg;
    });

    return [...students.values()].sort((a, b) =>
      a.fio.localeCompare(b.fio, "ru")
    );
  }

  window.__MESH_HELPER_CLASS_DATA__ = {
    normalizeText,
    getStudentId,
    getStudentName,
    buildStudentsMap
  };
})();
