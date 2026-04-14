import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const host = '127.0.0.1';
const port = 4173;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, 'Missing request URL');
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method Not Allowed');
    return;
  }

  const requestUrl = new URL(request.url, `http://${host}:${port}`);
  const relativePath =
    requestUrl.pathname === '/'
      ? 'index.html'
      : requestUrl.pathname.replace(/^\/+/, '');
  const filePath = path.resolve(rootDir, decodeURIComponent(relativePath));

  if (!filePath.startsWith(`${rootDir}${path.sep}`) && filePath !== rootDir) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    response.end(body);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
    if (code === 'ENOENT' || code === 'EISDIR') {
      sendText(response, 404, 'Not Found');
      return;
    }
    sendText(response, 500, 'Internal Server Error');
  }
});

server.listen(port, host, () => {
  console.log(`Static server listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
