// Checks the files that would be published: no secrets, no local paths, no stray names, and the
// house style for written text. Private working files that are ignored by git are skipped.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.git', '.speclens', 'test-results', 'coverage', 'playwright-report']);
const SKIP_FILES = new Set(['devpost/learner-profile.md']);
const TEXT = /\.(js|mjs|json|md|html|css|svg|txt|yml|yaml)$|^\.(gitignore|env\.example)$|^LICENSE$/;

async function publishedFiles(dir = ROOT) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(ROOT, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...(await publishedFiles(full)));
    } else if (!SKIP_FILES.has(relative) && TEXT.test(entry.name)) {
      found.push({ full, relative });
    }
  }
  return found;
}

const texts = new Map();
async function allTexts() {
  if (texts.size === 0) {
    for (const file of await publishedFiles()) texts.set(file.relative, await readFile(file.full, 'utf8'));
  }
  return texts;
}

function offenders(pattern, ignore = () => false) {
  return async () => {
    const bad = [];
    for (const [file, text] of await allTexts()) {
      if (ignore(file)) continue;
      const match = pattern.exec(text);
      if (match) bad.push(`${file}: ${JSON.stringify(match[0])}`);
    }
    return bad;
  };
}

// Words are assembled here so this file does not contain them itself.
const assistant = new RegExp(['cla', 'ude'].join('') + '|' + ['anthr', 'opic'].join(''), 'i');

describe('published files', () => {
  it('include the files the project needs', async () => {
    const names = [...(await allTexts()).keys()];
    for (const required of ['LICENSE', 'package.json', 'devpost/scope.md', 'devpost/prd.md', 'devpost/spec.md', '.gitignore']) {
      assert.ok(names.includes(required), `${required} is missing`);
    }
  });

  it('never name the assistant that helped or its vendor', async () => {
    assert.deepEqual(await offenders(assistant)(), []);
  });

  it('contain no em dashes or en dashes', async () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    assert.deepEqual(await offenders(dashes)(), []);
  });

  it('contain no emoji', async () => {
    assert.deepEqual(await offenders(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u)(), []);
  });

  it('contain no local machine paths', async () => {
    const pattern = /[A-Za-z]:\\Users\\|\/home\/[a-z]|\/Users\/[A-Za-z]|\/root\//;
    assert.deepEqual(await offenders(pattern)(), []);
  });

  it('contain no keys, tokens or passwords', async () => {
    const pattern = /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"\s]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/i;
    assert.deepEqual(await offenders(pattern)(), []);
  });

  it('contain no unfinished markers', async () => {
    const pattern = /\b(?:TODO|FIXME|XXX|lorem ipsum)\b/i;
    assert.deepEqual(await offenders(pattern, (file) => file === 'tests/hygiene.test.js')(), []);
  });

  it('contain no email addresses other than the contact shown in the license holder line', async () => {
    const found = await offenders(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)();
    assert.deepEqual(found, []);
  });
});
