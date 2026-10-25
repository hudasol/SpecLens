import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeText, sha256, shortDigest, textSignature } from '../src/domain/digest.js';
import { formatCents, parseDollarsToCents } from '../src/domain/money.js';

describe('money', () => {
  it('formats whole cents as dollars', () => {
    assert.equal(formatCents(0), '$0.00');
    assert.equal(formatCents(5), '$0.05');
    assert.equal(formatCents(2000), '$20.00');
    assert.equal(formatCents(10050), '$100.50');
    assert.equal(formatCents(-500), '-$5.00');
  });

  it('does not pretend to format values that are not whole cents', () => {
    assert.equal(formatCents(1.5), '1.5');
    assert.equal(formatCents(undefined), 'undefined');
  });

  it('parses plain dollar amounts into cents', () => {
    assert.equal(parseDollarsToCents('25'), 2500);
    assert.equal(parseDollarsToCents('25.5'), 2550);
    assert.equal(parseDollarsToCents(' 25.05 '), 2505);
    assert.equal(parseDollarsToCents('0.01'), 1);
  });

  it('rejects text that is not a plain amount', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3', '$5', '5,00', null, undefined, '99999999']) {
      assert.equal(parseDollarsToCents(bad), null, `expected ${String(bad)} to be rejected`);
    }
  });
});

describe('digests', () => {
  it('is stable and sensitive to every change', () => {
    assert.equal(sha256('a'), sha256('a'));
    assert.notEqual(sha256('a'), sha256('b'));
    assert.equal(sha256('').length, 64);
  });

  it('shortens a digest for display', () => {
    assert.equal(shortDigest(sha256('a')), sha256('a').slice(0, 8));
    assert.equal(shortDigest(undefined), '');
  });

  it('ignores harmless spacing when comparing wording', () => {
    assert.equal(normalizeText('  one \n two\t three '), 'one two three');
    assert.equal(textSignature('A  b'), textSignature(' A b '));
    assert.notEqual(textSignature('A b'), textSignature('A c'));
  });
});
