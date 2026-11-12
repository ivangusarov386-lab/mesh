import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { resolveFixture, installOfflineRoutes } from '../helpers/offline-router.mjs';
import { startDenyProxy } from '../helpers/deny-proxy.mjs';

test('offline router serves the exact synthetic journal and marks payload', () => {
  const page = resolveFixture('https://school.mos.ru/teacher/study-process/journal/grade/990001?case=all');
  assert.equal(page.status, 200);
  assert.match(page.body.toString(), /Тестовый ученик 001/);
  const marks = JSON.parse(resolveFixture('https://school.mos.ru/api/ej/core/teacher/v1/marks?fixture=hidden').body);
  assert.equal(marks.length, 3);
  assert.ok(marks.every(m => m.student_profile_id === 104));
});
test('offline router rejects nonfixture host, real-looking queries, POST and unknown paths', () => {
  for (const url of [
    'https://example.com/mesh-fixture/journal.js',
    'https://school.mos.ru/api/ej/core/teacher/v1/marks?group_ids=123',
    'https://school.mos.ru/api/ej/core/teacher/v1/marks?fixture=hidden&token=not-a-real-token',
    'https://school.mos.ru/teacher/study-process/journal/grade/999',
    'https://school.mos.ru/teacher/study-process/journal/grade/990001?case=unknown'
  ]) assert.equal(resolveFixture(url), null, url);
  assert.equal(resolveFixture('https://school.mos.ru/api/ej/core/teacher/v1/marks?fixture=hidden', 'POST'), null);
});
test('context routing aborts unknown traffic instead of invoking any passthrough', async () => {
  let handler, websocketHandler;
  const context = {
    route: async (_pattern, cb) => { handler = cb; },
    routeWebSocket: async (_pattern, cb) => { websocketHandler = cb; }
  };
  const network = await installOfflineRoutes(context);
  let aborted;
  await handler({ request: () => ({ method: () => 'GET', url: () => 'https://school.mos.ru/not-a-fixture' }), abort: async reason => { aborted = reason; }, fulfill: () => assert.fail('Unknown request must not be fulfilled') });
  assert.equal(aborted, 'blockedbyclient');
  assert.equal(network.blocked.length, 1);
  let closed = false;
  websocketHandler({ url: () => 'wss://school.mos.ru/not-a-fixture', close: () => { closed = true; } });
  assert.equal(closed, true);
  assert.equal(network.blocked[1].method, 'WebSocket');
});
test('test-only deny proxy refuses HTTP and HTTPS CONNECT without upstream forwarding', async () => {
  const proxy = await startDenyProxy();
  try {
    const address = new URL(proxy.url);
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: address.hostname, port: address.port, path: 'http://school.mos.ru/not-requested-upstream', method: 'GET' }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 403);
    const tunnelStatus = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: address.hostname, port: address.port, path: 'school.mos.ru:443', method: 'CONNECT' });
      req.on('connect', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(tunnelStatus, 403);
    assert.deepEqual(proxy.denied.map(r => r.method), ['GET', 'CONNECT']);
  } finally { await proxy.close(); }
});
