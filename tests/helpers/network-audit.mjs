import assert from 'node:assert/strict';

// Shared teardown contract: both interception layers must be audited.
export function assertOfflineNetwork(network, denyProxy, expectedBlocked = new Set()) {
  const blockedByRouter = network.blocked.filter(request => !expectedBlocked.has(request.url));
  // Confirmed Chromium 158 Autofill startup traffic in the supplied CI traces.
  // Only this exact rejected CONNECT is nonfatal; it is never forwarded.
  // HTTP, other ports/hosts and all router-recorded requests still fail.
  const blockedByFallbackProxy = denyProxy.denied.filter(request => !(
    request.method === 'CONNECT' && request.url === 'content-autofill.googleapis.com:443'
  ));
  assert.deepEqual(
    { blockedByRouter, blockedByFallbackProxy },
    { blockedByRouter: [], blockedByFallbackProxy: [] },
    'Unexpected requests were rejected by router or fallback proxy'
  );
}
