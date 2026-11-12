/* Page-side fixture only: no chrome API, no extension script injection. */
(() => {
  const scenario = new URL(location.href).searchParams.get('case') || 'all';
  document.getElementById('fixture-scenario').textContent = `Синтетический сценарий: ${scenario}`;
  const note = document.getElementById('fixture-future-feature');
  if (scenario === 'monthly') note.textContent = 'Месячные нормы НЕ РЕАЛИЗОВАНЫ. Строка 007 содержит октябрь/ноябрь; действующий минимум относится к видимому периоду.';
  if (scenario === 'free' || scenario === 'pro') note.textContent = `${scenario.toUpperCase()}: только метка будущего сценария. Free/PRO и ключи не реализованы; расширение не переключается.`;
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
