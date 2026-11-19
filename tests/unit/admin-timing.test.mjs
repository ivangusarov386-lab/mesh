import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule, plain } from '../helpers/vm.mjs';

async function run(enabled) {
  const batch = { status: 'running', mode: 'background', currentIndex: 0, queue: [
    { id: 'synthetic-a', subject: 'A', classLabel: 'synthetic', classId: 'x' },
    { id: 'synthetic-b', subject: 'B', classLabel: 'synthetic', classId: 'x' }
  ], results: {} };
  const values = { meshHelperAdminHomeworkBatch: batch };
  const messages = [], reports = [];
  for (const id of ['synthetic-a', 'synthetic-b']) {
    let active = false, clock = 0;
    const env = loadModule('admin-collector.js', {
      expose: ['resumeAdminHomeworkBatchIfRunning'],
      location: { search: `?targetGroupId=${id}` },
      window: {
        localStorage: { getItem: () => enabled ? '1' : null },
        performance: { now: () => ++clock },
        __MESH_HELPER_API__: { schedule: [{group_id: 1, date: [2020, 1, 1]}], homeworkAbsences: [{group_id: 1, date: '01.01.2020'}] }
      },
      chrome: {
        runtime: { sendMessage: message => messages.push(message) },
        storage: { local: {
          get: (key, cb) => cb(active ? { [key]: values[key] } : {}),
          set: (data, cb) => { Object.assign(values, data); cb(); },
          remove: (key, cb) => { delete values[key]; cb(); }
        } }
      },
      globals: {
        console: { log() {}, error() {}, info: (...args) => reports.push(plain(args)) },
        setTimeout: (fn) => { queueMicrotask(fn); return 0; },
        Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-19T00:00:00Z'])); } static now() { return 12345; } }
      }
    });
    await Promise.resolve();
    active = true;
    await env.exposed.resumeAdminHomeworkBatchIfRunning();
  }
  return { result: plain(values.meshHelperAdminHomeworkLastResults), messages: plain(messages), reports };
}

test('optional timing leaves real homework collection results and journal order unchanged', async () => {
  const off = await run(false), on = await run(true);
  assert.deepEqual(on.result, off.result);
  assert.deepEqual(on.messages, off.messages);
  assert.deepEqual(Object.keys(on.result.results), ['synthetic-a', 'synthetic-b']);
  assert.equal(off.reports.length, 0);
  assert.equal(on.reports.length, 2);
  for (const [, report] of on.reports) {
    assert.equal(report.mode, 'homework');
    assert.deepEqual(report.entries.map(x => x.stage), ['schedule', 'homeworkAbsences']);
    assert.ok(report.entries.every(x => x.reason === 'already-loaded' && Number.isFinite(x.ms)));
    assert.doesNotMatch(JSON.stringify(report), /synthetic|targetGroupId|2020/);
  }
});
