(() => {
  const WRONG = 'mesh-helper-wrong-final-cell';
  const YELLOW = 'rgba(250, 204, 21, 0.42)';

  let enabled = false;
  let timer = null;
  let observer = null;

  const txt = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();

  function isEnabled() {
    const t = document.querySelector('#mh-check-finals');
    return t ? t.checked === true : enabled === true;
  }

  function rowCells(row) {
    return [...(row?.children || [])].filter((x) => ['TD','TH'].includes(x.tagName));
  }

  function inner(cell) {
    return cell?.querySelector?.('[data-test-component^="markCell-"]') || null;
  }

  function attr(cell) {
    return inner(cell)?.getAttribute?.('data-test-component') || '';
  }

  function grade(cell) {
    const m = txt(cell).match(/[1-5]/);
    return m ? Number(m[0]) : null;
  }

  function periodRule(avg) {
    if (avg >= 4.6) return 5;
    if (avg >= 3.6) return 4;
    if (avg >= 2.6) return 3;
    return 2;
  }

  function summaryRule(avg) {
    if (avg >= 4.5) return 5;
    if (avg >= 3.5) return 4;
    if (avg >= 2.5) return 3;
    return 2;
  }

  function paint(cell, bad) {
    const mark = inner(cell);
    [cell, mark].filter(Boolean).forEach((el) => {
      el.classList.toggle(WRONG, !!bad);
      if (bad) el.style.setProperty('background-color', YELLOW, 'important');
      else {
        el.classList.remove(WRONG);
        el.style.removeProperty('background-color');
      }
    });
  }

  function lessonGrades(cell) {
    const a = attr(cell);
    if (!a || a.includes('average') || a.includes('finalResult') || a.includes('yearResult') || a.includes('yearAttestation') || a.includes('intermediateAttestation')) return [];

    const vals = [];
    [...(inner(cell)?.querySelectorAll('span') || [])].map(txt).forEach((v) => {
      if (/^[1-5]$/.test(v)) vals.push(Number(v));
    });

    return vals;
  }

  function checkPeriodRow(row) {
    const cells = rowCells(row);

    cells.forEach((cell, index) => {
      const a = attr(cell);
      if (!a.includes('finalResult') || a.includes('yearResult')) return;

      const current = grade(cell);
      if (current === null) return paint(cell, false);

      const grades = [];

      for (let i = index - 1; i >= 0; i--) {
        const vals = lessonGrades(cells[i]);
        if (vals.length) grades.unshift(...vals);
      }

      if (!grades.length) return paint(cell, false);

      const avg = grades.reduce((s, v) => s + v, 0) / grades.length;
      paint(cell, periodRule(avg) !== current);
    });
  }

  function checkSummaryRow(row) {
    const cells = rowCells(row);

    const finals = cells
      .filter((c) => attr(c).includes('finalResult'))
      .map(grade)
      .filter((v) => v !== null)
      .slice(0, 3);

    const paCell = cells.find((c) => attr(c).includes('intermediateAttestation'));
    const yearCell = cells.find((c) => attr(c).includes('yearResult'));
    const examCell = cells.find((c) => attr(c).includes('yearExam'));
    const attCell = cells.find((c) => attr(c).includes('yearAttestation'));

    const pa = grade(paCell);
    const year = grade(yearCell);

    if (yearCell && finals.length === 3 && pa !== null && year !== null) {
      const expectedYear = summaryRule((finals[0] + finals[1] + finals[2] + pa) / 4);
      paint(yearCell, expectedYear !== year);
    }

    const exam = grade(examCell);
    const att = grade(attCell);

    if (attCell && year !== null && att !== null) {
      const expectedAtt = exam === null ? year : summaryRule((year + exam) / 2);
      paint(attCell, expectedAtt !== att);
    }
  }

  function run() {
    if (!isEnabled()) return;

    document.querySelectorAll('tr').forEach((row) => {
      checkPeriodRow(row);
      checkSummaryRow(row);
    });
  }

  function schedule(delay = 700) {
    if (!isEnabled()) return;
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  function enableMode() {
    if (observer) return;

    observer = new MutationObserver(() => schedule(1000));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    schedule(200);
  }

  function disableMode() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    clearTimeout(timer);

    document.querySelectorAll('.' + WRONG).forEach((el) => {
      el.classList.remove(WRONG);
      el.style.removeProperty('background-color');
    });
  }

  function sync() {
    if (isEnabled()) enableMode();
    else disableMode();
  }

  window.addEventListener('mesh-helper-finals-toggle', (e) => {
    enabled = e.detail?.enabled === true;
    sync();
  });

  document.addEventListener('change', (e) => {
    if (e.target?.id === 'mh-check-finals') {
      enabled = e.target.checked === true;
      sync();
    }
  }, true);

  try {
    chrome.storage.sync.get(['checkFinals'], (data) => {
      enabled = data.checkFinals === true;
      sync();
    });
  } catch (e) {
    sync();
  }
})();