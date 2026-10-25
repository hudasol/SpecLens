import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReplay } from '../src/domain/replay.js';
import { deriveState } from '../src/domain/state.js';
import { validateLog } from '../src/domain/events.js';
import { CTX_REPAIRED, CTX_SEED, REPAIRED_DIGEST, SEED_DIGEST, logBuilder, observations } from './fixtures.js';

const criterion = (state, id) => state.criteria.find((item) => item.id === id);

const REWORDED = {
  requirementText: 'A student must never be able to go over the budget they have left.',
  criteria: [
    { id: 'AC-001', text: 'An expense bigger than the money left is refused, and nothing else changes.' },
    { id: 'AC-002', text: 'An expense equal to the money left is accepted and leaves $0.00.' },
  ],
};

describe('starting state', () => {
  it('has nothing recorded and asks for the request first', () => {
    const state = deriveState([], CTX_SEED);
    assert.equal(state.requirement, null);
    assert.deepEqual(state.criteria, []);
    assert.equal(state.nextStep.code, 'record_intent');
    assert.equal(state.summary.line, 'No criteria yet');
    assert.equal(state.app.state, 'defective');
    assert.equal(state.tests[0].runnable.ok, false);
  });

  it('shows a draft requirement with nothing approved and nothing tested', () => {
    const state = logBuilder().propose().state();
    assert.equal(state.requirement.versions.length, 1);
    assert.equal(state.requirement.versions[0].status, 'draft');
    assert.equal(state.nextStep.code, 'approve');
    assert.deepEqual(state.criteria.map((c) => c.status), ['UNTESTED', 'UNTESTED']);
    assert.equal(state.tests[0].runnable.code, 'not_approved');
    assert.equal(criterion(state, 'AC-001').mapping.state, 'matches_test_design');
    assert.equal(criterion(state, 'AC-002').mapping.state, 'none');
  });
});

describe('the demonstration journey', () => {
  it('records a FAIL, keeps it after the repair, and passes the same test on the repaired build', () => {
    const log = logBuilder().propose().approve();
    assert.equal(log.state().tests[0].runnable.ok, true);
    assert.equal(log.state().nextStep.code, 'run');

    log.run({ accepts: true });
    let state = log.state();
    assert.equal(criterion(state, 'AC-001').status, 'FAIL');
    assert.equal(state.nextStep.code, 'repair');
    assert.equal(state.summary.line, '1 of 2 criteria have current evidence');

    log.repair();
    state = log.state(CTX_REPAIRED);
    assert.equal(state.app.state, 'repaired');
    assert.equal(criterion(state, 'AC-001').status, 'UNTESTED', 'the old FAIL is no longer current evidence');
    assert.match(criterion(state, 'AC-001').untestedReason, /historical/);
    assert.equal(state.runs[0].current, false);
    assert.deepEqual(state.runs[0].reasons, ['build_changed']);
    assert.equal(state.runs[0].outcome, 'FAIL', 'but it stays on record as a FAIL');
    assert.match(state.nextStep.text, /again/);

    log.run({ accepts: false, buildDigest: REPAIRED_DIGEST });
    state = log.state(CTX_REPAIRED);
    assert.equal(criterion(state, 'AC-001').status, 'PASS');
    assert.equal(criterion(state, 'AC-002').status, 'UNTESTED');
    assert.equal(state.runs.length, 2);
    assert.equal(state.runs[0].outcome, 'FAIL');
    assert.equal(state.runs[1].outcome, 'PASS');
    assert.equal(state.runs[0].testId, state.runs[1].testId, 'the same test produced both results');
    assert.equal(state.summary.line, '1 of 2 criteria have current evidence');
    assert.match(state.nextStep.text, /AC-002/);
    assert.equal(state.integrityIssues.length, 0);
  });

  it('links every run to the test and the requirement version it ran against', () => {
    const state = logBuilder().propose().approve().run({ accepts: true }).state();
    const [run] = state.runs;
    assert.equal(run.testId, 'TEST-001');
    assert.equal(run.requirementId, 'REQ-001');
    assert.equal(run.requirementVersion, 1);
    assert.equal(run.criterionId, 'AC-001');
    assert.equal(run.buildDigest, SEED_DIGEST);
  });

  it('a rerun on the same build makes a new record and demotes the older one', () => {
    const log = logBuilder().propose().approve().run({ accepts: true }).run({ accepts: true });
    const state = log.state();
    assert.equal(state.runs.length, 2);
    assert.deepEqual(state.runs[0].reasons, ['superseded_by_rerun']);
    assert.equal(state.runs[1].current, true);
    assert.equal(criterion(state, 'AC-001').currentRunId, 'RUN-0002');
  });
});

describe('editing a requirement', () => {
  it('turns earlier evidence historical, even when the criterion wording is untouched', () => {
    const log = logBuilder().propose().approve().run({ accepts: true }).repair().run({ accepts: false, buildDigest: REPAIRED_DIGEST });
    assert.equal(criterion(log.state(CTX_REPAIRED), 'AC-001').status, 'PASS');

    log.edit({
      requirementText: 'A student must never spend more than they have left.',
      criteria: [
        { id: 'AC-001', text: criterion(log.state(CTX_REPAIRED), 'AC-001').text },
        { id: 'AC-002', text: criterion(log.state(CTX_REPAIRED), 'AC-002').text },
      ],
    });
    const state = log.state(CTX_REPAIRED);
    assert.equal(state.requirement.latestVersion, 2);
    assert.equal(state.requirement.versions[0].status, 'approved', 'version 1 stays as it was approved');
    assert.equal(state.requirement.versions[1].status, 'draft');
    assert.equal(criterion(state, 'AC-001').status, 'UNTESTED');
    assert.ok(state.runs.every((run) => !run.current));
    assert.ok(state.runs.every((run) => run.reasons.includes('requirement_changed')));
    assert.equal(state.nextStep.code, 'approve');
    assert.equal(state.tests[0].runnable.code, 'not_approved');
  });

  it('keeps editing a draft in place without making a new version', () => {
    const log = logBuilder().propose().edit(REWORDED);
    const state = log.state();
    assert.equal(state.requirement.versions.length, 1);
    assert.equal(state.requirement.versions[0].requirementText, REWORDED.requirementText);
  });

  it('supersedes version 1 only once version 2 is approved', () => {
    const log = logBuilder().propose().approve().edit(REWORDED);
    assert.equal(log.state().requirement.versions[0].status, 'approved');
    log.approve();
    const versions = log.state().requirement.versions;
    assert.deepEqual(versions.map((v) => v.status), ['superseded', 'approved']);
    assert.equal(versions[1].basedOn, 1);
  });

  it('requires an explicit confirmation before a reworded criterion can use the test', () => {
    const log = logBuilder().propose().approve().edit(REWORDED).approve();
    let state = log.state();
    assert.equal(criterion(state, 'AC-001').mapping.state, 'needs_confirmation');
    assert.equal(state.nextStep.code, 'confirm_mapping');
    assert.equal(state.tests[0].runnable.code, 'mapping_unconfirmed');

    log.confirm('AC-001');
    state = log.state();
    assert.equal(criterion(state, 'AC-001').mapping.state, 'confirmed');
    assert.equal(state.tests[0].runnable.ok, true);
  });

  it('does not carry a confirmation over to different wording', () => {
    const log = logBuilder().propose().approve().edit(REWORDED).approve().confirm('AC-001');
    log.edit({
      requirementText: REWORDED.requirementText,
      criteria: [
        { id: 'AC-001', text: 'Overspending is refused.' },
        REWORDED.criteria[1],
      ],
    });
    assert.equal(criterion(log.state(), 'AC-001').mapping.state, 'needs_confirmation');
  });

  it('treats a change in spacing only as no change in wording', () => {
    const original = logBuilder().propose().state().criteria[0].text;
    const log = logBuilder().propose().edit({
      requirementText: 'A student must not be able to spend more than the budget they have left.',
      criteria: [
        { id: 'AC-001', text: `  ${original.replace(/ /g, '   ')}  ` },
        { id: 'AC-002', text: 'When an expense is exactly equal to the remaining budget, the tracker accepts it and the remaining balance becomes $0.00.' },
      ],
    });
    assert.equal(criterion(log.state(), 'AC-001').mapping.state, 'matches_test_design');
  });
});

describe('a changed app', () => {
  it('turns evidence historical when the code is changed outside SpecLens', () => {
    const log = logBuilder().propose().approve().run({ accepts: false });
    assert.equal(criterion(log.state(), 'AC-001').status, 'PASS');
    const edited = log.state({ ...CTX_SEED, currentBuildDigest: 'f'.repeat(64) });
    assert.equal(edited.app.state, 'modified');
    assert.equal(criterion(edited, 'AC-001').status, 'UNTESTED');
    assert.deepEqual(edited.runs[0].reasons, ['build_changed']);
  });

  it('reports a missing app file', () => {
    const state = logBuilder().state({ ...CTX_SEED, currentBuildDigest: 'missing' });
    assert.equal(state.app.state, 'missing');
  });
});

describe('integrity of the record', () => {
  it('ignores a change to an approved version and reports it', () => {
    const log = logBuilder().propose().approve();
    log.add('draft_edited', { requirementId: 'REQ-001', version: 1, requirementText: 'Sneaky', criteria: REWORDED.criteria });
    const state = log.state();
    assert.notEqual(state.requirement.versions[0].requirementText, 'Sneaky');
    assert.equal(state.integrityIssues[0].code, 'edit_of_non_draft');
  });

  it('ignores an approval whose fingerprint does not match the draft', () => {
    const log = logBuilder().propose();
    log.add('requirement_approved', { requirementId: 'REQ-001', version: 1, digest: 'deadbeef' });
    const state = log.state();
    assert.equal(state.requirement.versions[0].status, 'draft');
    assert.equal(state.integrityIssues[0].code, 'approval_digest_mismatch');
  });

  it('ignores approving a version twice', () => {
    const log = logBuilder().propose().approve();
    const digest = log.state().requirement.versions[0].digest;
    log.add('requirement_approved', { requirementId: 'REQ-001', version: 1, digest });
    assert.equal(log.state().integrityIssues[0].code, 'approval_of_non_draft');
  });

  it('never shows PASS for a stored run whose observations show a failure', () => {
    const log = logBuilder().propose().approve().run({ accepts: true });
    const forged = log.events[log.events.length - 1];
    forged.data.outcome = 'PASS';
    const state = log.state();
    assert.notEqual(criterion(state, 'AC-001').status, 'PASS');
    assert.equal(criterion(state, 'AC-001').status, 'INCONCLUSIVE');
    assert.equal(state.runs[0].cause, 'record_inconsistent');
    assert.equal(state.integrityIssues[0].code, 'run_record_inconsistent');
  });

  it('never shows PASS for a stored run that has no observations', () => {
    const log = logBuilder().propose().approve().run({ accepts: false });
    const stored = log.events[log.events.length - 1];
    delete stored.data.observations;
    assert.notEqual(criterion(log.state(), 'AC-001').status, 'PASS');
  });

  it('never shows PASS when no run exists', () => {
    const state = logBuilder().propose().approve().state();
    assert.ok(state.criteria.every((c) => c.status === 'UNTESTED'));
  });

  it('shows an inconclusive run honestly', () => {
    const log = logBuilder().propose().approve();
    log.add('test_run_recorded', {
      runId: 'RUN-0001',
      testId: 'TEST-001',
      testVersion: 1,
      requirementId: 'REQ-001',
      requirementVersion: 1,
      criterionId: 'AC-001',
      criterionSignature: log.state().criteria[0].signature,
      buildDigest: SEED_DIGEST,
      outcome: 'INCONCLUSIVE',
      cause: 'timeout',
      detail: 'The test did not finish.',
      checks: [],
      observations: null,
    }, 'system');
    const state = log.state();
    assert.equal(criterion(state, 'AC-001').status, 'INCONCLUSIVE');
    assert.equal(state.summary.criteriaWithCurrentEvidence, 0, 'an inconclusive run is not evidence');
    assert.equal(state.nextStep.code, 'rerun');
  });

  it('validates the stored log shape', () => {
    const log = logBuilder().propose().approve();
    assert.equal(validateLog(log.events), null);
    assert.match(validateLog('nope'), /not a list/);
    assert.match(validateLog([{ ...log.events[0], seq: 2 }]), /sequence/);
    assert.match(validateLog([{ ...log.events[0], type: 'made_up' }]), /unknown type/);
    assert.match(validateLog([{ ...log.events[0], at: 'yesterday' }]), /valid time/);
  });
});

describe('build replay', () => {
  const replayCtx = { seedDigest: SEED_DIGEST, repairedDigest: REPAIRED_DIGEST };

  it('has one row per recorded event, in order, and nothing invented', () => {
    const log = logBuilder().propose().approve().run({ accepts: true });
    const replay = buildReplay(log.events, replayCtx);
    assert.equal(replay.items.length, log.events.length);
    assert.deepEqual(replay.items.map((item) => item.eventId), log.events.map((event) => event.id));
    assert.deepEqual(replay.items.map((item) => item.type), log.events.map((event) => event.type));
  });

  it('marks each point where a shown result changed', () => {
    const log = logBuilder().propose().approve().run({ accepts: true }).repair().run({ accepts: false, buildDigest: REPAIRED_DIGEST });
    const replay = buildReplay(log.events, replayCtx);
    const updates = replay.items.flatMap((item) =>
      item.annotations.map((a) => `${item.type}:${a.criterionId}:${a.from}>${a.to}`),
    );
    assert.deepEqual(updates, [
      'test_run_recorded:AC-001:UNTESTED>FAIL',
      'app_repaired:AC-001:FAIL>UNTESTED',
      'test_run_recorded:AC-001:UNTESTED>PASS',
    ]);
  });

  it('lists what is still not proven at the end', () => {
    const log = logBuilder().propose().approve().run({ accepts: true }).repair().run({ accepts: false, buildDigest: REPAIRED_DIGEST });
    const { gaps } = buildReplay(log.events, replayCtx);
    assert.ok(gaps.some((gap) => gap.startsWith('AC-002 is UNTESTED')));
    assert.ok(gaps.some((gap) => /not proof that the whole app is correct/.test(gap)));
  });

  it('is empty for an empty log', () => {
    assert.deepEqual(buildReplay([], replayCtx), { items: [], gaps: [] });
  });

  it('records a requirement edit as a result change for evidence that stops counting', () => {
    const log = logBuilder().propose().approve().run({ accepts: false }).edit(REWORDED);
    const items = buildReplay(log.events, replayCtx).items;
    const last = items[items.length - 1];
    assert.equal(last.type, 'revision_created');
    assert.deepEqual(last.annotations.map((a) => `${a.from}>${a.to}`), ['PASS>UNTESTED']);
  });

  it('keeps the observation helper honest about what each build does', () => {
    assert.equal(observations({ accepts: true }).attempt.result.ok, true);
    assert.equal(observations({ accepts: false }).attempt.result.ok, false);
  });
});
