// A small local web server: the JSON API under /api and the static interface from public/.
// It listens on this computer only by default, checks the Host and Origin headers, and
// only accepts JSON for changes, so another website cannot drive it from the browser.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ServiceError } from '../services/speclens-service.js';

const MAX_BODY_BYTES = 64 * 1024;

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
});

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
});

function hostnameOf(hostHeader) {
  if (typeof hostHeader !== 'string') return '';
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(hostHeader);
  return (bracketed ? bracketed[1] : hostHeader.split(':')[0]).toLowerCase();
}

function sendJson(res, status, body, extraHeaders = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    ...extraHeaders,
  });
  res.end(text);
}

const sendError = (res, status, code, message, extraHeaders) =>
  sendJson(res, status, { error: { code, message } }, extraHeaders);

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    // An oversized body is read and thrown away, never stored, so the client gets a clear 413
    // instead of a dropped connection and memory stays small.
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return reject(new ServiceError('too_large', 'The request is too large.', 413));
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') return resolve({});
      try {
        const parsed = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        resolve(parsed);
      } catch {
        reject(new ServiceError('invalid_json', 'The request body is not a JSON object.', 400));
      }
    });
    req.on('error', reject);
  });
}

export function createHttpServer({ service, publicDir, host = '127.0.0.1' }) {
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', host.toLowerCase()]);
  const root = path.resolve(publicDir);

  const routes = [
    ['GET', /^\/api\/state$/, () => service.getState()],
    ['POST', /^\/api\/interpretation\/propose$/, (body) => service.proposeInterpretation(body.text)],
    ['POST', /^\/api\/requirement\/edit$/, (body) => service.editRequirement(body)],
    ['POST', /^\/api\/requirement\/approve$/, () => service.approveRequirement()],
    ['POST', /^\/api\/mapping\/confirm$/, (body) => service.confirmMapping(body)],
    ['POST', /^\/api\/tests\/([A-Za-z0-9-]{1,40})\/run$/, (body, match) => service.runTest(match[1])],
    ['POST', /^\/api\/repair\/apply$/, (body) => service.applyRepair(body.repairId)],
    ['POST', /^\/api\/reset$/, () => service.reset()],
    ['POST', /^\/api\/app\/attempt$/, (body) => service.probeAttempt(body)],
  ];

  async function handleApi(req, res, pathname) {
    const matching = routes.filter(([, pattern]) => pattern.test(pathname));
    if (matching.length === 0) return sendError(res, 404, 'not_found', 'There is no such endpoint.');
    const route = matching.find(([method]) => method === req.method);
    if (!route) {
      return sendError(res, 405, 'method_not_allowed', 'That method is not allowed here.', { Allow: matching[0][0] });
    }
    let body = {};
    if (req.method === 'POST') {
      const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (type !== 'application/json') {
        return sendError(res, 415, 'unsupported_media_type', 'Send changes as application/json.');
      }
      const origin = req.headers.origin;
      if (origin !== undefined) {
        let originHost = '';
        try {
          originHost = new URL(origin).host;
        } catch {
          originHost = '';
        }
        if (originHost !== req.headers.host) {
          return sendError(res, 403, 'bad_origin', 'Changes must come from this page.');
        }
      }
      body = await readJsonBody(req);
    }
    const match = route[1].exec(pathname);
    return sendJson(res, 200, await route[2](body, match));
  }

  async function handleStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendError(res, 405, 'method_not_allowed', 'That method is not allowed here.', { Allow: 'GET, HEAD' });
    }
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return sendError(res, 400, 'bad_path', 'The address is not valid.');
    }
    if (decoded.includes('\0')) return sendError(res, 400, 'bad_path', 'The address is not valid.');
    const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(root + path.sep)) {
      return sendError(res, 403, 'forbidden', 'That file is not available.');
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
      const content = await readFile(file);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': content.length,
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
      sendError(res, 404, 'not_found', 'That file does not exist.');
    }
  }

  return http.createServer(async (req, res) => {
    try {
      if (!allowedHosts.has(hostnameOf(req.headers.host))) {
        return sendError(res, 403, 'bad_host', 'This server only answers requests for this computer.');
      }
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
      return await handleStatic(req, res, pathname);
    } catch (error) {
      if (error instanceof ServiceError) {
        const close = error.status === 413 ? { Connection: 'close' } : undefined;
        return sendError(res, error.status, error.code, error.message, close);
      }
      console.error('Unexpected error:', error);
      return sendError(res, 500, 'internal_error', 'Something went wrong inside SpecLens.');
    }
  });
}
