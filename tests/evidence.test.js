import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TEST_001 } from '../src/domain/catalog.js';
import {
  assessRuns,
  classifyRun,
  deepEqual,
  deriveCriterionStatus,
  explainRun,
  verifyRecordedRun,
} from '../src/domain/evidence.js';
import { classifyObservations, completed, observations } from './fixtures.js';

const statusOf = (result, id) => result.checks.find((check) => check.id === id).status;

describe('classifying a run from raw observations', () => {
  it('PASS when the overspend is rejected and nothing changes', () => {
    const result = classifyObservations(observations({ accepts: false }));
    assert.equal(result.outcome, 'PASS');
    assert.equal(result.cause, null);
    assert.deepEqual(result.checks.map((c) => c.status), ['held', 'held', 'held', 'held']);
  });

  it('FAIL when the build accepts the overspend, with every violated assertion named', () => {
    const result = classifyObservations(observations({ accepts: true }));
    assert.equal(result.outcome, 'FAIL');
    assert.equal(statusOf(result, 'A1'), 'held');
    assert.equal(statusOf(result, 'A2'), 'violated');
    assert.equal(statusOf(result, 'A3'), 'violated');
    assert.equal(statusOf(result, 'A4'), 'violated');
    const a3 = result.checks.find((c) => c.id === 'A3');
    assert.equal(a3.expected, '$20.00');
    assert.equal(a3.actual, '-$5.00');
    assert.match(result.detail, /Violated/);
  });

  it('FAIL when the build rejects the expense but still records it', () => {
    const obs = observations({ accepts: false });
    obs.after.history = [...obs.after.history, { id: 'E3', label: 'Concert ticket', amountCents: 2500 }];
    const result = classifyObservations(obs);
    assert.equal(result.outcome, 'FAIL');
    assert.equal(statusOf(result, 'A2'), 'held');
    assert.equal(statusOf(result, 'A3'), 'held');
    assert.equal(statusOf(result, 'A4'), 'violated');
  });

  it('FAIL when the build rejects the expense but still changes the balance', () => {
    const obs = observations({ accepts: false });
    obs.after.remainingCents = 1500;
    const result = classifyObservations(obs);
    assert.equal(result.outcome, 'FAIL');
    assert.equal(statusOf(result, 'A3'), 'violated');
  });

  it('FAIL when a history entry is silently altered', () => {
    const obs = observations({ accepts: false });
    obs.after.history = obs.after.history.map((item, index) => (index === 0 ? { ...item, amountCents: 1 } : item));
    const result = classifyObservations(obs);
    assert.equal(result.outcome, 'FAIL');
    assert.equal(statusOf(result, 'A4'), 'violated');
  });

  it('never trusts a verdict supplied by the test process', () => {
    const report = { ok: true, observations: observations({ accepts: true }), verdict: 'PASS', outcome: 'PASS' };
    const result = classifyRun(TEST_001, { status: 'completed', report });
    assert.equal(result.outcome, 'FAIL');
  });

  describe('INCONCLUSIVE', () => {
    const expectInconclusive = (result, cause) => {
      assert.equal(result.outcome, 'INCONCLUSIVE');
      assert.equal(result.cause, cause);
      assert.ok(result.detail.length > 0);
    };

    it('for a timeout, a crash, or unreadable output reported by the executor', () => {
      for (const cause of ['timeout', 'runner_crash', 'invalid_output']) {
        expectInconclusive(classifyRun(TEST_001, { status: 'failed', cause, detail: 'x' }), cause);
      }
    });

    it('for no execution record at all', () => {
      expectInconclusive(classifyRun(TEST_001, undefined), 'missing_evidence');
      expectInconclusive(classifyRun(TEST_001, { status: 'failed' }), 'missing_evidence');
    });

    it('for a report that is not a report', () => {
      expectInconclusive(classifyRun(TEST_001, { status: 'completed', report: 'PASS' }), 'invalid_output');
      expectInconclusive(classifyRun(TEST_001, { status: 'completed', report: { ok: 'yes' } }), 'invalid_output');
    });

    it('for an error while setting the app up, and for an error on the attempt', () => {
      const setup = classifyRun(TEST_001, { status: 'completed', report: { ok: false, stage: 'setup', error: 'boom' } });
      expectInconclusive(setup, 'setup_error');
      const attempt = classifyRun(TEST_001, { status: 'completed', report: { ok: false, stage: 'attempt', error: 'boom' } });
      expectInconclusive(attempt, 'app_exception');
      assert.match(attempt.detail, /boom/);
    });

    it('for a report without the observations the test needs', () => {
      expectInconclusive(classifyRun(TEST_001, { status: 'completed', report: { ok: true } }), 'missing_evidence');
      const obs = observations({ accepts: true });
      delete obs.after;
      expectInconclusive(classifyRun(TEST_001, completed(obs)), 'missing_evidence');
    });

    it('for a starting state that is not the planned one', () => {
      const obs = observations({ accepts: true });
      obs.seed[0].result = { ok: false, reason: 'invalid_amount' };
      expectInconclusive(classifyObservations(obs), 'setup_invalid');

      const wrongBalance = observations({ accepts: true });
      wrongBalance.before.remainingCents = 3000;
      expectInconclusive(classifyObservations(wrongBalance), 'setup_invalid');
    });

    it('when the attempt is not larger than the remaining budget, so the test does not apply', () => {
      // A roomier budget leaves $120.00, so a $25.00 expense is not an overspend.
      const roomy = { ...TEST_001, scenario: { ...TEST_001.scenario, budgetCents: 20000 } };
      const obs = observations({ accepts: false });
      obs.before = { ...obs.before, budgetCents: 20000, remainingCents: 12000 };
      const result = classifyRun(roomy, completed(obs));
      expectInconclusive(result, 'setup_invalid');
      assert.equal(statusOf(result, 'A1'), 'violated');
    });

    it('when the tracker answers with something that is neither accepted nor rejected', () => {
      const obs = observations({ accepts: false });
      obs.attempt.result = 'maybe';
      const result = classifyObservations(obs);
      expectInconclusive(result, 'missing_evidence');
      assert.equal(statusOf(result, 'A1'), 'held');
      assert.equal(statusOf(result, 'A2'), 'not_evaluated');
    });

    it('when the attempt that ran is not the attempt the test defines', () => {
      const obs = observations({ accepts: false });
      obs.attempt.amountCents = 99999;
      expectInconclusive(classifyObservations(obs), 'setup_invalid');
    });
  });
});

describe('verifying a stored run', () => {
  const stored = (accepts) => {
    const obs = observations({ accepts });
    const verdict = classifyObservations(obs);
    return { testId: 'TEST-001', outcome: verdict.outcome, cause: verdict.cause, observations: obs };
  };

  it('accepts a PASS and a FAIL that their own observations support', () => {
    for (const [accepts, outcome] of [[false, 'PASS'], [true, 'FAIL']]) {
      const result = verifyRecordedRun(stored(accepts));
      assert.deepEqual([result.outcome, result.cause, result.consistent], [outcome, null, true]);
      assert.ok(result.checks.length >= 4, 'the checks are recomputed from the observations');
      assert.equal(typeof result.detail, 'string');
    }
  });

  it('demotes a PASS that the observations contradict', () => {
    const forged = { ...stored(true), outcome: 'PASS' };
    assert.deepEqual(verifyRecordedRun(forged), { outcome: 'INCONCLUSIVE', cause: 'record_inconsistent', consistent: false });
  });

  it('demotes a PASS or FAIL that has no observations at all', () => {
    for (const outcome of ['PASS', 'FAIL']) {
      const result = verifyRecordedRun({ testId: 'TEST-001', outcome, cause: null });
      assert.equal(result.outcome, 'INCONCLUSIVE');
      assert.equal(result.consistent, false);
    }
  });

  it('demotes a verdict that claims a cause, and a record for an unknown test', () => {
    assert.equal(verifyRecordedRun({ testId: 'TEST-001', outcome: 'PASS', cause: 'timeout' }).consistent, false);
    assert.equal(verifyRecordedRun({ testId: 'TEST-999', outcome: 'PASS' }).cause, 'unknown_test');
  });

  it('keeps an honest INCONCLUSIVE', () => {
    const result = verifyRecordedRun({ testId: 'TEST-001', outcome: 'INCONCLUSIVE', cause: 'timeout' });
    assert.deepEqual(result, { outcome: 'INCONCLUSIVE', cause: 'timeout', consistent: true });
  });
});

describe('which runs are current evidence', () => {
  const criteria = [{ id: 'AC-001', signature: 'sig-a' }];
  const run = (overrides) => ({
    id: 'RUN-0001',
    testId: 'TEST-001',
    testVersion: 1,
    criterionId: 'AC-001',
    criterionSignature: 'sig-a',
    requirementVersion: 1,
    buildDigest: 'build-1',
    outcome: 'FAIL',
    ...overrides,
  });
  const ctx = { latestVersion: 1, criteria, currentBuildDigest: 'build-1' };

  it('treats a run for the same version, wording and build as current', () => {
    const [only] = assessRuns([run({})], ctx);
    assert.equal(only.current, true);
    assert.deepEqual(only.reasons, []);
  });

  it('makes a run historical when the requirement version changed', () => {
    const [only] = assessRuns([run({})], { ...ctx, latestVersion: 2 });
    assert.equal(only.current, false);
    assert.deepEqual(only.reasons, ['requirement_changed']);
  });

  it('makes a run historical when the criterion was reworded or removed', () => {
    const reworded = assessRuns([run({})], { ...ctx, criteria: [{ id: 'AC-001', signature: 'sig-b' }] })[0];
    assert.deepEqual(reworded.reasons, ['criterion_reworded']);
    const removed = assessRuns([run({})], { ...ctx, criteria: [] })[0];
    assert.deepEqual(removed.reasons, ['criterion_removed']);
  });

  it('makes a run historical when the app code changed', () => {
    const [only] = assessRuns([run({})], { ...ctx, currentBuildDigest: 'build-2' });
    assert.deepEqual(only.reasons, ['build_changed']);
  });

  it('makes a run historical when it was made by a different version of the test', () => {
    const [only] = assessRuns([run({ testVersion: 0 })], ctx);
    assert.equal(only.current, false);
    assert.deepEqual(only.reasons, ['test_changed']);
    assert.deepEqual(deriveCriterionStatus('AC-001', [only]), { status: 'UNTESTED', runId: null });
  });

  it('lists every reason that applies', () => {
    const [only] = assessRuns([run({})], { latestVersion: 3, criteria, currentBuildDigest: 'build-9' });
    assert.deepEqual(only.reasons, ['requirement_changed', 'build_changed']);
  });

  it('lets only the newest valid run stand, and keeps the older ones on record', () => {
    const assessed = assessRuns([run({ id: 'RUN-0001' }), run({ id: 'RUN-0002', outcome: 'PASS' })], ctx);
    assert.equal(assessed.length, 2);
    assert.deepEqual(assessed[0].reasons, ['superseded_by_rerun']);
    assert.equal(assessed[1].current, true);
    assert.deepEqual(deriveCriterionStatus('AC-001', assessed), { status: 'PASS', runId: 'RUN-0002' });
  });

  it('a stale run never stops a fresh run from counting', () => {
    const assessed = assessRuns(
      [run({ id: 'RUN-0001', buildDigest: 'old' }), run({ id: 'RUN-0002', outcome: 'PASS' })],
      ctx,
    );
    assert.deepEqual(assessed[0].reasons, ['build_changed']);
    assert.equal(assessed[1].current, true);
  });
});

describe('criterion status', () => {
  it('is UNTESTED when there is no current evidence, never PASS', () => {
    assert.deepEqual(deriveCriterionStatus('AC-001', []), { status: 'UNTESTED', runId: null });
    const historical = [{ id: 'RUN-0001', criterionId: 'AC-001', current: false, outcome: 'PASS' }];
    assert.deepEqual(deriveCriterionStatus('AC-001', historical), { status: 'UNTESTED', runId: null });
  });

  it('shows INCONCLUSIVE when the newest current run was inconclusive', () => {
    const runs = [{ id: 'RUN-0001', criterionId: 'AC-001', current: true, outcome: 'INCONCLUSIVE' }];
    assert.equal(deriveCriterionStatus('AC-001', runs).status, 'INCONCLUSIVE');
  });

  it('ignores runs for other criteria', () => {
    const runs = [{ id: 'RUN-0001', criterionId: 'AC-002', current: true, outcome: 'PASS' }];
    assert.equal(deriveCriterionStatus('AC-001', runs).status, 'UNTESTED');
  });
});

describe('explaining a run', () => {
  const recorded = (accepts) => {
    const obs = observations({ accepts });
    const verdict = classifyObservations(obs);
    return {
      testId: 'TEST-001',
      criterionId: 'AC-001',
      buildDigest: 'a'.repeat(64),
      outcome: verdict.outcome,
      cause: verdict.cause,
      checks: verdict.checks,
      observations: obs,
    };
  };

  it('says what a PASS shows and, just as clearly, what it does not', () => {
    const text = explainRun(recorded(false));
    assert.match(text.proves.join(' '), /\$20\.00/);
    assert.match(text.proves.join(' '), /rejected/);
    const limits = text.doesNotProve.join(' ');
    assert.match(limits, /exactly equal/);
    assert.match(limits, /other defects/);
    assert.match(limits, /aaaaaaaa/);
    assert.ok(!/verified|proven correct/i.test(JSON.stringify(text)));
  });

  it('says what a FAIL observed', () => {
    const text = explainRun(recorded(true));
    assert.match(text.proves.join(' '), /expected \$20\.00, observed -\$5\.00/);
    assert.match(text.proves.join(' '), /does not meet AC-001/);
  });

  it('claims nothing when a run is inconclusive', () => {
    const text = explainRun({ testId: 'TEST-001', criterionId: 'AC-001', buildDigest: 'b'.repeat(64), outcome: 'INCONCLUSIVE', cause: 'timeout' });
    assert.deepEqual(text.proves, []);
    assert.match(text.doesNotProve.join(' '), /did not finish in time/);
    assert.match(text.doesNotProve.join(' '), /neither shows/);
  });
});

describe('deep equality used for the history check', () => {
  it('compares nested structures by value', () => {
    assert.equal(deepEqual([{ a: 1 }], [{ a: 1 }]), true);
    assert.equal(deepEqual([{ a: 1 }], [{ a: 2 }]), false);
    assert.equal(deepEqual([1, 2], [1, 2, 3]), false);
    assert.equal(deepEqual({ a: 1 }, { a: 1, b: undefined }), false);
    assert.equal(deepEqual(null, {}), false);
    assert.equal(deepEqual([], {}), false);
  });
});
