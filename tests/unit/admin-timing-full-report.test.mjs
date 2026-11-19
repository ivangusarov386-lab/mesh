import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, plain } from '../helpers/vm.mjs';

const subjects = [
  { id: '101', subject: 'Алгебра', classLabel: 'Тестовый класс', classId: 'synthetic-class', mark: '4', final: '4' },
  { id: '102', subject: 'История', classLabel: 'Тестовый класс', classId: 'synthetic-class', mark: '5', final: '5' }
];
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-19T12:00:00Z'])); }
  static now() { return 1795089600000; }
}

function finalRow(value) {
  const markCell = { getAttribute: () => 'markCell-777_1_1' };
  const finalCell = { tagName: 'TD', innerText: value, querySelector: selector => selector.includes('finalResult') ? {} : null };
  const yearCell = { tagName: 'TD', innerText: value, querySelector: selector => selector.includes('yearResult') ? {} : null };
  return { children: [finalCell, yearCell], querySelector: selector => selector.includes('markCell-') ? markCell : null };
}

async function collectAndExport(enabled) {
  const values = { meshHelperAdminBatch: { status: 'running', mode: 'background', currentIndex: 0,
    queue: subjects.map(({ mark, final, ...item }) => ({ ...item, status: 'pending' })), results: {} } };
  const order = [], queues = [], messages = [], diagnostics = [], blobs = [];
  class CaptureURL extends URL {
    static createObjectURL(blob) { blobs.push(blob); return 'blob:synthetic'; }
    static revokeObjectURL() {}
  }
  const workbook = loadModule('class-workbook.js', { globals: { URL: CaptureURL }, document: { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) } }).window.__MESH_HELPER_CLASS_WORKBOOK__;
  let lastApi;
  for (const subject of subjects) {
    let active = false, clock = 0;
    const apiData = {
      marks: [{ group_id: subject.id, student_profile_id: 777, name: subject.mark }],
      studentProfiles: [{ id: 777, short_name: 'Вымышленный ученик' }],
      schedule: [
        { group_id: subject.id, date: [2026, 11, 2], lesson_name: 'Урок', homeworks_to_verify: [] },
        { group_id: subject.id, date: [2026, 11, 3], lesson_name: 'Урок', homeworks_to_verify: [{}] }
      ],
      homeworkAbsences: [{ group_id: subject.id, date: '04.11.2026' }],
      attendances: [{ student_profile_id: 777, date: '02.11.2026' }],
      medicalRecommendations: [{ student_profile_id: 777, date: '2026-11-02', type: 'SICK' }]
    };
    const env = loadModule('admin-collector.js', {
      expose: ['resumeAdminBatchIfRunning'], location: { search: `?targetGroupId=${subject.id}` },
      window: {
        localStorage: { getItem: () => enabled ? '1' : null }, performance: { now: () => ++clock },
        __MESH_HELPER_MARKS__: { loadedAt: 1 }, __MESH_HELPER_API__: apiData,
        __MESH_HELPER_CLASS_WORKBOOK__: workbook
      },
      document: {
        querySelector: () => ({}), querySelectorAll: selector => selector === 'tr' ? [finalRow(subject.final)] : [],
        body: { appendChild() {} }, createElement: () => ({ dataset: {}, click() {}, remove() {} })
      },
      chrome: {
        runtime: { sendMessage: message => messages.push(message) },
        storage: {
          local: { get: (key, cb) => cb(active ? { [key]: values[key] } : {}),
            set: (data, cb) => {
              const batch = data.meshHelperAdminBatch;
              if (batch) {
                queues.push(plain(batch.queue.map(item => ({ id: item.id, subject: item.subject }))));
                for (const id of Object.keys(batch.results)) if (!order.includes(id)) order.push(id);
              }
              Object.assign(values, data); cb();
            },
            remove: (key, cb) => { delete values[key]; cb(); } },
          sync: { get: (_keys, cb) => cb({}) }
        }
      },
      globals: {
        console: { log() {}, error() {}, info: (...args) => diagnostics.push(plain(args)) },
        URL: CaptureURL, Date: FixedDate, setTimeout: fn => { queueMicrotask(fn); return 0; }
      }
    });
    await Promise.resolve();
    active = true;
    await env.exposed.resumeAdminBatchIfRunning();
    lastApi = env.window.__MESH_HELPER_ADMIN_COLLECTOR__;
  }
  const report = plain(values.meshHelperAdminLastResults);
  const csvResult = plain(await lastApi.downloadMissingHomeworkResultsCsv());
  const xlsxResult = plain(await lastApi.downloadAdminParallelWorkbook());
  assert.equal(blobs.length, 2);
  return { report, order, queues, messages: plain(messages), csvResult, xlsxResult,
    csv: await blobs[0].text(), xlsx: Buffer.from(await blobs[1].arrayBuffer()), diagnostics };
}

test('main admin collection and actual CSV/XLSX exports are unchanged by timing diagnostics', async () => {
  const off = await collectAndExport(false), on = await collectAndExport(true);
  assert.deepEqual(on.order, ['101', '102']);
  assert.deepEqual(on.order, off.order);
  assert.deepEqual(on.queues, off.queues);
  assert.deepEqual(on.queues[0].map(item => item.subject), subjects.map(item => item.subject));
  assert.deepEqual(on.messages, off.messages);
  assert.deepEqual(on.report, off.report);
  assert.equal(on.report.processedCount, 2);
  assert.equal(on.report.totalCount, 2);
  for (const subject of subjects) {
    const result = on.report.results[subject.id];
    assert.equal(result.marks[0].name, subject.mark);
    assert.deepEqual(result.finalGrades, [{ studentId: '777', periods: [subject.final], yearFinal: subject.final }]);
    assert.equal(result.attendances[0].student_profile_id, 777);
    assert.deepEqual(result.missingHomeworkDates, ['02.11.2026']);
  }
  assert.deepEqual(on.csvResult, off.csvResult);
  assert.deepEqual(on.xlsxResult, off.xlsxResult);
  assert.equal(on.csv, off.csv);
  assert.match(on.csv, /Алгебра/);
  assert.match(on.csv, /История/);
  assert.match(on.csv, /02\.11\.2026/);
  assert.deepEqual(on.xlsx, off.xlsx);
  assert.equal(on.xlsx.subarray(0, 2).toString(), 'PK');
  for (const text of ['Алгебра', 'История', 'Вымышленный ученик', '02.11.2026']) {
    assert.ok(on.xlsx.includes(Buffer.from(text)), `XLSX missing ${text}`);
  }
  assert.equal(off.diagnostics.length, 0);
  assert.equal(on.diagnostics.length, 2);
  const userOutput = JSON.stringify(on.report) + on.csv + on.xlsx.toString('utf8');
  assert.doesNotMatch(userOutput, /meshHelperAdminTiming|диагностика ожиданий|already-loaded|finals-dom/);
});
