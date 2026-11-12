import { readFile } from 'node:fs/promises';
import { test, expect } from '../fixtures/extension.mjs';

const lowClass = /mesh-helper-low-grades-row/;
const missingClass = /mesh-helper-final-missing/;

test('capability: real MV3 worker, MAIN hook and one content-script panel', async ({ extension }) => {
  await extension.openJournal();
  expect(await extension.worker.evaluate(() => chrome.runtime.getManifest().manifest_version)).toBe(3);
  // The isolated store must not be exposed as a MAIN-world property.
  expect(await extension.page.evaluate(() => window.__MESH_HELPER_API__)).toBeUndefined();
});

test('offline guard blocks an unknown request in a newly opened tab', async ({ extension }, testInfo) => {
  await extension.openJournal();
  const url = 'https://school.mos.ru/mesh-fixture/unknown';
  extension.expectedBlocked.add(url);
  testInfo.annotations.push({ type: 'expected-network-block', description: url });
  const second = await extension.context.newPage();
  await second.goto('https://school.mos.ru/teacher/study-process/journal/grade/990001?case=all');
  expect(await second.evaluate(async url => {
    try { await fetch(url); return 'unexpected-success'; } catch { return 'blocked'; }
  }, url)).toBe('blocked');
  expect(extension.network.blocked).toContainEqual({ method: 'GET', url });
});

test('one, multiple and stacked marks keep current DOM counts and minimum boundary', async ({ extension }) => {
  await extension.openJournal();
  const { page } = extension;
  for (const [name, count] of [['001', 1], ['002', 2], ['003', 2], ['004', 1], ['007', 2]]) {
    const item = page.locator('#mh-list .mh-item').filter({ hasText: `Тестовый ученик ${name}` });
    await expect(item.locator('.mh-count')).toContainText(`Оценок за период: ${count}`);
  }
  await expect(page.locator('#student-101')).toHaveClass(lowClass);
  await expect(page.locator('#student-106')).not.toHaveClass(lowClass);
});

for (const transport of ['fetch', 'xhr']) {
  test(`${transport} response passes real hook/bridge and reveals hidden marks`, async ({ extension }) => {
    await extension.openJournal();
    const { page } = extension;
    const response = page.waitForResponse(r => r.url().endsWith('/marks?fixture=hidden'));
    await page.locator(`#fixture-${transport}`).click();
    expect((await response).status()).toBe(200);
    const item = page.locator('#mh-list .mh-item').filter({ hasText: 'Тестовый ученик 004' });
    await expect(item.locator('.mh-count')).toContainText('Оценок за период: 3');
    // Replaying the same IDs must not inflate the count.
    // Check the bridge's completed publish too: the old DOM alone could give
    // a false positive before the delayed UI scan.
    const published = page.waitForEvent('console', {
      predicate: message => message.text().startsWith('[МЭШ помощник][bridge] marks обновлены:')
    });
    await page.locator(`#fixture-${transport}`).click();
    expect((await published).text()).toContain('marks обновлены: 3 учеников: 1');
    await expect(item.locator('.mh-count')).toContainText('Оценок за период: 3');
  });
}

test('minimum changes existing threshold and persists through reload', async ({ extension }) => {
  await extension.openJournal();
  const { page, worker } = extension;
  await page.locator('#mh-min').fill('2');
  await expect(page.locator('#mh-summary')).toHaveText('Ученики ниже нормы по оценкам: 2');
  await expect(page.locator('#student-102')).not.toHaveClass(lowClass);
  await expect.poll(() => worker.evaluate(async () => (await chrome.storage.sync.get('minGrades')).minGrades)).toBe(2);
  await page.reload();
  await expect(page.locator('#mh-min')).toHaveValue('2');
  await expect(page.locator('#mh-summary')).toHaveText('Ученики ниже нормы по оценкам: 2');
});

test('missing final receives a blue marker only when control is enabled', async ({ extension }) => {
  await extension.openJournal();
  const { page } = extension;
  await page.locator('#mh-checks-toggle').click();
  await page.locator('#mh-check-finals').check();
  const final = page.locator('#student-105 [data-test-component="finalResult"]');
  await expect(final).toHaveClass(missingClass);
  await expect(page.locator('#student-106 [data-test-component="finalResult"]')).not.toHaveClass(missingClass);
  await page.locator('#mh-check-finals').uncheck();
  await expect(final).not.toHaveClass(missingClass);
});

test('highlight toggle removes existing low-grade styling', async ({ extension }) => {
  await extension.openJournal();
  const { page } = extension;
  await expect(page.locator('#student-101')).toHaveClass(lowClass);
  await page.locator('#mh-checks-toggle').click();
  await page.locator('#mh-highlight-low').uncheck();
  await expect(page.locator('#student-101')).not.toHaveClass(lowClass);
  await expect(page.locator('#student-101 .mesh-helper-low-grades-cell')).toHaveCount(0);
});

test('current CSV export downloads seven fictional pupils with observed counts', async ({ extension }, testInfo) => {
  await extension.openJournal();
  const { page } = extension;
  await page.locator('#mh-results-toggle').click();
  await page.locator('#mh-export-toggle').click();
  const waiting = page.waitForEvent('download');
  await page.locator('#mh-export-all').click();
  const download = await waiting;
  const file = testInfo.outputPath('synthetic.csv');
  await download.saveAs(file);
  const text = await readFile(file, 'utf8');
  expect(text).toContain('"Кол-во оценок"');
  expect(text).toContain('"Тестовый ученик 001";"1"');
  expect(text).toContain('"Тестовый ученик 002";"2";"4,5"');
  expect(text.split('\n')).toHaveLength(8);
  await testInfo.attach('synthetic-csv', { path: file, contentType: 'text/csv' });
});

test('monthly fixture documents the gap while current period minimum still works', async ({ extension }) => {
  await extension.openJournal('monthly');
  await expect(extension.page.locator('#fixture-future-feature')).toContainText('НЕ РЕАЛИЗОВАНЫ');
  await expect(extension.page.locator('#student-107')).toHaveClass(lowClass);
});

for (const mode of ['free', 'pro']) {
  test(`${mode} fixture is a label only and does not pretend to implement licensing`, async ({ extension }) => {
    await extension.openJournal(mode);
    await expect(extension.page.locator('#fixture-future-feature')).toContainText('только метка');
    expect(await extension.worker.evaluate(() => chrome.runtime.getManifest().permissions)).toEqual(['storage', 'unlimitedStorage']);
  });
}
