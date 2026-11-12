import { readFileSync } from 'node:fs';
import path from 'node:path';
import { testsRoot } from './paths.mjs';

const fixtureDir = path.join(testsRoot, 'fixtures');
const scenarios = JSON.parse(readFileSync(path.join(fixtureDir, 'scenarios.json')));
const assets = {
  '/mesh-fixture/journal.css': ['text/css', 'journal.css'],
  '/mesh-fixture/journal.js': ['text/javascript', 'journal.js']
};
// Every URL and query here is a harness contract, not a production API claim.
export function resolveFixture(urlText, method = 'GET') {
  const url = new URL(urlText);
  if (method !== 'GET' || url.origin !== 'https://school.mos.ru') return null;
  if (url.pathname === '/teacher/study-process/journal/grade/990001') {
    const keys = [...url.searchParams.keys()];
    if (keys.some(k => k !== 'case') || keys.length > 1 || !['all', 'monthly', 'free', 'pro'].includes(url.searchParams.get('case') ?? 'all')) return null;
    return { status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(path.join(fixtureDir, 'journal.html')) };
  }
  if (assets[url.pathname] && !url.search) {
    const [contentType, file] = assets[url.pathname];
    return { status: 200, contentType, body: readFileSync(path.join(fixtureDir, file)) };
  }
  if (url.pathname === '/api/ej/core/teacher/v1/marks' && url.search === '?fixture=hidden') {
    return { status: 200, contentType: 'application/json', body: JSON.stringify(scenarios.hiddenMarks) };
  }
  return null;
}

export async function installOfflineRoutes(context, { extensionId } = {}) {
  if (extensionId !== undefined && !/^[a-p]{32}$/.test(extensionId)) {
    throw new Error('Expected the tested extension ID from its verified worker URL');
  }
  const ownHookUrl = extensionId ? `chrome-extension://${extensionId}/src/marks-api-hook.js` : null;
  const blocked = [];
  const requests = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    requests.push({ method: request.method(), url });
    // This is the packaged WAR loaded by the real bridge, not external traffic.
    // Keep native Chrome resource/CSP checks; never continue HTTP(S) or other IDs.
    if (ownHookUrl && request.method() === 'GET' && url === ownHookUrl) {
      await route.continue();
      return;
    }
    const fixture = resolveFixture(url, request.method());
    if (!fixture) {
      blocked.push({ method: request.method(), url });
      await route.abort('blockedbyclient');
      return;
    }
    await route.fulfill(fixture);
  });
  await context.routeWebSocket('**/*', socket => {
    blocked.push({ method: 'WebSocket', url: socket.url() });
    socket.close();
  });
  return { blocked, requests };
}
