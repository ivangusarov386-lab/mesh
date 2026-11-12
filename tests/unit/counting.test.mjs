import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, fakeRow, plain } from '../helpers/vm.mjs';

function counter(window = {}) {
  return loadModule('hybrid-counter.js', { expose: ['domStats', 'rowStats', 'gradeFromRanges', 'csvValue'], window }).exposed;
}

test('one visible numeric mark counts once (domStats)', () => {
  assert.deepEqual(plain(counter().domStats(fakeRow(101, [{ values: ['5'] }]))), { grades: 1, absences: 0, lessons: 1 });
});
test('multiple spans in one lesson count as multiple marks', () => {
  assert.equal(counter().domStats(fakeRow(101, [{ values: ['4', '5'] }])).grades, 2);
});
test('stack icon with one numeric span adds exactly one hidden DOM mark', () => {
  assert.equal(counter().domStats(fakeRow(101, [{ values: ['5'], stacked: true }])).grades, 2);
});
test('future, average and final cells do not become lesson marks', () => {
  const row = fakeRow(101, [{ values: ['Н'] }, { values: ['5'], future: true }, { average: true }, { final: true }]);
  assert.deepEqual(plain(counter().domStats(row)), { grades: 0, absences: 1, lessons: 1 });
});
test('API can reveal three marks behind one visible mark; unrelated students excluded', () => {
  const marks = [1, 2, 3].map(id => ({ id, student_profile_id: 101, schedule_lesson_id: 200001, name: '4', date: '2026-11-02' }));
  marks.push({ id: 4, student_profile_id: 999, schedule_lesson_id: 200001, name: '5', date: '2026-11-02' });
  const api = counter({ __MESH_HELPER_MARKS__: { marks } });
  assert.deepEqual(plain(api.rowStats(fakeRow(101, [{ values: ['4'] }]))), { gradeCount: 3, absenceCount: 0, lessonCount: 1 });
});
test('without API, stacked DOM count is the fallback', () => {
  assert.equal(counter().rowStats(fakeRow(101, [{ values: ['4'], stacked: true }])).gradeCount, 2);
});
test('default grade ranges preserve the existing boundary values', () => {
  const { gradeFromRanges } = counter();
  for (const [value, expected] of [[2.59, 2], [2.6, 3], [3.59, 3], [3.6, 4], [4.59, 4], [4.6, 5]]) assert.equal(gradeFromRanges(value), expected);
});
test('CSV text escapes quotes and dangerous formula prefixes', () => {
  const { csvValue } = counter();
  assert.equal(csvValue('a;"b"'), '"a;""b"""');
  for (const prefix of ['=', '+', '-', '@', '\t', '\r']) assert.equal(csvValue(prefix + 'test'), `"'${prefix}test"`);
});
