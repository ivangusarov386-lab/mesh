/* Page-side fixture only: no chrome API, no extension script injection. */
(() => {
  const scenario = new URL(location.href).searchParams.get('case') || 'all';
  document.getElementById('fixture-scenario').textContent = `Синтетический сценарий: ${scenario}`;
  const note = document.getElementById('fixture-future-feature');
  if (scenario === 'monthly') note.textContent = 'Месячные нормы НЕ РЕАЛИЗОВАНЫ. Строка 007 содержит октябрь/ноябрь; действующий минимум относится к видимому периоду.';
  if (scenario === 'free' || scenario === 'pro') note.textContent = `${scenario.toUpperCase()}: только метка будущего сценария. Free/PRO и ключи не реализованы; расширение не переключается.`;
  if (scenario.startsWith('pe')) {
    document.querySelector('h1').textContent = 'Журнал Физическая культура 8-А';
    if (scenario === 'pe') {
      const apiData = [1,2,3,4,5].map(id => ({ id, student_id:101, schedule_lesson_id:200001, comment:id<4?'Без спортивной формы':'освобожден' }));
      apiData.push({ id:6, student_id:102, schedule_lesson_id:200001, comment:'Другой ученик' });
      const store = { getState: () => ({ JR_GradeJournal: { journal: { lessonComments: { apiData, apiStatus:'synthetic', apiError:null } } } }) };
      document.querySelectorAll('[data-test-component^="markCell-"]').forEach(cell => {
        cell.__reactFiber$synthetic = { memoizedProps: { value: { store } }, return:null };
      });
    }
  }
  const status = document.getElementById('fixture-api-status');
  document.getElementById('fixture-fetch').addEventListener('click', async () => {
    try {
      const response = await fetch('/api/ej/core/teacher/v1/marks?fixture=hidden');
      await response.json();
      status.textContent = 'fetch выполнен';
    } catch { status.textContent = 'fetch отклонён'; }
  });
  document.getElementById('fixture-xhr').addEventListener('click', () => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/ej/core/teacher/v1/marks?fixture=hidden');
    xhr.addEventListener('load', () => { status.textContent = 'XHR выполнен'; });
    xhr.addEventListener('error', () => { status.textContent = 'XHR отклонён'; });
    xhr.send();
  });
})();
