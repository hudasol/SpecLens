import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { INTENT_EXAMPLE } from '../src/domain/catalog.js';
import { createHttpServer } from '../src/http/server.js';
import { createService } from '../src/services/speclens-service.js';
import { SEED_PATH, tempDir } from './helpers.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

let server;
let base;
let port;

before(async () => {
  const service = await createService({ dataDir: await tempDir('speclens-http-'), seedPath: SEED_PATH });
  server = createHttpServer({ service, publicDir: PUBLIC_DIR, host: '127.0.0.1' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const post = (route, body, headers = {}) =>
  fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// fetch will not let a script set the Host header, so use a raw request for those checks.
function rawRequest({ method = 'GET', route = '/api/state', headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: route, headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('the interface and its safety headers', () => {
  it('serves the interface page', async () => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /SpecLens/);
  });

  it('sends a strict content security policy and other protective headers', async () => {
    const response = await fetch(`${base}/`);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  it('serves scripts and styles with the right types', async () => {
    for (const [route, type] of [['/styles.css', /text\/css/], ['/app.js', /text\/javascript/]]) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), type);
    }
  });

  it('does not serve files outside the public folder', async () => {
    for (const route of ['/../package.json', '/%2e%2e/package.json', '/..%2fserver.js', '/%00', '/../../etc/passwd']) {
      const result = await rawRequest({ route, headers: { Host: `127.0.0.1:${port}` } });
      assert.ok([400, 403, 404].includes(result.status), `${route} gave ${result.status}`);
      assert.ok(!/"name": "speclens"/.test(result.text), `${route} leaked a file`);
    }
  });

  it('returns 404 for a file that does not exist and 405 for a write', async () => {
    assert.equal((await fetch(`${base}/missing.js`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  });

  it('answers a HEAD request without a body', async () => {
    const result = await rawRequest({ method: 'HEAD', route: '/', headers: { Host: `127.0.0.1:${port}` } });
    assert.equal(result.status, 200);
    assert.equal(result.text, '');
  });
});

describe('who may talk to the server', () => {
  it('refuses a request for another host name, which blocks DNS rebinding', async () => {
    const result = await rawRequest({ headers: { Host: 'evil.example' } });
    assert.equal(result.status, 403);
    assert.match(result.text, /bad_host/);
  });

  it('refuses a change that did not come from this page', async () => {
    const response = await post('/api/reset', {}, { Origin: 'https://evil.example' });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'bad_origin');
  });

  it('accepts a change from this page', async () => {
    const response = await post('/api/reset', {}, { Origin: base });
    assert.equal(response.status, 200);
  });

  it('refuses a change that is not sent as JSON, such as a form post from another site', async () => {
    const response = await fetch(`${base}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'a=b',
    });
    assert.equal(response.status, 415);
  });

  it('refuses malformed, oversized and non object bodies', async () => {
    const bad = await fetch(`${base}/api/interpretation/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ nope',
    });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code, 'invalid_json');

    const list = await fetch(`${base}/api/interpretation/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '[1]',
    });
    assert.equal(list.status, 400);

    const big = await fetch(`${base}/api/interpretation/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(100 * 1024) }),
    });
    assert.equal(big.status, 413);
    assert.equal((await big.json()).error.code, 'too_large');
  });

  it('answers unknown endpoints and wrong methods clearly', async () => {
    assert.equal((await fetch(`${base}/api/nothing`)).status, 404);
    const wrong = await fetch(`${base}/api/reset`);
    assert.equal(wrong.status, 405);
    assert.equal(wrong.headers.get('allow'), 'POST');
  });
});

describe('the journey over HTTP', () => {
  it('runs from request to a recorded FAIL, a repair, and a PASS', async () => {
    await post('/api/reset', {});

    const empty = await (await fetch(`${base}/api/state`)).json();
    assert.equal(empty.requirement, null);
    assert.equal(empty.app.state, 'defective');

    const proposed = await (await post('/api/interpretation/propose', { text: INTENT_EXAMPLE })).json();
    assert.equal(proposed.recognised, true);

    const lockedRun = await post('/api/tests/TEST-001/run');
    assert.equal(lockedRun.status, 409);
    assert.equal((await lockedRun.json()).error.code, 'not_approved');

    assert.equal((await post('/api/requirement/approve', {})).status, 200);

    const failed = await (await post('/api/tests/TEST-001/run')).json();
    assert.equal(failed.outcome, 'FAIL');

    const probe = await (await post('/api/app/attempt', { amount: '25' })).json();
    assert.equal(probe.recorded, false);

    assert.equal((await post('/api/repair/apply', { repairId: 'REPAIR-001' })).status, 200);
    const passed = await (await post('/api/tests/TEST-001/run')).json();
    assert.equal(passed.outcome, 'PASS');
    assert.deepEqual(passed.state.runs.map((run) => [run.id, run.outcome, run.current]), [
      ['RUN-0001', 'FAIL', false],
      ['RUN-0002', 'PASS', true],
    ]);

    const again = await (await fetch(`${base}/api/state`)).json();
    assert.deepEqual(again.runs, passed.state.runs);
  });

  it('reports a service rule as a clear error, not a crash', async () => {
    await post('/api/reset', {});
    const response = await post('/api/requirement/approve', {});
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'no_requirement');
  });

  it('does not accept a path that merely looks like a test', async () => {
    const response = await post('/api/tests/TEST-001%2F..%2Freset/run', {});
    assert.equal(response.status, 404);
  });
});
