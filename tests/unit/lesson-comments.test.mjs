import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, plain } from '../helpers/vm.mjs';

function source(records, { error = null, cells = ['101_200001_1','102_200001_1'], stores } = {}) {
  const store = { getState: () => ({ JR_GradeJournal: { journal: { lessonComments: { apiData: records, apiStatus: 'observed-value', apiError: error } } } }) };
  const nodes = cells.map((key, i) => ({ getAttribute: () => `markCell-${key}`, __reactFiber$fixture: { memoizedProps: { value: { store: stores?.[i] || store } }, return: null } }));
  return loadModule('marks-api-hook.js', { expose: ['readLessonComments'], document: { querySelectorAll: () => nodes } }).exposed;
}
const records = [1,2,3,4,5].map((id) => ({ id, student_id:101, schedule_lesson_id:200001, comment:id<4?'Без спортивной формы':'освобожден' }));

test('Redux comments aggregate every record by current DOM student/lesson only', () => {
  const api = source([...records, { student_id:102, schedule_lesson_id:200001, comment:'Другой ученик' }, { student_id:101, schedule_lesson_id:999999, comment:'Не этот урок' }]);
  const a = plain(api.readLessonComments());
  assert.equal(a.status,'partial');
  assert.deepEqual(a.byStudent['101'], [{ text:'Без спортивной формы', count:3 },{ text:'освобожден', count:2 }]);
  assert.deepEqual(plain(api.readLessonComments()),a, 'repeated capture replaces, never appends');
});
test('missing Redux, error and ambiguous control forms fail closed', () => {
  assert.equal(source(records,{error:'failed'}).readLessonComments().status,'unavailable');
  assert.equal(source(records,{cells:['101_200001_1','101_200001_2']}).readLessonComments().status,'unavailable');
  assert.equal(source(records,{stores:[{getState:()=>({})},{getState:()=>({})}]}).readLessonComments().status,'unavailable');
});
test('comments formatting is PE-only, partial and never turns missing into zero', () => {
  const service = loadModule('marks-api-bridge.js').window.__MESH_HELPER_LESSON_COMMENTS__;
  assert.equal(service.isPhysicalEducation(' Физическая  культура '),true);
  assert.equal(service.isPhysicalEducation('Адаптивная физическая культура'),false);
  assert.equal(service.format({status:'partial',byStudent:{101:[{text:'Без спортивной формы',count:3},{text:'освобожден',count:2}]}},101),'5 комментариев по доступным данным (3 — Без спортивной формы; 2 — освобожден)');
  assert.equal(service.format({status:'partial',byStudent:{}},101),'Не найдены в доступных данных');
  assert.equal(service.format(null,101),'Данные недоступны');
});

test('bridge rejects foreign origin, malformed payload and navigation, without API/debug publication', async () => {
  const sent = [];
  const a = loadModule('marks-api-bridge.js', { window:{postMessage:msg=>sent.push(msg)}, document:{querySelectorAll:()=>[]} });
  const service = a.window.__MESH_HELPER_LESSON_COMMENTS__;
  assert.equal(await service.capture('Математика'),null);
  assert.equal(sent.length,0);
  const promise = service.capture('Физическая культура');
  const response = {source:'mesh-helper-marks-hook',type:'lesson-comments-response',version:1,requestId:sent[0].requestId,snapshot:{status:'partial',byStudent:{101:[{text:'x',count:1}]}}};
  a.listeners.get('message')({source:a.window,origin:'https://foreign.invalid',data:response});
  a.listeners.get('message')({source:a.window,origin:'https://school.mos.ru',data:response});
  assert.equal((await promise).status,'partial');
  assert.equal(a.window.__MESH_HELPER_API__,undefined);
  assert.equal(a.events.length,0);
  const second = service.capture('Физическая культура');
  response.requestId = sent[1].requestId;
  response.snapshot.byStudent[101][0].count = -1;
  a.listeners.get('message')({source:a.window,origin:'https://school.mos.ru',data:response});
  assert.equal((await second).status,'unavailable');
});

test('22 loaded records and 24 DOM cells remain 22 partial comments, never 24 inferred', () => {
  const cells = Array.from({length:24},(_,i)=>`${101+i}_200001_1`);
  const records = Array.from({length:22},(_,i)=>({student_id:101+i,schedule_lesson_id:200001,comment:'Вымышленный комментарий'}));
  const snapshot = source(records,{cells}).readLessonComments();
  assert.equal(snapshot.status,'partial');
  assert.equal(Object.keys(snapshot.byStudent).length,22);
  assert.equal(snapshot.byStudent['124'],undefined);
});
test('MAIN request is PE-only and same-origin; missing providers never fetch or dispatch', () => {
  const messages = [];
  const a = loadModule('marks-api-hook.js',{window:{postMessage:msg=>messages.push(msg)}});
  const data = {source:'mesh-helper-marks-hook',type:'lesson-comments-request',version:1,requestId:'synthetic',subject:'физическая культура'};
  const send = (origin,overrides={})=>a.listeners.get('message')({source:a.window,origin,data:{...data,...overrides}});
  send('https://foreign.invalid');
  send('https://school.mos.ru',{subject:'математика'});
  assert.equal(messages.length,0);
  send('https://school.mos.ru');
  assert.deepEqual(plain(messages[0].snapshot),{status:'unavailable',reason:'C01'});
  assert.equal(a.window.__MESH_HELPER_MARKS_DEBUG__,undefined);
});
test('route changes invalidate in-flight comments replies', async () => {
  const sent = [];
  const nodes = [];
  const a = loadModule('marks-api-bridge.js',{window:{postMessage:msg=>sent.push(msg)},document:{querySelectorAll:()=>nodes}});
  const pending = a.window.__MESH_HELPER_LESSON_COMMENTS__.capture('Физическая культура');
  nodes.push({getAttribute:()=> 'markCell-999_999_1'});
  a.listeners.get('message')({source:a.window,origin:'https://school.mos.ru',data:{source:'mesh-helper-marks-hook',type:'lesson-comments-response',version:1,requestId:sent[0].requestId,snapshot:{status:'partial',byStudent:{}}}});
  assert.equal((await pending).status,'unavailable');
});
test('long grouped text stays within an Excel cell limit and marks truncation', () => {
  const service = loadModule('marks-api-bridge.js').window.__MESH_HELPER_LESSON_COMMENTS__;
  const text = service.format({status:'partial',byStudent:{101:Array.from({length:4},(_,i)=>({text:String(i)+'x'.repeat(9999),count:1}))}},101);
  assert.ok(text.length<=32767);
  assert.match(text,/текст сокращён/);
});
test('reused Redux array after a context change is rejected until replaced', () => {
  let apiData = records;
  const store = { getState:()=>({JR_GradeJournal:{journal:{lessonComments:{apiData,apiStatus:'synthetic',apiError:null}}}}) };
  let key = 'markCell-101_200001_1';
  const cell = {getAttribute:()=>key,__reactFiber$test:{memoizedProps:{value:{store}},return:null}};
  const a = loadModule('marks-api-hook.js',{expose:['readLessonComments'],document:{querySelectorAll:()=>[cell]}});
  assert.equal(a.exposed.readLessonComments().status,'partial');
  key = 'markCell-102_200001_1';
  assert.equal(a.exposed.readLessonComments().status,'unavailable');
  apiData = [];
  assert.equal(a.exposed.readLessonComments().status,'partial');
});

test('unavailable diagnostics identify the gate without exposing records or exceptions',()=>{
  assert.deepEqual(plain(source(records,{error:'private exception text'}).readLessonComments()),{status:'unavailable',reason:'C15'});
  assert.deepEqual(plain(source(records,{cells:['101_200001_1','101_200001_2']}).readLessonComments()),{status:'unavailable',reason:'C02'});
  const a = loadModule('marks-api-hook.js',{expose:['readLessonComments'],document:{querySelectorAll:()=>[{getAttribute:()=> 'markCell-101_200001_1'}]}});
  assert.deepEqual(plain(a.exposed.readLessonComments()),{status:'unavailable',reason:'C03'});
});
test('bridge accepts only allowlisted static failure codes and strips unrelated payload fields',async()=>{
  const sent=[];
  const a=loadModule('marks-api-bridge.js',{window:{postMessage:msg=>sent.push(msg)}});
  const service=a.window.__MESH_HELPER_LESSON_COMMENTS__;
  for(const reason of ['C03','untrusted private text']){
    const pending=service.capture('Физическая культура');
    a.listeners.get('message')({source:a.window,origin:'https://school.mos.ru',data:{source:'mesh-helper-marks-hook',type:'lesson-comments-response',version:1,requestId:sent.at(-1).requestId,snapshot:{status:'unavailable',reason,comment:'untrusted private text',byStudent:{101:[]}}}});
    const result=await pending;
    assert.deepEqual(plain(result),{status:'unavailable',reason:reason==='C03'?'C03':'C12'});
    assert.equal(service.format(result,101),`Данные недоступны [${result.reason}]`);
    assert.doesNotMatch(JSON.stringify(result),/private|101/);
  }
});
test('missing MAIN reply has its own timeout code',async()=>{
  let timeout;
  const a=loadModule('marks-api-bridge.js',{window:{postMessage(){}},globals:{setTimeout:cb=>{timeout=cb;return 1;}}});
  const pending=a.window.__MESH_HELPER_LESSON_COMMENTS__.capture('Физическая культура');
  timeout();
  assert.deepEqual(plain(await pending),{status:'unavailable',reason:'C11'});
});

test('an unsupported cell does not discard comments matched to supported cells',()=>{
  const api=source(records,{cells:['101_200001_1','999_200001_unknown']});
  const result=plain(api.readLessonComments());
  assert.equal(result.status,'partial');
  assert.deepEqual(result.byStudent['101'],[{text:'Без спортивной формы',count:3},{text:'освобожден',count:2}]);
});
test('unsupported variants cannot make a matching pair appear unambiguous',()=>{
  const api=source([...records,{student_id:102,schedule_lesson_id:200001,comment:'Вымышленный комментарий'}],{cells:['101_200001_1','101_200001_unknown','102_200001_1']});
  const result=plain(api.readLessonComments());
  assert.equal(result.status,'partial');
  assert.equal(result.byStudent['101'],undefined);
  assert.deepEqual(result.byStudent['102'],[{text:'Вымышленный комментарий',count:1}]);
});
test('no supported cells remains unavailable rather than an empty successful result',()=>{
  assert.deepEqual(plain(source(records,{cells:['101_200001_unknown']}).readLessonComments()),{status:'unavailable',reason:'C01'});
});

test('excluded cell changes still invalidate the context during Redux capture',()=>{
  let unsupported='markCell-999_200001_unknown';
  const store={getState(){unsupported='markCell-998_200001_unknown';return {JR_GradeJournal:{journal:{lessonComments:{apiData:records,apiStatus:'synthetic',apiError:null}}}};}};
  const cells=[{getAttribute:()=> 'markCell-101_200001_1',__reactFiber$test:{memoizedProps:{value:{store}},return:null}},{getAttribute:()=>unsupported}];
  const a=loadModule('marks-api-hook.js',{expose:['readLessonComments'],document:{querySelectorAll:()=>cells}});
  assert.deepEqual(plain(a.exposed.readLessonComments()),{status:'unavailable',reason:'C10'});
});
