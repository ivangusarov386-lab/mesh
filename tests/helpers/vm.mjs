import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root } from './paths.mjs';

// Unit-only adapters. E2E never uses this helper or replaces Chrome APIs.
export function loadModule(file, { expose = [], window: windowOverrides = {}, document: documentOverrides = {} } = {}) {
  const listeners = new Map();
  const events = [];
  const document = {
    readyState: 'complete', hidden: false, documentElement: {},
    head: { appendChild() {} },
    createElement: () => ({ dataset: {} }),
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    ...documentOverrides
  };
  const window = {
    addEventListener: (name, cb) => listeners.set(name, cb),
    removeEventListener() {}, dispatchEvent: event => events.push(event),
    ...windowOverrides
  };
  const context = vm.createContext({
    window, document, console, Blob, TextEncoder, URL, URLSearchParams,
    location: { pathname: '/fixture-only', origin: 'https://school.mos.ru', search: '' },
    chrome: {
      runtime: { getURL: p => `chrome-extension://unit-only/${p}` },
      storage: { local: { get: (_key, cb) => cb({}) } }
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}
  });
  let code = readFileSync(path.join(root, 'src', file), 'utf8');
  if (expose.length) {
    const end = code.lastIndexOf('})();');
    assert.ok(end >= 0, `Missing IIFE end: ${file}`);
    code = code.slice(0, end) + `window.__TEST_EXPOSE__ = { ${expose.join(', ')} };\n` + code.slice(end);
  }
  vm.runInContext(code, context, { filename: file, timeout: 2000 });
  return { window, document, listeners, events, exposed: window.__TEST_EXPOSE__ };
}

export const plain = value => JSON.parse(JSON.stringify(value));

export function fakeRow(studentId, cells) {
  const children = cells.map(({ values = [], lessonId = 200001, stacked = false, future = false, average = false, final = false }) => {
    const spans = values.map(value => ({ innerText: String(value) }));
    const mark = {
      innerText: values.join(' '), innerHTML: stacked ? '<svg></svg>' : '',
      getAttribute: name => name === 'data-test-component' ? `markCell-${studentId}_${lessonId}_1` : name === 'data-disabled-by' && future ? 'FUTURE' : '',
      querySelector: selector => selector === 'svg' && stacked ? {} : null,
      querySelectorAll: selector => selector === 'span' ? spans : []
    };
    return {
      tagName: 'TD',
      querySelector: selector => {
        if (selector.includes('average')) return average ? {} : null;
        if (selector.includes('finalResult')) return final ? {} : null;
        return !average && !final && selector.includes('markCell-') ? mark : null;
      },
      mark
    };
  });
  return { children, querySelector: selector => selector.includes('markCell-') ? children.find(c => c.mark)?.mark : null };
}
