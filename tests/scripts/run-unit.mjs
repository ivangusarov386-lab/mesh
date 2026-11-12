import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { testsRoot } from '../helpers/paths.mjs';

await mkdir(path.join(testsRoot, 'artifacts/unit'), { recursive: true });
const files = (await readdir(path.join(testsRoot, 'unit'))).filter(f => f.endsWith('.test.mjs')).sort().map(f => `unit/${f}`);
if (!files.length) throw new Error('No unit tests discovered');
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
  cwd: testsRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
});
await writeFile(path.join(testsRoot, 'artifacts/unit/results.tap'), result.stdout ?? '');
await writeFile(path.join(testsRoot, 'artifacts/unit/stderr.log'), result.stderr ?? '');
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
