(() => {
  const WRONG = 'mesh-helper-wrong-final-cell';
  const YELLOW = 'rgba(250, 204, 21, 0.42)';
  let enabled = false;
  let timer = null;
  let observer = null;

  const txt = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
  const cells = (r) => [...(r?.children || [])].filter((x) => ['TD','TH'].includes(x.tagName));
  const mark = (c) => c?.querySelector?.('[data-test-component^="markCell-"]') || null;
  const attr = (c) => mark(c)?.getAttribute?.('data-test-component') || '';
  const num = (c) => {
    const m = txt(c).match(/[1-5]/);
    return m ? Number(m[0]) : null;
  };

  function isEnabled() {
    const input = document.querySelector('#mh-check-correct-finals');
    return input ? input.checked === true : enabled === true;
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

  function paint(c, bad) {
    const m = mark(c);
    [c, m].filter(Boolean).forEach((e) => {
      e.classList.toggle(WRONG, !!bad);
      if (bad) e.style.setProperty('background-color', YELLOW, 'important');
      else {
        e.classList.remove(WRONG);
        e.style.removeProperty('background-color');
      }
    });
  }

  function hasStack(c) {
    const m = mark(c);
    return !!m && (!!m.querySelector('svg') || /stack|misc-stacked|filled-misc-stacked/i.test(m.innerHTML || ''));
  }

  function gradesFromCell(c) {
    const a = attr(c);
    if (!a) return [];
    if (a.includes('average') || a.includes('finalResult') || a.includes('yearResult') || a.includes('yearExam') || a.includes('yearAttestation') || a.includes('intermediateAttestation')) return [];

    const m = mark(c);
    if (!m) return [];

    let vals = [...m.querySelectorAll('span')]
      .map(txt)
      .filter((v) => /^[1-5]$/.test(v))
      .map(Number);

    if (!vals.length) {
      vals = txt(m).split(/\s+/).filter((v) => /^[1-5]$/.test(v)).map(Number);
    }

    if (vals.length === 1 && hasStack(c)) vals.push(vals[0]);
    return vals;
  }

  function checkPeriods(row) {
    const arr = cells(row);
    arr.forEach((c, i) => {
      const a = attr(c);
      if (!a.includes('finalResult') || a.includes('yearResult')) return;

      const current = num(c);
      if (current === null) return paint(c, false);

      const vals = [];
      for (let x = i - 1; x >= 0; x--) {
        const aa = attr(arr[x]);
        if (aa.includes('finalResult') || aa.includes('yearResult') || aa.includes('intermediateAttestation')) break;
        if (aa.includes('average')) continue;
        const got = gradesFromCell(arr[x]);
        if (got.length) vals.unshift(...got);
      }

      if (!vals.length) return paint(c, false);
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      paint(c, periodRule(avg) !== current);
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

  function clearYellow() {
    document.querySelectorAll('.' + WRONG).forEach((e) => {
      e.classList.remove(WRONG);
      e.style.removeProperty('background-color');
    });
  }

  function run() {
    if (!isEnabled()) return clearYellow();
    document.querySelectorAll('tr').forEach((r) => {
      checkPeriods(r);
      checkSummary(r);
    });
  }

  function schedule(delay = 400) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  function wake() {
    if (!isEnabled()) return clearYellow();
    if (!observer) {
      observer = new MutationObserver(() => schedule(900));
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    schedule(100);
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

  document.addEventListener('change', (e) => {
    if (e.target?.id === 'mh-check-correct-finals') {
      enabled = e.target.checked === true;
      sync();
    }
  }, true);

  document.addEventListener('pointerover', (e) => {
    if (!isEnabled()) return;
    const r = e.target?.closest?.('tr');
    if (r) setTimeout(() => { checkPeriods(r); checkSummary(r); }, 80);
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