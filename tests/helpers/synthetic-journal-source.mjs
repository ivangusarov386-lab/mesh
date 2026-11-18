const sources = {
  schedule: { group: "group_ids", from: "from", to: "to" },
  homeworkAbsences: { group: "group_id_list", from: "begin_date", to: "end_date" },
};

function dayKey(parts) {
  if (!parts || parts.length !== 3 || !parts.every(Number.isInteger)) return null;
  const [year, month, day] = parts;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return year * 10000 + month * 100 + day;
}

function parseDate(value, dotted = false) {
  const pattern = dotted ? /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/ : /^(\d{4})-(\d{2})-(\d{2})$/;
  const parts = typeof value === "string" ? pattern.exec(value)?.slice(1).map(Number) : null;
  return dayKey(dotted ? parts?.reverse() : parts);
}

function groupKey(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  return /^[1-9]\d*$/.test(String(value)) ? String(value) : null;
}

function validateSource(name, pages, expected) {
  const fail = reason => { throw new Error(name + ": " + reason); };
  const keys = sources[name];
  const dotted = name === "homeworkAbsences";
  // The envelope is fixture-only. Totals and page size explicitly attest completeness.
  const first = pages?.[0];
  const { totalPages, totalRows } = first ?? {};
  const size = first?.params?.per_page;
  if (!Array.isArray(pages) || !Number.isSafeInteger(size) || size < 1
      || !Number.isSafeInteger(totalRows) || totalRows < 0
      || totalPages !== Math.max(1, Math.ceil(totalRows / size))
      || pages.length !== totalPages) {
    fail("incomplete or inconsistent pagination");
  }

  const seen = new Set();
  const rows = [];
  for (const entry of pages) {
    const { params, rows: records } = entry ?? {};
    const page = params?.page;
    if (!Number.isSafeInteger(page) || page < 1 || page > totalPages || seen.has(page)
        || params.per_page !== size || entry.totalPages !== totalPages || entry.totalRows !== totalRows
        || !Array.isArray(records) || records.length !== Math.min(size, totalRows - (page - 1) * size)) {
      fail("incomplete or inconsistent page");
    }
    seen.add(page);
    if (groupKey(params[keys.group]) !== expected.group) fail("wrong request group");
    if (parseDate(params[keys.from], dotted) !== expected.from
        || parseDate(params[keys.to], dotted) !== expected.to) fail("wrong request period");

    for (const record of records) {
      if (groupKey(record?.group_id) !== expected.group) fail("wrong record group");
      const date = dotted
        ? parseDate(record.date, true)
        : dayKey(Array.isArray(record.date) ? record.date : null);
      if (date === null || date < expected.from || date > expected.to) fail("wrong record period");
      // The existing collector expects zero-padded dates for absence records.
      rows.push(dotted ? {
        ...record,
        date: record.date.split(".").map(part => part.padStart(2, "0")).join("."),
      } : record);
    }
  }
  return rows;
}

export function readSyntheticJournal({ groupId, from, to, schedulePages, homeworkAbsencePages }) {
  const expected = { group: groupKey(groupId), from: parseDate(from), to: parseDate(to) };
  if (!expected.group || expected.from === null || expected.to === null || expected.from > expected.to) {
    return { ok: false, error: "invalid journal scope" };
  }

  try {
    const schedule = validateSource("schedule", schedulePages, expected);
    const homeworkAbsences = validateSource("homeworkAbsences", homeworkAbsencePages, expected);
    return { ok: true, data: { schedule, homeworkAbsences } };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
