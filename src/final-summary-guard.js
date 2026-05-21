(() => {
  const WRONG = 'mesh-helper-wrong-final-cell';
  const YELLOW = 'rgba(250, 204, 21, 0.42)';
  const EPS = 0.000001;
  let enabled = false;
  let timer = null;
  let observer = null;

  const txt = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
  const cells = (r) => [...(r?.children || [])].filter((x) => ['TD','TH'].includes(x.tagName));
  const mark = (c) => c?.querySelector?.('[data-test-component^="markCell-"]') || null;
  const attr = (c) => {
    const direct = c?.getAttribute?.('data-test-component') || '';
    if (direct) return direct;
    const special = c?.querySelector?.('[data-test-component*="finalResult"], [data-test-component*="yearResult"], [data-test-component*="yearExam"], [data-test-component*="yearAttestation"], [data-test-component*="intermediateAttestation"], [data-test-component*="average"], [data-test-component^="markCell-"]');
    return special?.getAttribute?.('data-test-component') || mark(c)?.getAttribute?.('data-test-component') || '';
  };
  const num = (c) => {
    const m = txt(c).match(/[1-5]/);
    return m ? Number(m[0]) : null;
  };

  function isEnabled() {
    const input = document.querySelector('#mh-check-correct-finals');
    return input ? input.checked === true : enabled === true;
  }

  function marks() {
    const main = window.__MESH_HELPER_MARKS__;
    if (main && Array.isArray(main.marks) && main.marks.length) return main.marks;
    const debug = window.__MESH_HELPER_MARKS_DEBUG__;
    if (debug && Array.isArray(debug.marks) && debug.marks.length) return debug.marks;
    return [];
  }

  function studentId(row) {
    const cell = row?.querySelector?.('[data-test-component^="markCell-"]');
    const a = cell?.getAttribute?.('data-test-component') || '';
    const m = a.match(/^markCell-(\d+)_/);
    return m ? Number(m[1]) : null;
  }

  function lessonIdFromCell(c) {
    const a = attr(c);
    const m = a.match(/^markCell-\d+_(\d+)_/);
    const id = m ? Number(m[1]) : null;
    return id && id > 100000 ? id : null;
  }

  function isFuture(c) {
    const m = mark(c);
    return String(m?.getAttribute?.('data-disabled-by') || '').toUpperCase().includes('FUTURE');
  }

  function parseAvg(value) {
    const raw = String(value || '').replace(',', '.');
    const match = raw.match(/\b[1-5](?:\.\d{1,2})?\b/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round((n + EPS) * 100) / 100 : null;
  }

  function roundAvg(avg) {
    const n = Number(avg);
    return Number.isFinite(n) ? Math.round((n + EPS) * 100) / 100 : null;
  }

  function periodRule(avg) {
    const n = roundAvg(avg);
    if (n === null) return null;
    if (n + EPS >= 4.6) return 5;
    if (n + EPS >= 3.6) return 4;
    if (n + EPS >= 2.6) return 3;
    return 2;
  }

  function summaryRule(avg) {
    const n = roundAvg(avg);
    if (n === null) return null;
    if (n + EPS >= 4.5) return 5;
    if (n + EPS >= 3.5) return 4;
    if (n + EPS >= 2.5) return 3;
    return 2;
  }

  function paint(c, bad) {
    const m = mark(c);
    [c, m].filter(Boolean).forEach((e) => {
      if (bad) {
        e.classList.add(WRONG);
        e.style.setProperty('background-color', YELLOW, 'important');
      } else {
        e.classList.remove(WRONG);
        e.style.removeProperty('background-color');
      }
    });
  }

  function hasStack(c) {
    const m = mark(c);
    return !!m && (!!m.querySelector('svg') || /stack|misc-stacked|filled-misc-stacked/i.test(m.innerHTML || ''));
  }

  function domGradesFromCell(c) {
    const a = attr(c);
    if (!a) return [];
    if (a.includes('average') || a.includes('finalResult') || a.includes('yearResult') || a.includes('yearExam') || a.includes('yearAttestation') || a.includes('intermediateAttestation')) return [];
    const m = mark(c);
    if (!m) return [];
    let vals = [...m.querySelectorAll('span')].map(txt).filter((v) => /^[1-5]$/.test(v)).map(Number);
    if (!vals.length) vals = txt(m).split(/\s+/).filter((v) => /^[1-5]$/.test(v)).map(Number);
    if (vals.length === 1 && hasStack(c)) vals.push(vals[0]);
    return vals;
  }

  function visibleAverageBeforeFinal(arr, finalIndex) {
    for (let x = finalIndex - 1; x >= 0; x--) {
      const a = attr(arr[x]);
      if (a.includes('finalResult') || a.includes('yearResult') || a.includes('intermediateAttestation')) break;
      if (!a.includes('average')) continue;
      const avg = parseAvg(txt(arr[x]));
      if (avg !== null) return avg;
    }
    return null;
  }

  function periodLessonIds(arr, finalIndex) {
    const ids = new Set();
    for (let x = finalIndex - 1; x >= 0; x--) {
      const a = attr(arr[x]);
      if (a.includes('finalResult') || a.includes('yearResult') || a.includes('intermediateAttestation')) break;
      if (a.includes('average')) continue;
      if (isFuture(arr[x])) continue;
      const id = lessonIdFromCell(arr[x]);
      if (id) ids.add(id);
    }
    return ids;
  }

  function gradesFromMarks(student, lessonIds) {
    if (!student || !lessonIds?.size) return [];
    return marks()
      .filter((m) => Number(m?.student_profile_id) === student)
      .filter((m) => lessonIds.has(Number(m?.schedule_lesson_id)))
      .map((m) => String(m?.name || '').trim())
      .filter((v) => /^[1-5]$/.test(v))
      .map(Number);
  }

  function fallbackDomPeriodGrades(arr, finalIndex) {
    const vals = [];
    for (let x = finalIndex - 1; x >= 0; x--) {
      const a = attr(arr[x]);
      if (a.includes('finalResult') || a.includes('yearResult') || a.includes('intermediateAttestation')) break;
      if (a.includes('average')) continue;
      const got = domGradesFromCell(arr[x]);
      if (got.length) vals.unshift(...got);
    }
    return vals;
  }

  function expectedPeriodGrade(arr, finalIndex, sid) {
    const meshAverage = visibleAverageBeforeFinal(arr, finalIndex);
    if (meshAverage !== null) return periodRule(meshAverage);

    const ids = periodLessonIds(arr, finalIndex);
    let vals = gradesFromMarks(sid, ids);
    if (!vals.length) vals = fallbackDomPeriodGrades(arr, finalIndex);
    if (!vals.length) return null;

    const avg = roundAvg(vals.reduce((s, v) => s + v, 0) / vals.length);
    return periodRule(avg);
  }

  function checkPeriods(row) {
    const arr = cells(row);
    const sid = studentId(row);
    arr.forEach((c, i) => {
      const a = attr(c);
      if (!a.includes('finalResult') || a.includes('yearResult')) return;
      const current = num(c);
      if (current === null) return paint(c, false);
      const expected = expectedPeriodGrade(arr, i, sid);
      paint(c, expected !== null && expected !== current);
    });
  }

  function checkSummary(row) {
    const arr = cells(row);
    const hasSummary = arr.some((c) => {
      const a = attr(c);
      return a.includes('yearResult') || a.includes('yearAttestation') || a.includes('intermediateAttestation');
    });
    if (!hasSummary) return;
    const finals = arr.filter((c) => attr(c).includes('finalResult')).map(num).filter((v) => v !== null).slice(0, 3);
    const paCell = arr.find((c) => attr(c).includes('intermediateAttestation'));
    const yearCell = arr.find((c) => attr(c).includes('yearResult'));
    const examCell = arr.find((c) => attr(c).includes('yearExam'));
    const attCell = arr.find((c) => attr(c).includes('yearAttestation'));
    const pa = num(paCell);
    const year = num(yearCell);
    if (yearCell && finals.length === 3 && pa !== null && year !== null) {
      paint(yearCell, summaryRule((finals[0] + finals[1] + finals[2] + pa) / 4) !== year);
    }
    const exam = num(examCell);
    const att = num(attCell);
    if (attCell && year !== null && att !== null) {
      paint(attCell, (exam === null ? year : summaryRule((year + exam) / 2)) !== att);
    }
  }

  function checkRow(row) {
    checkPeriods(row);
    checkSummary(row);
  }

  function clearYellow() {
    document.querySelectorAll('.' + WRONG).forEach((e) => {
      e.classList.remove(WRONG);
      e.style.removeProperty('background-color');
    });
  }

  function run() {
    if (!isEnabled()) return clearYellow();
    document.querySelectorAll('tr').forEach(checkRow);
  }

  function schedule(delay = 120) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  function wake() {
    if (!isEnabled()) return clearYellow();
    if (!observer) {
      observer = new MutationObserver(() => schedule(180));
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    schedule(50);
  }

  function sleep() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(timer);
    clearYellow();
  }

  function sync() {
    if (isEnabled()) wake();
    else sleep();
  }

  window.addEventListener('mesh-helper-panel-ready', sync);
  window.addEventListener('mesh-helper-correct-finals-toggle', (e) => {
    enabled = e.detail?.enabled === true;
    sync();
  });
  window.addEventListener('mesh-helper-marks-updated', () => schedule(120));
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.source === 'mesh-helper-marks-hook' && e.data?.type === 'marks-response') schedule(120);
  });

  document.addEventListener('input', (e) => {
    if (!isEnabled()) return;
    if (e.target?.closest?.('tr')) schedule(120);
  }, true);

  document.addEventListener('change', (e) => {
    if (e.target?.id === 'mh-check-correct-finals') {
      enabled = e.target.checked === true;
      sync();
      return;
    }
    if (isEnabled() && e.target?.closest?.('tr')) schedule(120);
  }, true);

  document.addEventListener('pointerover', (e) => {
    if (!isEnabled()) return;
    const r = e.target?.closest?.('tr');
    if (r) setTimeout(() => checkRow(r), 50);
  }, true);

  try {
    chrome.storage.sync.get(['checkCorrectFinals'], (d) => {
      enabled = d.checkCorrectFinals === true;
      sync();
    });
  } catch (e) {
    sync();
  }

  setTimeout(sync, 1200);
})();