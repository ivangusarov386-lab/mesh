import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { root } from '../helpers/paths.mjs';

const baseline = JSON.parse(await readFile(new URL('../fixtures/runtime-baseline.json', import.meta.url)));
const actual = ['manifest.json', ...(await readdir(path.join(root, 'src'))).map(f => `src/${f}`)].sort();
assert.deepEqual(actual, Object.keys(baseline.files).sort(), 'Runtime file inventory changed');
for (const [file, expected] of Object.entries(baseline.files)) {
  const bytes = await readFile(path.join(root, file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `Protected file changed: ${file}`);
  if (file.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
}
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json')));
assert.equal(manifest.manifest_version, 3);
const resources = [manifest.background.service_worker, 'src/memo.html', 'src/memo.js', 'src/memo.css'];
for (const group of manifest.content_scripts) resources.push(...group.js ?? [], ...group.css ?? []);
for (const group of manifest.web_accessible_resources) resources.push(...group.resources);
for (const resource of resources) assert.ok(actual.includes(resource), `Missing runtime resource: ${resource}`);
console.log(`PASS: ${actual.length} runtime files unchanged; JS syntax, manifest and resources valid`);
