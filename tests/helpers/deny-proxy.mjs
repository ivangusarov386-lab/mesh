import http from 'node:http';

// Defense in depth for network not handled by Playwright routing. Never forwards.
// Package installation uses the environment's normal proxy, not this test proxy.
export async function startDenyProxy() {
  const denied = [];
  const server = http.createServer((request, response) => {
    denied.push({ method: request.method, url: request.url });
    response.writeHead(403); response.end('Offline synthetic test: network denied');
  });
  const sockets = new Set();
  server.on('connection', socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
  });
  server.on('connect', (request, socket) => {
    denied.push({ method: 'CONNECT', url: request.url });
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`, denied,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
