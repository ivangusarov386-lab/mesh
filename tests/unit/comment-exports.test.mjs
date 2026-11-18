import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadModule, plain } from '../helpers/vm.mjs';

const pe = 'Физическая культура';
const snapshot = {status:'partial',byStudent:{101:[{text:'Без спортивной формы',count:3},{text:'освобожден',count:2}]}};
const comments = loadModule('marks-api-bridge.js').window.__MESH_HELPER_LESSON_COMMENTS__;
const students = [{id:101,name:'Вымышленный А'},{id:102,name:'Вымышленный Б'}];
function journal(subject) { return {subject,text:subject,classLabel:'8-А',students,marks:[{id:1,student_profile_id:101,name:'5'}],lessonComments:snapshot,finalGrades:[],heldLessons:1}; }
function harness(file, values) {
  const workbook = loadModule('class-workbook.js').window.__MESH_HELPER_CLASS_WORKBOOK__;
  const outputs = [];
  const downloads = [];
  const wrapped = {...workbook,downloadWorkbook: (name,sheets,options) => outputs.push({name,sheets,blob:workbook.buildWorkbookBlob(sheets,options)})};
  const a = loadModule(file, {
    window:{__MESH_HELPER_LESSON_COMMENTS__:comments,__MESH_HELPER_CLASS_WORKBOOK__:wrapped},
    chrome:{ storage:{local:{get:(key,cb)=>cb({[key]:values[key]}),set:(_value,cb)=>cb()},sync:{get:(_keys,cb)=>cb({})}} },
    document:{body:{appendChild(){}},createElement:()=>({dataset:{},click(){},remove(){}})},
    globals:{URL:class extends URL { static createObjectURL(blob){downloads.push(blob);return 'blob:synthetic';} static revokeObjectURL(){} }}
  });
  return {...a,outputs,downloads};
}
async function xmls(blob) {
  const temp = await mkdtemp(path.join(os.tmpdir(),'mesh-comments-'));
  try {
    const file = path.join(temp,'synthetic.xlsx');
    await writeFile(file,Buffer.from(await blob.arrayBuffer()));
    return JSON.parse(execFileSync('python3',['-c',`
import sys,zipfile,json,xml.etree.ElementTree as E
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 result={}
 for n in z.namelist():
  if n.endswith(('.xml','.rels')): E.fromstring(z.read(n))
  if n.startswith('xl/worksheets/sheet'): result[n]=z.read(n).decode()
 print(json.dumps(result))
`,file],{encoding:'utf8'}));
  } finally { await rm(temp,{recursive:true,force:true}); }
}

test('actual teacher CSV and XLSX preserve old grades, append PE comments and type text safely', async () => {
  const batch = {status:'done',queue:[{id:'1',text:pe},{id:'2',text:'Математика'}],studentProfiles:Object.fromEntries(students.map(s=>[s.id,s])),results:{1:journal(pe),2:journal('Математика')}};
  const a = harness('class-auto-loader.js',{meshHelperClassBatch:batch});
  const api = a.window.__MESH_HELPER_CLASS_AUTO_LOADER__;
  await api.exportCsv();
  const csv = await a.downloads[0].text();
  assert.match(csv,/"ФИО";"Физическая культура";"Математика";"Комментарии"/);
  assert.match(csv,/3 — Без спортивной формы; 2 — освобожден/);
  assert.match(csv,/Не найдены в доступных данных/);
  await api.exportWorkbook();
  assert.equal(a.outputs.length,1);
  const sheets = a.outputs[0].sheets;
  const peSheet = sheets.find(s=>s.name===pe);
  const mathSheet = sheets.find(s=>s.name==='Математика');
  assert.equal(peSheet.rows[0].values.length,mathSheet.rows[0].values.length+1);
  assert.deepEqual(plain(peSheet.rows[1].values.slice(0,-1)),plain(mathSheet.rows[1].values));
  const xml = await xmls(a.outputs[0].blob);
  const peXml = Object.values(xml).find(x=>x.includes('Без спортивной формы'));
  assert.match(peXml,/<c r="M2"[^>]*t="inlineStr"/);
  assert.match(Object.values(xml).join(''),/COUNTIF/);
  assert.match(Object.values(xml).join(''),/Неоднозначное имя/);
  await api.exportAllClassesWorkbook();
  const classXml = await xmls(a.outputs[1].blob);
  assert.match(Object.values(classXml).join(''),/Без спортивной формы/);
  await api.exportPerStudentZip();
  // A real ZIP containing real XLSX files, not an adapter-generated workbook.
  const temp = await mkdtemp(path.join(os.tmpdir(),'mesh-comments-zip-'));
  try {
    const file = path.join(temp,'pupils.zip');
    await writeFile(file,Buffer.from(await a.downloads[1].arrayBuffer()));
    execFileSync('python3',['-c',`
import sys,zipfile,io,xml.etree.ElementTree as E
with zipfile.ZipFile(sys.argv[1]) as outer:
 assert outer.testzip() is None and len(outer.namelist())==2
 for n in outer.namelist():
  with zipfile.ZipFile(io.BytesIO(outer.read(n))) as z:
   assert z.testzip() is None
   for p in z.namelist():
    if p.endswith(('.xml','.rels')): E.fromstring(z.read(p))
   sheet=z.read('xl/worksheets/sheet1.xml').decode()
   assert 'Комментарии' in sheet
`,file]);
  } finally { await rm(temp,{recursive:true,force:true}); }
});

test('actual admin full/finals XLSX add comments only to PE subject sheets', async () => {
  const results = {1:journal(pe),2:journal('Математика')};
  const a = harness('admin-collector.js',{meshHelperAdminLastResults:{results},meshHelperAdminFinalsLastResults:{results}});
  const api = a.window.__MESH_HELPER_ADMIN_COLLECTOR__;
  await api.downloadFinalGradesWorkbook();
  await api.downloadAdminParallelWorkbook();
  assert.equal(a.outputs.length,2);
  for (const output of a.outputs) {
    const peRows = output.sheets.find(s=>s.name===pe).rows;
    const mathRows = output.sheets.find(s=>s.name==='Математика').rows;
    assert.equal(peRows.at(-1).values.length,mathRows.at(-1).values.length+1);
    assert.deepEqual(plain(peRows.at(-1).values.slice(0,-1)),plain(mathRows.at(-1).values));
    assert.match(Object.values(await xmls(output.blob)).join(''),/Без спортивной формы/);
  }
});
