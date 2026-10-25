import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CANONICAL, INTENT_EXAMPLE } from '../src/domain/catalog.js';
import { INTERPRETER_ID, interpretIntent } from '../src/domain/interpreter.js';
import { contentDigest, validateEdit } from '../src/domain/requirements.js';

describe('offline interpreter', () => {
  it('turns the example request into one requirement and two criteria', () => {
    const result = interpretIntent(INTENT_EXAMPLE);
    assert.equal(result.recognised, true);
    assert.equal(result.interpreter, INTERPRETER_ID);
    assert.equal(result.intent.id, 'INT-001');
    assert.equal(result.proposal.requirementId, 'REQ-001');
    assert.equal(result.proposal.version, 1);
    assert.deepEqual(
      result.proposal.criteria.map((criterion) => [criterion.id, criterion.testId]),
      [
        ['AC-001', 'TEST-001'],
        ['AC-002', null],
      ],
    );
    assert.equal(result.proposal.requirementText, CANONICAL.requirementText);
  });

  it('recognises close rewordings and curly apostrophes', () => {
    for (const text of [
      'Don’t let students overspend',
      'do not allow users to spend more than their budget',
      'Never let students over-spend!',
      'We must not let users exceed their budget',
    ]) {
      const result = interpretIntent(text);
      assert.equal(result.ok, true);
      assert.equal(result.recognised, true, text);
    }
  });

  it('says plainly when it does not recognise a request, and proposes nothing', () => {
    const result = interpretIntent('Make the app faster.');
    assert.equal(result.ok, true);
    assert.equal(result.recognised, false);
    assert.equal(result.proposal, undefined);
    assert.match(result.message, /only recognises/);
  });

  it('rejects empty, non text and over long requests', () => {
    assert.equal(interpretIntent('').ok, false);
    assert.equal(interpretIntent('   ').ok, false);
    assert.equal(interpretIntent(42).ok, false);
    assert.equal(interpretIntent('x'.repeat(301)).ok, false);
  });
});

describe('requirement edits', () => {
  const latest = { criteria: CANONICAL.criteria.map((c) => ({ id: c.id, text: c.text })) };
  const good = {
    requirementText: 'New wording',
    criteria: [
      { id: 'AC-001', text: 'First' },
      { id: 'AC-002', text: 'Second' },
    ],
  };

  it('accepts a reword of the requirement and every criterion', () => {
    const result = validateEdit(latest, good);
    assert.equal(result.ok, true);
    assert.deepEqual(result.criteria, good.criteria);
  });

  it('refuses to add, remove or rename criteria', () => {
    assert.equal(validateEdit(latest, { ...good, criteria: [good.criteria[0]] }).ok, false);
    assert.equal(validateEdit(latest, { ...good, criteria: [...good.criteria, { id: 'AC-003', text: 'x' }] }).ok, false);
    assert.equal(validateEdit(latest, { ...good, criteria: [good.criteria[0], { id: 'AC-009', text: 'x' }] }).ok, false);
  });

  it('refuses empty or non text content', () => {
    assert.equal(validateEdit(latest, { ...good, requirementText: ' ' }).ok, false);
    assert.equal(validateEdit(latest, { ...good, criteria: [good.criteria[0], { id: 'AC-002', text: '' }] }).ok, false);
    assert.equal(validateEdit(latest, null).ok, false);
    assert.equal(validateEdit(latest, { ...good, criteria: 'nope' }).ok, false);
  });

  it('fingerprints content, ignoring spacing but not wording', () => {
    const a = contentDigest({ requirementText: 'A  b', criteria: [{ id: 'AC-001', text: 'c d' }] });
    const b = contentDigest({ requirementText: ' A b ', criteria: [{ id: 'AC-001', text: 'c  d' }] });
    const c = contentDigest({ requirementText: 'A b', criteria: [{ id: 'AC-001', text: 'c e' }] });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});
