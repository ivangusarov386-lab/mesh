import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, plain } from '../helpers/vm.mjs';

test('bridge accumulates marks across responses and updates same id instead of duplicating', () => {
  const bridge = loadModule('marks-api-bridge.js');
  const send = marks => bridge.listeners.get('message')({ source: bridge.window, data: {
    source: 'mesh-helper-marks-hook', type: 'marks-response', url: '/api/ej/core/teacher/v1/marks?fixture=unit', payload: marks
  } });
  send([{ id: 1, student_profile_id: 101, name: '4', date: '2026-11-02' }]);
  send([{ id: 2, student_profile_id: 101, name: '5', date: '2026-11-02' }]);
  send([{ id: 1, student_profile_id: 101, name: '3', date: '2026-11-02' }]);
  assert.equal(bridge.window.__MESH_HELPER_API__.marks.length, 2);
  assert.equal(bridge.window.__MESH_HELPER_API__.marks.find(m => m.id === 1).name, '3');
  assert.deepEqual(plain(bridge.window.__MESH_HELPER_MARKS__.stats[101]), { total: 2, hidden: 1, dates: { '2026-11-02': 2 } });
});
test('bridge ignores a different message source window and an unrelated source marker', () => {
  const bridge = loadModule('marks-api-bridge.js');
  const listener = bridge.listeners.get('message');
  listener({ source: {}, data: { source: 'mesh-helper-marks-hook', type: 'marks-response', payload: [] } });
  listener({ source: bridge.window, data: { source: 'unrelated', type: 'marks-response', payload: [] } });
  assert.equal(bridge.window.__MESH_HELPER_API__, undefined);
});
function homework() {
  return loadModule('admin-collector.js').window.__MESH_HELPER_ADMIN_COLLECTOR__.findMissingHomeworkDates;
}
const lesson = (date, extra = {}) => ({ group_id: 990001, lesson_name: 'Тестовый предмет', date, ...extra });
test('missing homework uses to_verify, not to_give, excludes cancelled/future and deduplicates dates', () => {
  const dates = homework()([
    lesson([2026, 11, 2], { homeworks_to_give: [{}] }),
    lesson([2026, 11, 2]),
    lesson([2026, 11, 3], { homeworks_to_verify: [{}] }),
    lesson([2026, 11, 4], { cancelled: true }),
    lesson([2026, 11, 13])
  ], [2026, 11, 12], []);
  assert.deepEqual(plain(dates), ['02.11.2026']);
});
test('explicit homework absence suppresses date, deleted absence does not', () => {
  const dates = homework()([lesson([2026, 11, 2]), lesson([2026, 11, 3])], [2026, 11, 12], [
    { group_id: 990001, date: '02.11.2026' },
    { group_id: 990001, date: '03.11.2026', deleted_at: 'synthetic-deletion' }
  ]);
  assert.deepEqual(plain(dates), ['03.11.2026']);
});
