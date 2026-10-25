import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatCents as clientFormat } from '../public/format.js';
import { formatCents as serverFormat } from '../src/domain/money.js';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

async function files(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await files(full)));
    else found.push(full);
  }
  return found;
}

describe('the interface code', () => {
  it('formats money exactly as the server does', () => {
    for (const cents of [0, 1, 5, 99, 100, 2000, 2500, 10000, 10050, -500, -1, 123456789, 1.5, undefined]) {
      assert.equal(clientFormat(cents), serverFormat(cents), `value ${cents}`);
    }
  });

  it('never turns text into markup or runs text as code', async () => {
    const scripts = (await files(PUBLIC)).filter((file) => file.endsWith('.js'));
    assert.ok(scripts.length >= 8, 'expected the interface scripts to be found');
    for (const file of scripts) {
      const source = await readFile(file, 'utf8');
      for (const banned of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'srcdoc']) {
        assert.ok(!source.includes(banned), `${path.basename(file)} uses ${banned}`);
      }
    }
  });

  it('loads nothing from another site', async () => {
    for (const file of await files(PUBLIC)) {
      if (!/\.(js|css|html)$/.test(file)) continue;
      const source = await readFile(file, 'utf8');
      assert.ok(!/https?:\/\//.test(source.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '')), `${path.basename(file)} mentions an outside address`);
    }
  });

  it('declares one language, a title, a viewport and a main landmark', async () => {
    const page = await readFile(path.join(PUBLIC, 'index.html'), 'utf8');
    assert.match(page, /<html lang="en">/);
    assert.match(page, /<title>SpecLens/);
    assert.match(page, /name="viewport"/);
    assert.match(page, /<main id="main"/);
    assert.match(page, /class="skip-link"/);
  });
});
