import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertOfflineNetwork } from '../helpers/network-audit.mjs';

test('fallback-only unknown request fails even when Playwright recorded no blocked requests', () => {
  const network = { blocked: [] };
  const proxy = { denied: [{ method: 'CONNECT', url: 'unmodeled.invalid:443' }] };
  assert.throws(() => assertOfflineNetwork(network, proxy), /fallback proxy/i);
});

test('HTTP rejected only by fallback fails; an expected router URL cannot exempt it', () => {
  const url = 'https://school.mos.ru/not-a-fixture';
  assert.throws(() => assertOfflineNetwork(
    { blocked: [] }, { denied: [{ method: 'GET', url }] }, new Set([url])
  ), /fallback proxy/i);
});

test('school CONNECTs are never silently classified as service traffic', () => {
  assert.throws(() => assertOfflineNetwork(
    { blocked: [] }, { denied: [{ method: 'CONNECT', url: 'school.mos.ru:443' }] }
  ), /school\.mos\.ru/);
});

test('only the exact confirmed browser-service CONNECT is nonfatal', () => {
  assert.doesNotThrow(() => assertOfflineNetwork(
    { blocked: [] }, { denied: [{ method: 'CONNECT', url: 'content-autofill.googleapis.com:443' }] }
  ));
  for (const request of [
    { method: 'GET', url: 'https://content-autofill.googleapis.com/' },
    { method: 'CONNECT', url: 'content-autofill.googleapis.com:80' },
    { method: 'CONNECT', url: 'content-autofill.googleapis.com.evil.invalid:443' },
    { method: 'CONNECT', url: 'other.googleapis.com:443' }
  ]) assert.throws(() => assertOfflineNetwork({ blocked: [] }, { denied: [request] }), /fallback proxy/i);
});

test('router HTTP/WS unknown requests remain fatal, including the service host', () => {
  for (const request of [
    { method: 'GET', url: 'https://content-autofill.googleapis.com/' },
    { method: 'WebSocket', url: 'wss://school.mos.ru/not-a-fixture' }
  ]) assert.throws(() => assertOfflineNetwork({ blocked: [request] }, { denied: [] }), /Unexpected requests/);
});

test('known intentional router block stays isolated from late proxy violations', () => {
  const request = { method: 'GET', url: 'https://school.mos.ru/mesh-fixture/unknown' };
  const network = { blocked: [request] };
  const proxy = { denied: [] };
  const expected = new Set([request.url]);
  assert.doesNotThrow(() => assertOfflineNetwork(network, proxy, expected));
  proxy.denied.push({ method: 'CONNECT', url: 'late.invalid:443' });
  assert.throws(() => assertOfflineNetwork(network, proxy, expected), /late\.invalid/);
});
