import { test as base, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { root } from '../helpers/paths.mjs';
import { installOfflineRoutes } from '../helpers/offline-router.mjs';
import { startDenyProxy } from '../helpers/deny-proxy.mjs';

async function saveEvidence({ context, network, denyProxy, pageErrors, tracing, failed, testInfo }) {
  if (failed) {
    for (const [index, page] of context.pages().entries()) {
      if (page.isClosed()) continue;
      const file = testInfo.outputPath(`failure-${index}.png`);
      try {
        await page.screenshot({ path: file, fullPage: true, timeout: 5000 });
        await testInfo.attach(`screenshot-${index}`, { path: file, contentType: 'image/png' });
      } catch (error) {
        testInfo.annotations.push({ type: 'screenshot-error', description: error.message });
      }
    }
  }
  const evidence = testInfo.outputPath('network.json');
  await writeFile(evidence, JSON.stringify({
    requests: network?.requests, blocked: network?.blocked,
    deniedByProxy: denyProxy.denied, pageErrors
  }, null, 2));
  await testInfo.attach('network', { path: evidence, contentType: 'application/json' });
  if (tracing) {
    if (failed) {
      const trace = testInfo.outputPath('trace.zip');
      await context.tracing.stop({ path: trace });
      await testInfo.attach('trace', { path: trace, contentType: 'application/zip' });
    } else {
      await context.tracing.stop();
    }
  }
}

export const test = base.extend({
  extension: async ({}, use, testInfo) => {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'mesh-mv3-profile-'));
    let denyProxy;
    let context;
    let tracing = false;
    let fixtureFailed = false;
    const pageErrors = [];
    const expectedBlocked = new Set();
    let network;
    try {
      denyProxy = await startDenyProxy();
      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium', headless: true,
        viewport: { width: 1440, height: 1100 },
        locale: 'ru-RU', timezoneId: 'Europe/Moscow',
        acceptDownloads: true,
        proxy: { server: denyProxy.url, bypass: '<-loopback>' },
        args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--disable-background-networking', '--disable-quic']
      });
      context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      tracing = true;
      const worker = context.serviceWorkers().find(w => w.url().endsWith('/src/background.js')) ??
        await context.waitForEvent('serviceworker', { predicate: w => w.url().endsWith('/src/background.js'), timeout: 10000 });
      expect(worker.url()).toMatch(/^chrome-extension:\/\/[^/]+\/src\/background\.js$/);
      // Resolve the actual ID before installing routes; no journal navigation yet.
      network = await installOfflineRoutes(context, { extensionId: new URL(worker.url()).hostname });
      const page = await context.newPage();
      const openJournal = async (scenario = 'all') => {
        await page.goto(`https://school.mos.ru/teacher/study-process/journal/grade/990001?case=${scenario}`);
        await expect(page.locator('#mesh-helper-panel')).toHaveCount(1);
        await expect(page.locator('#mh-min')).toHaveValue('5');
        await page.waitForFunction(() => window.__meshHelperMarksHookInstalled === true);
        await expect(page.locator('#mh-summary')).toHaveText('Ученики ниже нормы по оценкам: 5');
      };
      await use({ context, page, worker, network, openJournal, expectedBlocked });
      const unexpected = network.blocked.filter(r => !expectedBlocked.has(r.url));
      expect(unexpected, 'Unknown requests were blocked; no network passthrough').toEqual([]);
      expect(pageErrors, 'Uncaught page errors').toEqual([]);
    } catch (error) {
      fixtureFailed = true;
      throw error;
    } finally {
      try {
        if (context) {
          try {
            await saveEvidence({
              context, network, denyProxy, pageErrors, tracing, testInfo,
              failed: fixtureFailed || testInfo.status !== testInfo.expectedStatus
            });
          } finally {
            await context.close();
          }
        }
      } finally {
        try { if (denyProxy) await denyProxy.close(); }
        finally { await rm(profile, { recursive: true, force: true }); }
      }
    }
  }
});
export { expect };
