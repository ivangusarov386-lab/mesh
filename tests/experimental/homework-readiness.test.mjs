import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule, plain } from "../helpers/vm.mjs";

const schedule = "/api/ej/plan/teacher/v1/schedule_items?group_ids=101&from=2026-11-01&to=2026-11-07&page=1&per_page=2";
const absences = "/api/ej/core/teacher/v1/homework_absences?group_id_list=101&begin_date=1.11.2026&end_date=7.11.2026&page=1&per_page=2";
const lesson = { group_id: 101, date: [2026, 11, 2], lesson_name: "Synthetic", homeworks_to_verify: [] };
const event = "mesh-helper-api-updated";
const today = [2026, 11, 7];

function harness() {
  const bridge = loadModule("marks-api-bridge.js");
  const timers = new Map();
  let id = 0;
  const collector = loadModule("admin-collector.js", {
    expose: ["inspectHomeworkSource", "waitForHomeworkSources", "homeworkCheckResult", "buildMissingHomeworkCsvAndDownload"],
    globals: {
      setTimeout(callback, delay) { timers.set(++id, { callback, delay }); return id; },
      clearTimeout(timer) { timers.delete(timer); },
    },
  });
  // The VM helper spreads overrides, so install a live getter for bridge updates.
  Object.defineProperty(collector.window, "__MESH_HELPER_API__", {
    get: () => bridge.window.__MESH_HELPER_API__,
  });
  const { listeners, exposed } = collector;
  collector.window.removeEventListener = (name, fn) => {
    if (listeners.get(name) === fn) listeners.delete(name);
  };
  return {
    ...exposed, timers, listeners,
    send(url, payload) {
      bridge.listeners.get("message")({ source: bridge.window, data: {
        source: "mesh-helper-marks-hook", type: "api-response", url, payload,
      } });
      listeners.get(event)?.({ detail: bridge.events.at(-1).detail });
    },
    fire(delay) {
      const match = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(match, "timer registered");
      timers.delete(match[0]);
      match[1].callback();
    },
  };
}

test("preloaded empty response and data produce only a preliminary result", async () => {
  const h = harness();
  assert.equal(h.inspectHomeworkSource("schedule", "101").state, "not-received");
  h.send(schedule, { items: [lesson] });
  h.send(absences, { data: [] });
  const pending = h.waitForHomeworkSources("101", 12000);
  h.fire(500);
  assert.deepEqual(plain(h.homeworkCheckResult(await pending, today)), {
    homeworkStatus: "preliminary",
    loading: {
      schedule: { state: "received-data", coverage: "unconfirmed" },
      homeworkAbsences: { state: "received-empty", coverage: "unconfirmed" },
    },
    preliminaryMissingHomeworkDates: ["02.11.2026"],
  });
  assert.equal(h.listeners.has(event), false);
  assert.equal(h.timers.size, 0);
});

test("timeout, unsupported response and empty schedule never report a successful check", async () => {
  const h = harness();
  const pending = h.waitForHomeworkSources("101", 12000);
  h.send(schedule, { error: { unrelated: [] } });
  h.fire(12000);
  assert.deepEqual(plain(h.homeworkCheckResult(await pending, today)), {
    homeworkStatus: "incomplete",
    loading: {
      schedule: { state: "unsupported-format" },
      homeworkAbsences: { state: "timeout" },
    },
  });
  assert.equal(h.listeners.has(event), false);
  assert.equal(h.timers.size, 0);
  h.send(schedule, []);
  h.send(absences, []);
  const empty = h.waitForHomeworkSources("101", 12000);
  h.fire(500);
  const result = h.homeworkCheckResult(await empty, today);
  assert.equal(result.homeworkStatus, "incomplete");
  assert.equal(result.loading.schedule.state, "received-empty");
});

test("pagination gaps prevent calculations and a late page can fill the gap", async () => {
  const h = harness();
  const waiting = h.waitForHomeworkSources("101", 12000);
  h.send(schedule.replace("page=1", "page=2"), [lesson]);
  h.send(absences, []);
  assert.equal(h.inspectHomeworkSource("schedule", "101").coverage, "incomplete");
  assert.equal([...h.timers.values()].some(t => t.delay === 500), false);
  h.fire(12000);
  assert.equal(h.homeworkCheckResult(await waiting, today).homeworkStatus, "incomplete");

  const recovered = h.waitForHomeworkSources("101", 12000);
  h.send(schedule, [lesson, { ...lesson, date: [2026, 11, 3] }]);
  h.fire(500);
  assert.deepEqual(plain(h.homeworkCheckResult(await recovered, today).preliminaryMissingHomeworkDates),
    ["02.11.2026", "03.11.2026"]);
});

test("only scoped responses enter the calculation and mismatched rows or periods are rejected", async () => {
  const h = harness();
  h.send(schedule.replace("group_ids=101", "group_ids=102"), [{ ...lesson, group_id: 102 }]);
  assert.equal(h.inspectHomeworkSource("schedule", "101").state, "group-mismatch");
  h.send(schedule.replace("group_ids=101", "teacher_id=1"), [{ ...lesson, group_id: 102 }]);
  h.send(schedule, [lesson]);
  h.send(absences, []);
  let read = () => ({
    schedule: h.inspectHomeworkSource("schedule", "101"),
    homeworkAbsences: h.inspectHomeworkSource("homeworkAbsences", "101"),
  });
  assert.deepEqual(plain(h.homeworkCheckResult(read(), today).preliminaryMissingHomeworkDates), ["02.11.2026"]);
  h.send(schedule, [{ ...lesson, group_id: 102 }]);
  assert.equal(h.homeworkCheckResult(read(), today).loading.schedule.state, "group-mismatch");
  h.send(schedule, [{ ...lesson, date: [2026, 11, 8] }]);
  assert.equal(h.homeworkCheckResult(read(), today).loading.schedule.state, "period-mismatch");
  h.send(schedule, [lesson]);
  const period = harness();
  period.send(schedule, [lesson]);
  period.send(absences.replace("end_date=7", "end_date=6"), []);
  const wrongPeriod = {
    schedule: period.inspectHomeworkSource("schedule", "101"),
    homeworkAbsences: period.inspectHomeworkSource("homeworkAbsences", "101"),
  };
  assert.equal(h.homeworkCheckResult(wrongPeriod, today).loading.scope, "period-mismatch");
  assert.equal(h.homeworkCheckResult(wrongPeriod, today).homeworkStatus, "incomplete");
});

test("dedicated CSV labels both sources and keeps provisional dates out of confirmed dates", async () => {
  let blob;
  class TestUrl extends URL {
    static createObjectURL(value) { blob = value; return "blob:fixture"; }
    static revokeObjectURL() {}
  }
  const { exposed } = loadModule("admin-collector.js", {
    expose: ["buildMissingHomeworkCsvAndDownload"],
    globals: { URL: TestUrl },
    document: { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) },
  });
  const { buildMissingHomeworkCsvAndDownload } = exposed;
  const stored = { results: {
    101: {
      id: 101, classLabel: "A", subject: "Synthetic",
      homeworkStatus: "preliminary", preliminaryMissingHomeworkDates: ["02.11.2026"],
      loading: {
        schedule: { state: "received-data", coverage: "unconfirmed" },
        homeworkAbsences: { state: "received-empty", coverage: "unconfirmed" },
      },
    },
    102: {
      id: 102, classLabel: "B", subject: "Synthetic",
      homeworkStatus: "incomplete",
      loading: { schedule: { state: "timeout" }, homeworkAbsences: { state: "unsupported-format" } },
    },
  } };
  stored.results[103] = { id: 103, classLabel: "C", subject: "Synthetic", missingHomeworkDates: ["03.11.2026"] };
  buildMissingHomeworkCsvAndDownload(stored, "fixture", true);
  const [header, preliminary, incomplete, legacy] = (await blob.text()).split("\n");
  assert.match(header, /"Статус проверки";"Расписание";"Отметки «Без ДЗ»";"Предварительные даты"$/);
  assert.match(preliminary, /^"A";"Synthetic";"";"101";"Предварительно";.*"пустой ответ, полнота не подтверждена";"02\.11\.2026"$/);
  assert.equal(incomplete, '"B";"Synthetic";"";"102";"Данные неполны";"таймаут";"неподдерживаемый формат";""');
  assert.equal(legacy, '"C";"Synthetic";"03.11.2026";"103";"Статус не сохранён";"";"";""');
  buildMissingHomeworkCsvAndDownload(stored, "fixture");
  assert.equal((await blob.text()).split("\n")[0], '"Класс";"Предмет";"Отсутствует ДЗ (даты)";"targetGroupId"');
});

test("homework timeout stores an incomplete result without writing other modes", async () => {
  const batchKey = "meshHelperAdminHomeworkBatch";
  const outputKey = "meshHelperAdminHomeworkLastResults";
  const state = new Map([[batchKey, {
    status: "running", startedAt: 1, currentIndex: 0, results: {},
    queue: [{ id: "101", classLabel: "Synthetic A", subject: "Synthetic" }],
  }]]);
  const writes = [];
  const timers = new Map();
  let id = 0;
  const copy = value => value === undefined ? undefined : plain(value);
  const { listeners, window } = loadModule("admin-collector.js", {
    location: { pathname: "/educationmanagement/manage/journals/group", search: "?targetGroupId=101" },
    chrome: { storage: { local: {
      get(key, callback) { callback({ [key]: copy(state.get(key)) }); },
      set(update, callback) {
        for (const [key, value] of Object.entries(update)) {
          writes.push(key);
          state.set(key, copy(value));
        }
        callback();
      },
    } } },
    globals: {
      setTimeout(callback, delay) { timers.set(++id, { callback, delay }); return id; },
      clearTimeout(timer) { timers.delete(timer); },
    },
  });
  window.removeEventListener = name => listeners.delete(name);
  await new Promise(resolve => setImmediate(resolve));
  const [{ callback, delay }] = timers.values();
  assert.equal(delay, 12000);
  callback();
  await new Promise(resolve => setImmediate(resolve));
  const record = state.get(outputKey).results["101"];
  assert.equal(record.homeworkStatus, "incomplete");
  assert.equal(record.loading.schedule.state, "timeout");
  assert.equal(record.loading.homeworkAbsences.state, "timeout");
  assert.equal("missingHomeworkDates" in record, false);
  assert.equal("preliminaryMissingHomeworkDates" in record, false);
  assert.deepEqual(new Set(writes), new Set([batchKey, outputKey]));
  assert.equal(timers.size, 0);
  assert.equal(listeners.has(event), false);
});

test("provisional results preserve due lesson, explicit absence, deletion and same-day rules", () => {
  const h = harness();
  const url = schedule.replace("per_page=2", "per_page=20");
  h.send(url, [
    { ...lesson, homeworks_to_give: [{ date_assigned_on: "2026-11-02" }] },
    { ...lesson, date: [2026, 11, 3], homeworks_to_verify: [{ date_prepared_for: "2026-11-03" }] },
    { ...lesson, date: [2026, 11, 4], homeworks_to_verify: null },
    { ...lesson, date: [2026, 11, 4], homeworks_to_verify: undefined },
    { ...lesson, date: [2026, 11, 5], cancelled: true },
  ]);
  h.send(absences, [
    { group_id: 101, date: "02.11.2026" },
    { group_id: 101, date: "04.11.2026", deleted_at: "synthetic" },
  ]);
  const read = () => h.homeworkCheckResult({
    schedule: h.inspectHomeworkSource("schedule", "101"),
    homeworkAbsences: h.inspectHomeworkSource("homeworkAbsences", "101"),
  }, today);
  assert.deepEqual(plain(read().preliminaryMissingHomeworkDates), ["04.11.2026"]);

  // Characterize the current strict row gate separately from request date parsing.
  h.send(absences, [{ group_id: 101, date: "2.11.2026" }]);
  assert.equal(read().homeworkStatus, "preliminary");
  assert.deepEqual(plain(read().preliminaryMissingHomeworkDates), ["04.11.2026"]);
});

test("a broader absence window is usable, but disjoint schedule windows are currently rejected", () => {
  const h = harness();
  h.send(schedule, [lesson]);
  h.send(absences.replace("end_date=7", "end_date=10"), []);
  const read = () => h.homeworkCheckResult({
    schedule: h.inspectHomeworkSource("schedule", "101"),
    homeworkAbsences: h.inspectHomeworkSource("homeworkAbsences", "101"),
  }, today);
  assert.deepEqual(plain(read().preliminaryMissingHomeworkDates), ["02.11.2026"]);
  h.send(schedule.replace("from=2026-11-01&to=2026-11-07", "from=2026-11-08&to=2026-11-10"),
    [{ ...lesson, date: [2026, 11, 8] }]);
  assert.equal(read().homeworkStatus, "incomplete");
  assert.equal(read().loading.schedule.state, "period-mismatch");
});
test("calendar dates normalize locally; invalid dates fail without mutating responses", () => {
  for (const date of ["2.11.2026", "02.11.2026", "2.1.2026", "02.1.2026"]) {
    const h = harness();
    const january = date.includes(".1.");
    const start = january ? "2026-01-01" : "2026-11-01";
    const end = january ? "2026-01-07" : "2026-11-07";
    const original = { group_id: 101, date };
    h.send(schedule.replace("2026-11-01", start).replace("2026-11-07", end),
      [{ ...lesson, date: [2026, january ? 1 : 11, 2] }]);
    h.send(absences.replace("1.11.", january ? "1.1." : "1.11.")
      .replace("7.11.", january ? "7.1." : "7.11."), [original]);
    const result = h.homeworkCheckResult({
      schedule: h.inspectHomeworkSource("schedule", "101"),
      homeworkAbsences: h.inspectHomeworkSource("homeworkAbsences", "101"),
    }, today);
    assert.deepEqual(plain(result.preliminaryMissingHomeworkDates), []);
    assert.equal(original.date, date);
  }
  for (const date of ["31.11.2026", "29.2.2026", "0.11.2026", "2026-11-02"]) {
    const h = harness();
    h.send(absences, [{ group_id: 101, date }]);
    assert.equal(h.inspectHomeworkSource("homeworkAbsences", "101").state, "unsupported-format");
  }
});

test("main homework adapter filters both arrays only with an explicitly verified group", () => {
  const { exposed } = loadModule("admin-collector.js", {
    expose: ["calculateHomeworkForVerifiedGroup"],
    window: { __MESH_HELPER_API__: {
      schedule: [
        lesson,
        { ...lesson, group_id: 102, date: [2026, 11, 3] },
        { ...lesson, date: [2026, 11, 4] },
      ],
      homeworkAbsences: [
        { group_id: 102, date: "02.11.2026" },
        { group_id: 101, date: "04.11.2026" },
      ],
    } },
    location: { search: "?targetGroupId=101" },
  });
  assert.deepEqual(plain(exposed.calculateHomeworkForVerifiedGroup(null, today)),
    { homeworkStatus: "incomplete", homeworkReason: "group-unconfirmed" });
  assert.deepEqual(plain(exposed.calculateHomeworkForVerifiedGroup("101", today)),
    { homeworkStatus: "preliminary", preliminaryMissingHomeworkDates: ["02.11.2026"] });
});