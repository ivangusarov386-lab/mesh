import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, fakeRow, plain } from '../helpers/vm.mjs';

function setup({ heading = null, body = 'Меню\nЖурнал Физическая культура 8-А 8а (тест) 26-27 г\nСписок учащихся', select = '', title = 'МЭШ' } = {}) {
  const row = fakeRow(101,[{values:['5']}]);
  const original = row.querySelector;
  row.querySelector = selector => selector === 'span[title]' ? {getAttribute:()=> 'Вымышленный ученик'} : original(selector);
  const downloads = [];
  const service = loadModule('marks-api-bridge.js').window.__MESH_HELPER_LESSON_COMMENTS__;
  const snapshot = {status:'partial',byStudent:{101:[{text:'Без спортивной формы',count:3}]}};
  const captures = [];
  const a = loadModule('hybrid-counter.js',{
    expose:['journalMeta','downloadCsv'],
    window:{__MESH_HELPER_LESSON_COMMENTS__:{...service,capture:async(subject)=>{captures.push(subject);return service.isPhysicalEducation(subject)?snapshot:null;}}},
    document:{title,body:{innerText:body,appendChild(){}},querySelector:selector=>selector==='h1' && heading?{innerText:heading}:selector.includes('aria-haspopup')?{innerText:select}:null,querySelectorAll:selector=>selector==='tr'?[row]:[],createElement:()=>({click(){},remove(){}})},
    globals:{URL:class extends URL{static createObjectURL(blob){downloads.push(blob);return 'blob:synthetic';}static revokeObjectURL(){}}}
  });
  return {...a,downloads,captures};
}

test('journal visible heading without h1 or useful dropdown enables PE CSV comments',async()=>{
  const a=setup();
  assert.deepEqual(plain(a.exposed.journalMeta()),{className:'8-А',subject:'Физическая культура'});
  await a.exposed.downloadCsv('all');
  const csv=await a.downloads[0].text();
  assert.deepEqual(a.captures,['Физическая культура']);
  assert.match(csv,/"Предмет"/);
  assert.match(csv,/"Комментарии"/);
  assert.match(csv,/"Физическая культура"/);
  assert.match(csv,/3 комментария по доступным данным \(3 — Без спортивной формы\)/);
});
test('unrelated dropdown does not override a unique visible journal heading',()=>{
  assert.equal(setup({select:'2026 — 2027'}).exposed.journalMeta().subject,'Физическая культура');
});
test('other subject h1 takes precedence; mentioning PE does not enable comments',async()=>{
  const a=setup({heading:'Журнал Математика 8-А'});
  await a.exposed.downloadCsv('all');
  assert.equal(a.exposed.journalMeta().subject,'Математика');
  assert.doesNotMatch(await a.downloads[0].text(),/"Комментарии"/);
});
test('ambiguous visible headings or a PE mention without journal syntax do not enable PE',()=>{
  for(const body of ['Физическая культура — заметка','Журнал Физическая культура 8-А\nЖурнал Математика 8-А']){
    assert.equal(setup({body}).exposed.journalMeta().subject,'');
  }
});
