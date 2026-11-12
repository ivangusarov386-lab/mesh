import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadModule } from '../helpers/vm.mjs';

test('real XLSX ZIP passes CRC and XML parsing, preserves text/formula types and palette', async () => {
  const api = loadModule('class-workbook.js').window.__MESH_HELPER_CLASS_WORKBOOK__;
  const sheet = api.worksheet('Тестовый/лист', [
    api.row(['Ученик', 'Значение']),
    api.row(['Тест <001> & "имя"', 4.5]),
    api.row(['=untrusted-text', api.formula('SUM(B2:B2)')], () => api.paletteStyleId(7, false))
  ]);
  const blob = api.buildWorkbookBlob([sheet], { paletteCount: 8 });
  const temp = await mkdtemp(path.join(os.tmpdir(), 'mesh-xlsx-'));
  try {
    const file = path.join(temp, 'synthetic.xlsx');
    await writeFile(file, Buffer.from(await blob.arrayBuffer()));
    const parsed = JSON.parse(execFileSync('python3', ['-c', `
import sys,zipfile,json,xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 for name in z.namelist():
  if name.endswith(('.xml','.rels')): ET.fromstring(z.read(name))
 ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
 sheet=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
 cells={c.attrib['r']:c for c in sheet.findall('.//s:c',ns)}
 def text(ref): return ''.join(cells[ref].itertext())
 styles=ET.fromstring(z.read('xl/styles.xml'))
 print(json.dumps({'a2':text('A2'),'b2':text('B2'),'a3':text('A3'),'a3type':cells['A3'].get('t'),'b3formula':cells['B3'].find('s:f',ns).text,'style':cells['A3'].get('s'),'styles':len(styles.find('s:cellXfs',ns))}))
`, file], { encoding: 'utf8' }));
    assert.equal(parsed.a2, 'Тест <001> & "имя"');
    assert.equal(parsed.b2, '4.5');
    assert.equal(parsed.a3, '=untrusted-text');
    assert.equal(parsed.a3type, 'inlineStr');
    assert.equal(parsed.b3formula, 'SUM(B2:B2)');
    assert.equal(Number(parsed.style), 19);
    assert.equal(parsed.styles, 21);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
