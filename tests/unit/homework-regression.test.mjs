import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule, plain } from "../helpers/vm.mjs";

const today = [2026, 11, 7];

function lesson(day, fields = {}) {
  return { group_id: 101, lesson_name: "Synthetic lesson", date: [2026, 11, day], ...fields };
}

function calculate(schedule, homeworkAbsences = []) {
  const { findMissingHomeworkDates } = loadModule("admin-collector.js")
    .window.__MESH_HELPER_ADMIN_COLLECTOR__;
  return plain(findMissingHomeworkDates(schedule, today, homeworkAbsences));
}

test("homework is associated with the lesson where it appears in to_verify", () => {
  const homework = {
    date_created: "2026-11-01",
    date_assigned_on: "2026-11-02",
    date_prepared_for: "2026-11-04",
  };
  assert.deepEqual(calculate([
    lesson(1),
    lesson(2, { homeworks_to_give: [homework], homeworks_to_verify: [] }),
    lesson(4, { homeworks_to_give: [], homeworks_to_verify: [homework] }),
  ]), ["01.11.2026", "02.11.2026"]);
});

test("absent, null and empty to_verify remain eligible; future and cancelled lessons are excluded", () => {
  assert.deepEqual(calculate([
    lesson(1),
    lesson(2, { homeworks_to_verify: null }),
    lesson(3, { homeworks_to_verify: [] }),
    lesson(4, { cancelled: true }),
    lesson(8),
    lesson(7),
  ]), ["01.11.2026", "02.11.2026", "03.11.2026", "07.11.2026"]);
});

test("same-day results use any eligible missing lesson, deduplicate dates and honor same-group exclusions", () => {
  const schedule = [
    lesson(5, { homeworks_to_verify: [{}] }),
    lesson(5),
    lesson(5),
    lesson(4),
    lesson(4),
    lesson(3),
    lesson(2),
  ];
  const absences = [
    { group_id: "101", date: "04.11.2026" },
    { group_id: 101, date: "03.11.2026", deleted_at: "synthetic" },
    { group_id: 102, date: "02.11.2026" },
  ];
  const expected = ["02.11.2026", "03.11.2026", "05.11.2026"];
  assert.deepEqual(calculate(schedule, absences), expected);
  assert.deepEqual(calculate([...schedule].reverse(), absences), expected);
});

test("legacy parser accepts padded absence dates; unpadded record is a known false positive", () => {
  assert.deepEqual(calculate([lesson(2)], [{ group_id: 101, date: "02.11.2026" }]), []);
  assert.deepEqual(calculate([lesson(2)], [{ group_id: 101, date: "2.11.2026" }]), ["02.11.2026"]);
});

test("main collector accessor preserves the legacy merged schedule behavior, including mixed-group exposure", () => {
  const schedule = [lesson(2), lesson(3, { group_id: 102 })];
  const homeworkAbsences = [{ group_id: 101, date: "02.11.2026" }];
  const { getMissingHomeworkDatesForCurrentJournal } = loadModule("admin-collector.js", {
    window: { __MESH_HELPER_API__: { schedule, homeworkAbsences, homeworkResponses: {} } },
    location: { pathname: "/educationmanagement/manage/journals/group", search: "?targetGroupId=101" },
  }).window.__MESH_HELPER_ADMIN_COLLECTOR__;
  assert.deepEqual(plain(getMissingHomeworkDatesForCurrentJournal(today)), ["03.11.2026"]);
});
