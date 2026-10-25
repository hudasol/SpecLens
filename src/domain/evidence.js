// The rules that decide what counts as evidence. Pure functions, no files, no clock.
//
// PASS          the test ran, the assertions were evaluated, and every one held.
// FAIL          the assertions were evaluated and at least one was violated.
// UNTESTED      no valid applicable evidence exists for this requirement version.
// INCONCLUSIVE  a crash, setup problem, timeout or missing evidence stopped a verdict.

import { formatCents } from './money.js';
import { shortDigest } from './digest.js';
import { getTest } from './catalog.js';

export const OUTCOMES = Object.freeze(['PASS', 'FAIL', 'UNTESTED', 'INCONCLUSIVE']);

export const CAUSE_LABELS = Object.freeze({
  timeout: 'The test did not finish in time.',
  runner_crash: 'The test process stopped unexpectedly.',
  invalid_output: 'The test process did not return a readable result.',
  setup_error: 'The app could not be set up for the test.',
  setup_invalid: 'The scenario did not reach the starting state the test needs.',
  app_exception: 'The app threw an error while the test was running.',
  missing_evidence: 'The result was missing something the test needs.',
  build_changed_during_run: 'The app file changed while the test was running.',
  record_inconsistent: 'The stored record does not match its own observations.',
  unknown_test: 'The record refers to a test that does not exist.',
});

export const REASON_LABELS = Object.freeze({
  requirement_changed: 'The requirement was edited after this run.',
  criterion_reworded: 'The criterion wording changed after this run.',
  criterion_removed: 'The criterion no longer exists in the current requirement.',
  build_changed: 'The app code is different from the code this run tested.',
  test_changed: 'The test itself has changed since this run.',
  superseded_by_rerun: 'A later run of the same test replaced it as the current evidence.',
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

function blankChecks(test) {
  return test.checks.map((check) => ({
    id: check.id,
    kind: check.kind,
    label: check.label,
    status: 'not_evaluated',
    expected: null,
    actual: null,
  }));
}

export function inconclusive(test, cause, detail, checks) {
  return { outcome: 'INCONCLUSIVE', cause, detail, checks: checks ?? blankChecks(test) };
}

function validObservations(o) {
  return (
    isObject(o) &&
    Array.isArray(o.seed) &&
    isObject(o.before) &&
    Number.isInteger(o.before.remainingCents) &&
    Array.isArray(o.before.history) &&
    isObject(o.attempt) &&
    Number.isInteger(o.attempt.amountCents) &&
    'result' in o.attempt &&
    isObject(o.after) &&
    Number.isInteger(o.after.remainingCents) &&
    Array.isArray(o.after.history)
  );
}

function describeResult(result) {
  if (!isObject(result)) return 'no readable answer';
  if (result.ok === true) return 'accepted';
  if (result.ok === false) return result.reason ? `rejected (${result.reason})` : 'rejected';
  return 'no readable answer';
}

const STAGE_TEXT = Object.freeze({
  setup: 'Setup failed',
  attempt: 'The app threw an error on the overspend attempt',
  snapshot: 'The app threw an error when its balance was read',
});

// Turns what the isolated process reported into a verdict. The verdict is always computed here,
// from the raw observations. A verdict supplied by the process, or by a stored record, is never trusted.
export function classifyRun(test, execution) {
  if (!isObject(execution) || execution.status !== 'completed') {
    return inconclusive(
      test,
      execution?.cause ?? 'missing_evidence',
      execution?.detail ?? 'No execution record was produced.',
    );
  }
  const report = execution.report;
  if (!isObject(report) || typeof report.ok !== 'boolean') {
    return inconclusive(test, 'invalid_output', 'The test process returned something that is not a report.');
  }
  if (report.ok === false) {
    const cause = report.stage === 'setup' ? 'setup_error' : 'app_exception';
    const stage = STAGE_TEXT[report.stage] ?? 'The test stopped';
    return inconclusive(test, cause, `${stage}: ${String(report.error ?? 'unknown error').slice(0, 300)}`);
  }

  const obs = report.observations;
  if (!validObservations(obs)) {
    return inconclusive(test, 'missing_evidence', 'The report did not contain every observation the test needs.');
  }

  const scenario = test.scenario;
  const plannedRemaining = scenario.budgetCents - scenario.seed.reduce((sum, item) => sum + item.amountCents, 0);
  const seeded =
    obs.seed.length === scenario.seed.length &&
    obs.seed.every((entry) => isObject(entry) && isObject(entry.result) && entry.result.ok === true);
  if (
    !seeded ||
    obs.before.remainingCents !== plannedRemaining ||
    obs.before.history.length !== scenario.seed.length
  ) {
    return inconclusive(
      test,
      'setup_invalid',
      `The starting state was not the planned one (expected ${formatCents(plannedRemaining)} left after ${scenario.seed.length} expenses, saw ${formatCents(obs.before.remainingCents)} and ${obs.before.history.length} entries).`,
    );
  }
  if (obs.attempt.amountCents !== scenario.attempt.amountCents) {
    return inconclusive(test, 'setup_invalid', 'The attempt that was made is not the attempt the test defines.');
  }

  const checks = blankChecks(test);
  const check = (id) => checks.find((item) => item.id === id);

  const remainingBefore = obs.before.remainingCents;
  const a1 = check('A1');
  a1.expected = `more than ${formatCents(remainingBefore)}`;
  a1.actual = formatCents(obs.attempt.amountCents);
  if (obs.attempt.amountCents <= remainingBefore) {
    a1.status = 'violated';
    return {
      outcome: 'INCONCLUSIVE',
      cause: 'setup_invalid',
      detail: 'The attempt was not larger than the remaining budget, so this test does not apply.',
      checks,
    };
  }
  a1.status = 'held';

  const result = obs.attempt.result;
  if (!isObject(result) || typeof result.ok !== 'boolean') {
    return {
      outcome: 'INCONCLUSIVE',
      cause: 'missing_evidence',
      detail: 'The tracker did not answer the attempt with an accepted or rejected result.',
      checks,
    };
  }

  const a2 = check('A2');
  a2.expected = 'rejected';
  a2.actual = describeResult(result);
  a2.status = result.ok === false ? 'held' : 'violated';

  const a3 = check('A3');
  a3.expected = formatCents(remainingBefore);
  a3.actual = formatCents(obs.after.remainingCents);
  a3.status = obs.after.remainingCents === remainingBefore ? 'held' : 'violated';

  const a4 = check('A4');
  const unchanged = deepEqual(obs.after.history, obs.before.history);
  a4.expected = `${obs.before.history.length} entries, unchanged`;
  a4.actual = `${obs.after.history.length} entries${unchanged ? ', unchanged' : ''}`;
  a4.status = unchanged ? 'held' : 'violated';

  const violated = checks.filter((item) => item.kind === 'assertion' && item.status === 'violated');
  if (violated.length > 0) {
    return {
      outcome: 'FAIL',
      cause: null,
      detail: `Violated: ${violated.map((item) => item.label.toLowerCase()).join('; ')}.`,
      checks,
    };
  }
  return { outcome: 'PASS', cause: null, detail: 'Every assertion held.', checks };
}

// Re-derives a stored run's outcome from its own observations. A stored PASS or FAIL that the
// observations do not support is demoted to INCONCLUSIVE, so a hand edited file cannot fake proof.
export function verifyRecordedRun(run) {
  const test = getTest(run.testId);
  if (!test) return { outcome: 'INCONCLUSIVE', cause: 'unknown_test', consistent: false };
  if (run.cause) {
    const consistent = run.outcome === 'INCONCLUSIVE';
    return consistent
      ? { outcome: 'INCONCLUSIVE', cause: run.cause, consistent: true }
      : { outcome: 'INCONCLUSIVE', cause: 'record_inconsistent', consistent: false };
  }
  if (!isObject(run.observations)) {
    return { outcome: 'INCONCLUSIVE', cause: 'record_inconsistent', consistent: false };
  }
  const again = classifyRun(test, { status: 'completed', report: { ok: true, observations: run.observations } });
  if (again.outcome !== run.outcome || again.cause !== null) {
    return again.outcome === 'INCONCLUSIVE' && run.outcome === 'INCONCLUSIVE'
      ? { outcome: 'INCONCLUSIVE', cause: again.cause, consistent: true }
      : { outcome: 'INCONCLUSIVE', cause: 'record_inconsistent', consistent: false };
  }
  // The shown checks and detail are recomputed from the observations as well, so a hand edited
  // copy of them in the saved file cannot change what the interface displays.
  return { outcome: again.outcome, cause: null, consistent: true, checks: again.checks, detail: again.detail };
}

// Decides which runs still count as current evidence for the latest requirement version.
export function assessRuns(runs, { latestVersion, criteria, currentBuildDigest }) {
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const assessed = runs.map((run) => {
    const reasons = [];
    if (run.requirementVersion !== latestVersion) reasons.push('requirement_changed');
    const criterion = byId.get(run.criterionId);
    if (!criterion) reasons.push('criterion_removed');
    else if (criterion.signature !== run.criterionSignature) reasons.push('criterion_reworded');
    if (run.buildDigest !== currentBuildDigest) reasons.push('build_changed');
    const test = getTest(run.testId);
    if (test && run.testVersion !== test.version) reasons.push('test_changed');
    return { ...run, reasons, current: false };
  });

  const lastCandidate = new Map();
  assessed.forEach((run, index) => {
    if (run.reasons.length === 0) lastCandidate.set(`${run.testId}|${run.criterionId}`, index);
  });
  assessed.forEach((run, index) => {
    if (run.reasons.length === 0 && lastCandidate.get(`${run.testId}|${run.criterionId}`) !== index) {
      run.reasons.push('superseded_by_rerun');
    }
    run.current = run.reasons.length === 0;
  });
  return assessed;
}

// A criterion shows the outcome of its latest current run. With none, it is UNTESTED, never PASS.
export function deriveCriterionStatus(criterionId, assessedRuns) {
  const current = assessedRuns.filter((run) => run.criterionId === criterionId && run.current);
  const latest = current[current.length - 1];
  return latest ? { status: latest.outcome, runId: latest.id } : { status: 'UNTESTED', runId: null };
}

// Plain language account of what a recorded run does and does not establish.
export function explainRun(run) {
  const test = getTest(run.testId);
  const limits = test ? [...test.limits] : [];
  const build = `This evidence applies to build ${shortDigest(run.buildDigest)} only. Any change to the app makes it historical.`;

  if (run.outcome === 'INCONCLUSIVE') {
    return {
      headline: 'The test could not produce valid evidence, so there is no verdict.',
      proves: [],
      doesNotProve: [
        CAUSE_LABELS[run.cause] ?? 'The test could not finish.',
        `It neither shows that ${run.criterionId} holds nor that it fails.`,
        'Run the test again once the cause is understood.',
      ],
    };
  }

  const obs = run.observations;
  const before = obs.before;
  const spentBefore = before.spentCents;
  const scene = `Budget ${formatCents(before.budgetCents)}, ${formatCents(spentBefore)} spent, ${formatCents(before.remainingCents)} left. The tracker was asked to add ${formatCents(obs.attempt.amountCents)} for "${obs.attempt.label}".`;

  if (run.outcome === 'PASS') {
    return {
      headline: 'The test ran, every assertion was evaluated, and every one held.',
      proves: [
        scene,
        `The tracker ${describeResult(obs.attempt.result)}.`,
        `The remaining balance stayed ${formatCents(before.remainingCents)}.`,
        `The history stayed at ${before.history.length} entries.`,
      ],
      doesNotProve: [...limits, build],
    };
  }

  const violated = (Array.isArray(run.checks) ? run.checks : []).filter((check) => check.kind === 'assertion' && check.status === 'violated');
  return {
    headline: 'The test ran and at least one assertion was violated.',
    proves: [
      scene,
      ...violated.map((check) => `${check.label}: expected ${check.expected}, observed ${check.actual}.`),
      `In this scenario the build does not meet ${run.criterionId}.`,
    ],
    doesNotProve: [
      'It does not explain why the build behaves this way.',
      'It does not show how the build behaves for other amounts or budgets.',
      build,
    ],
  };
}
