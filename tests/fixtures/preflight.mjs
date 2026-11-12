import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { testsRoot } from '../helpers/paths.mjs';

export default async function preflight() {
  const policies = [];
  for (const directory of [
    '/etc/chromium/policies/managed',
    '/etc/opt/chrome/policies/managed'
  ]) {
    let files;
    try {
      files = await readdir(directory);
    } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const name of files.filter(name => name.endsWith('.json')).sort()) {
      const file = path.join(directory, name);
      const policy = JSON.parse(await readFile(file, 'utf8'));
      policies.push({ file, blocklist: policy.ExtensionInstallBlocklist ?? [], wildcardMode: policy.ExtensionSettings?.['*']?.installation_mode ?? null });
    }
  }
  const blocked = policies.some(p => p.blocklist.includes('*') || p.wildcardMode === 'blocked');
  await mkdir(path.join(testsRoot, 'artifacts/e2e'), { recursive: true });
  await writeFile(path.join(testsRoot, 'artifacts/e2e/capability.json'), JSON.stringify({
    timestamp: new Date().toISOString(), node: process.version,
    status: blocked ? 'BLOCKED' : 'POLICY_PREFLIGHT_PASSED_NOT_YET_BROWSER_VERIFIED', policies
  }, null, 2));
  if (blocked) throw new Error('[BLOCKED] Managed browser policy forbids extension installation. No browser launched; run MV3 tests in an authorized CI environment. Policy is not modified or bypassed.');
}
