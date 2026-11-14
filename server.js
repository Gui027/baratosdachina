const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const createPayment = require('./api/create-payment');
const paymentStatus = require('./api/payment-status');

const ROOT = __dirname;
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 32 * 1024;
const PUBLIC_FILES = new Set(['/index.html', '/styles.css', '/script.js', '/termos.html', '/privacidade.html', '/favicon.ico']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (_) { reject(Object.assign(new Error('INVALID_JSON'), { status: 400 })); }
    });
    request.on('error', reject);
  });
}

function serveFile(response, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const isAsset = requested.startsWith('/assets/') && !requested.includes('..');
  if (!PUBLIC_FILES.has(requested) && !isAsset) return false;
  const filePath = path.join(ROOT, requested.replace(/^\//, ''));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const extension = path.extname(filePath).toLowerCase();
  const cache = isAsset ? 'public, max-age=604800' : 'no-cache';
  response.writeHead(200, { 'Content-Type': MIME[extension] || 'application/octet-stream', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(filePath).pipe(response);
  return true;
}

const server = http.createServer(async (request, response) => {
  response.status = function status(code) { this.statusCode = code; return this; };
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    request.query = Object.fromEntries(url.searchParams);
    if (url.pathname === '/api/create-payment') {
      if (request.method === 'POST') request.body = await readJson(request);
      return createPayment(request, response);
    }
    if (url.pathname === '/api/payment-status') return paymentStatus(request, response);
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (serveFile(response, decodeURIComponent(url.pathname))) return;
    }
    json(response, 404, { message: 'Não encontrado.' });
  } catch (error) {
    if (!response.headersSent) json(response, error.status || 500, { message: error.status === 400 ? 'JSON inválido.' : error.status === 413 ? 'Requisição muito grande.' : 'Erro interno.' });
  }
});

server.listen(PORT, HOST, () => console.log(`Fly Trap ouvindo em http://${HOST}:${PORT}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
