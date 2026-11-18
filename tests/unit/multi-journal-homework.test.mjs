import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule, plain } from "../helpers/vm.mjs";
import { readSyntheticJournal } from "../helpers/synthetic-journal-source.mjs";

const { findMissingHomeworkDates } = loadModule("admin-collector.js")
  .window.__MESH_HELPER_ADMIN_COLLECTOR__;
const today = [2026, 11, 7];

function lesson(group, day) {
  return { group_id: group, date: [2026, 11, day], lesson_name: "Synthetic lesson", homeworks_to_verify: [] };
}

function fixture(groupId, schedule, absences) {
  function pages(params, records) {
    const totalRows = records.length;
    const totalPages = Math.max(1, totalRows);
    return Array.from({ length: totalPages }, (_, i) => ({
      params: { ...params, page: i + 1, per_page: 1 },
      totalRows,
      totalPages,
      rows: records.slice(i, i + 1),
    }));
  }
  return {
    groupId,
    from: "2026-11-01",
    to: "2026-11-07",
    schedulePages: pages({ group_ids: groupId, from: "2026-11-01", to: "2026-11-07" }, schedule),
    homeworkAbsencePages: pages({
      group_id_list: groupId, begin_date: "1.11.2026", end_date: "7.11.2026",
    }, absences),
  };
}

function calculate(journals) {
  return new Map(journals.map(journal => {
    const result = readSyntheticJournal(journal);
    if (!result.ok) return [journal.groupId, result];
    const { schedule, homeworkAbsences } = result.data;
    return [journal.groupId, {
      ok: true,
      dates: plain(findMissingHomeworkDates(schedule, today, homeworkAbsences)),
    }];
  }));
}

test("complete pages preserve distinct homework results for two journals", () => {
  const first = fixture(101, [lesson(101, 2), lesson(101, 3)], [{ group_id: 101, date: "2.11.2026" }]);
  const second = fixture(102, [lesson(102, 2)], []);
  assert.deepEqual(calculate([first, second]), new Map([
    [101, { ok: true, dates: ["03.11.2026"] }],
    [102, { ok: true, dates: ["02.11.2026"] }],
  ]));
});

test("empty results require explicit complete pages for both sources", () => {
  const empty = fixture(101, [], []);
  assert.deepEqual(calculate([empty]).get(101), { ok: true, dates: [] });
  empty.homeworkAbsencePages = [];
  assert.deepEqual(calculate([empty]).get(101), {
    ok: false, error: "homeworkAbsences: incomplete or inconsistent pagination",
  });
});

test("incomplete or duplicate pages return validation errors per journal", () => {
  const broken = fixture(101, [lesson(101, 2), lesson(101, 3)], []);
  const [page1, page2] = broken.schedulePages;
  const other = fixture(102, [lesson(102, 2)], []);
  for (const pages of [[page1], [page1, page1], [page1, { ...page2, rows: [] }]]) {
    broken.schedulePages = pages;
    const result = calculate([broken, other]);
    assert.equal(result.get(101).ok, false);
    assert.match(result.get(101).error, /^schedule: incomplete or inconsistent/);
    assert.deepEqual(result.get(102), { ok: true, dates: ["02.11.2026"] });
  }
});

test("a wrong group in request parameters or source records fails validation", () => {
  const journal = fixture(101, [lesson(101, 2)], [{ group_id: 102, date: "2.11.2026" }]);
  assert.deepEqual(calculate([journal]).get(101), { ok: false, error: "homeworkAbsences: wrong record group" });
  journal.schedulePages[0].params.group_ids = 102;
  assert.deepEqual(calculate([journal]).get(101), { ok: false, error: "schedule: wrong request group" });
});

test("a mismatched request period or an out-of-period record fails validation", () => {
  const journal = fixture(101, [lesson(101, 8)], []);
  assert.deepEqual(calculate([journal]).get(101), { ok: false, error: "schedule: wrong record period" });
  journal.schedulePages[0].rows = [lesson(101, 2)];
  journal.homeworkAbsencePages[0].params.end_date = "8.11.2026";
  assert.deepEqual(calculate([journal]).get(101), { ok: false, error: "homeworkAbsences: wrong request period" });
});
