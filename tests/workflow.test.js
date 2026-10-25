import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { sha256 } from '../src/domain/digest.js';
import { INTENT_EXAMPLE } from '../src/domain/catalog.js';
import { ServiceError, createService } from '../src/services/speclens-service.js';
import { SEED_PATH, readSeed, tempDir } from './helpers.js';

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 9, 25, 12, 0, tick++));

async function newService(options = {}) {
  const dataDir = await tempDir('speclens-data-');
  const service = await createService({ dataDir, seedPath: SEED_PATH, now: clock, ...options });
  return { service, dataDir };
}

const criterion = (state, id) => state.criteria.find((item) => item.id === id);

async function expectRejected(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ServiceError, `expected a ServiceError, got ${error}`);
    assert.equal(error.code, code);
    return true;
  });
}

const REWORDED = {
  requirementText: 'A student must never go over the budget they have left.',
  criteria: [
    { id: 'AC-001', text: 'An expense bigger than the money left is refused and nothing else changes.' },
    { id: 'AC-002', text: 'An expense equal to the money left is accepted and leaves $0.00.' },
  ],
};

async function approvedService(options) {
  const made = await newService(options);
  await made.service.proposeInterpretation(INTENT_EXAMPLE);
  await made.service.approveRequirement();
  return made;
}

describe('the full journey through the service', () => {
  it('runs request, requirement, approval, FAIL, repair and PASS, and keeps the FAIL on record', async () => {
    const { service } = await newService();

    let { state } = await service.proposeInterpretation(INTENT_EXAMPLE);
    assert.equal(state.intent.text, INTENT_EXAMPLE);
    assert.equal(state.requirement.versions[0].status, 'draft');

    ({ state } = await service.approveRequirement());
    assert.equal(state.requirement.versions[0].status, 'approved');
    assert.equal(state.tests[0].runnable.ok, true);

    let run = await service.runTest('TEST-001');
    assert.equal(run.outcome, 'FAIL');
    assert.equal(run.runId, 'RUN-0001');
    assert.equal(criterion(run.state, 'AC-001').status, 'FAIL');
    assert.equal(run.state.app.state, 'defective');

    const repaired = await service.applyRepair('REPAIR-001');
    assert.equal(repaired.state.app.state, 'repaired');
    assert.equal(criterion(repaired.state, 'AC-001').status, 'UNTESTED');
    assert.equal(repaired.state.runs[0].current, false);
    assert.equal(repaired.state.runs[0].outcome, 'FAIL');

    run = await service.runTest('TEST-001');
    assert.equal(run.outcome, 'PASS');
    assert.equal(run.runId, 'RUN-0002');
    assert.equal(criterion(run.state, 'AC-001').status, 'PASS');
    assert.equal(criterion(run.state, 'AC-002').status, 'UNTESTED');
    assert.deepEqual(run.state.runs.map((r) => [r.id, r.outcome, r.current]), [
      ['RUN-0001', 'FAIL', false],
      ['RUN-0002', 'PASS', true],
    ]);
    assert.equal(run.state.runs[0].testId, run.state.runs[1].testId);
    assert.equal(run.state.integrityIssues.length, 0);
    assert.deepEqual(
      run.state.replay.items.map((item) => item.type),
      [
        'intent_recorded',
        'interpretation_proposed',
        'requirement_approved',
        'test_run_recorded',
        'app_repaired',
        'test_run_recorded',
      ],
    );
  });

  it('really changes the app file when the repair is applied', async () => {
    const { service } = await approvedService();
    const before = sha256(await readFile(service.appPath, 'utf8'));
    assert.equal(before, service.seedDigest);
    await service.applyRepair('REPAIR-001');
    const after = sha256(await readFile(service.appPath, 'utf8'));
    assert.equal(after, service.repairedDigest);
    assert.notEqual(before, after);
  });

  it('never changes the pristine seed file', async () => {
    const seedBefore = await readSeed();
    const { service } = await approvedService();
    await service.runTest('TEST-001');
    await service.applyRepair('REPAIR-001');
    await service.runTest('TEST-001');
    await service.reset();
    assert.equal(await readSeed(), seedBefore);
  });
});

describe('a checkout with Windows line endings', () => {
  it('starts, fails, repairs and passes the same way', async () => {
    const folder = await tempDir('speclens-crlf-');
    const seedPath = path.join(folder, 'tracker.defective.js');
    await writeFile(seedPath, (await readSeed()).replace(/\r?\n/g, '\r\n'));
    const dataDir = await tempDir('speclens-data-');
    const service = await createService({ dataDir, seedPath, now: clock });

    await service.proposeInterpretation(INTENT_EXAMPLE);
    await service.approveRequirement();
    assert.equal((await service.runTest('TEST-001')).outcome, 'FAIL');
    const repaired = await service.applyRepair('REPAIR-001');
    assert.equal(repaired.state.app.state, 'repaired');
    assert.equal((await service.runTest('TEST-001')).outcome, 'PASS');
  });
});

describe('reset', () => {
  it('restores the seeded state exactly, so a second run starts from the same place', async () => {
    const fresh = await newService();
    const baseline = await fresh.service.getState();

    const { service } = await approvedService();
    await service.runTest('TEST-001');
    await service.applyRepair('REPAIR-001');
    await service.runTest('TEST-001');

    const { state } = await service.reset();
    assert.deepEqual(state, baseline);
    assert.equal(state.app.state, 'defective');
    assert.equal(sha256(await readFile(service.appPath, 'utf8')), service.seedDigest);

    // and the whole journey gives the same results again
    await service.proposeInterpretation(INTENT_EXAMPLE);
    await service.approveRequirement();
    assert.equal((await service.runTest('TEST-001')).outcome, 'FAIL');
    await service.applyRepair('REPAIR-001');
    assert.equal((await service.runTest('TEST-001')).outcome, 'PASS');
  });

  it('also restores an app file that someone edited by hand', async () => {
    const { service } = await approvedService();
    await writeFile(service.appPath, '// tampered\n');
    assert.equal((await service.getState()).app.state, 'modified');
    await service.reset();
    assert.equal((await service.getState()).app.state, 'defective');
  });
});

describe('persistence', () => {
  it('reloads the same record from disk', async () => {
    const { service, dataDir } = await approvedService();
    await service.runTest('TEST-001');
    const before = await service.getState();

    const again = await createService({ dataDir, seedPath: SEED_PATH, now: clock });
    const after = await again.getState();
    assert.deepEqual(after.events, before.events);
    assert.deepEqual(after.runs, before.runs);
    assert.equal(criterion(after, 'AC-001').status, 'FAIL');
  });

  it('refuses to start on a damaged state file instead of guessing', async () => {
    const { dataDir } = await approvedService();
    await writeFile(path.join(dataDir, 'state.json'), '{ not json');
    await assert.rejects(createService({ dataDir, seedPath: SEED_PATH }), /not valid JSON/);
    await writeFile(path.join(dataDir, 'state.json'), JSON.stringify({ events: [{ seq: 5 }] }));
    await assert.rejects(createService({ dataDir, seedPath: SEED_PATH }), /damaged/);
  });

  it('shows a hand edited PASS as inconclusive rather than believing it', async () => {
    const { service, dataDir } = await approvedService();
    await service.runTest('TEST-001');
    const file = path.join(dataDir, 'state.json');
    const saved = JSON.parse(await readFile(file, 'utf8'));
    saved.events.at(-1).data.outcome = 'PASS';
    await writeFile(file, JSON.stringify(saved));

    const again = await createService({ dataDir, seedPath: SEED_PATH });
    const state = await again.getState();
    assert.notEqual(criterion(state, 'AC-001').status, 'PASS');
    assert.equal(state.integrityIssues[0].code, 'run_record_inconsistent');
  });
});

describe('rules the service enforces', () => {
  it('will not run a test before a requirement is approved', async () => {
    const empty = await newService();
    await expectRejected(empty.service.runTest('TEST-001'), 'no_requirement');

    const drafted = await newService();
    await drafted.service.proposeInterpretation(INTENT_EXAMPLE);
    await expectRejected(drafted.service.runTest('TEST-001'), 'not_approved');
  });

  it('will not run an unknown test', async () => {
    const { service } = await approvedService();
    await expectRejected(service.runTest('TEST-999'), 'unknown_test');
  });

  it('will not approve twice, or approve nothing', async () => {
    const empty = await newService();
    await expectRejected(empty.service.approveRequirement(), 'no_requirement');
    const { service } = await approvedService();
    await expectRejected(service.approveRequirement(), 'already_approved');
  });

  it('will not start a second request over the first', async () => {
    const { service } = await approvedService();
    await expectRejected(service.proposeInterpretation(INTENT_EXAMPLE), 'already_started');
  });

  it('records nothing for a request it does not recognise, and says so', async () => {
    const { service } = await newService();
    const result = await service.proposeInterpretation('Make it faster.');
    assert.equal(result.recognised, false);
    assert.match(result.message, /only recognises/);
    assert.equal(result.state.eventCount, 0);
    await expectRejected(service.proposeInterpretation('   '), 'invalid_request');
  });

  it('will not apply the repair twice, to a changed app, or under another name', async () => {
    const { service } = await approvedService();
    await expectRejected(service.applyRepair('REPAIR-999'), 'unknown_repair');
    await service.applyRepair('REPAIR-001');
    await expectRejected(service.applyRepair('REPAIR-001'), 'repair_not_applicable');

    const other = await approvedService();
    await writeFile(other.service.appPath, '// tampered\n');
    await expectRejected(other.service.applyRepair('REPAIR-001'), 'repair_not_applicable');
  });

  it('does not let a change the user made to the app pass as the earlier build', async () => {
    const { service } = await approvedService();
    assert.equal((await service.runTest('TEST-001')).outcome, 'FAIL');
    const source = await readFile(service.appPath, 'utf8');
    await writeFile(service.appPath, `${source}\n// a harmless comment\n`);
    const state = await service.getState();
    assert.equal(state.app.state, 'modified');
    assert.equal(criterion(state, 'AC-001').status, 'UNTESTED');
    assert.deepEqual(state.runs[0].reasons, ['build_changed']);
  });

  it('serialises overlapping changes so no event is lost or duplicated', async () => {
    const { service } = await approvedService();
    await Promise.all([service.runTest('TEST-001'), service.runTest('TEST-001'), service.runTest('TEST-001')]);
    const state = await service.getState();
    assert.deepEqual(state.runs.map((run) => run.id), ['RUN-0001', 'RUN-0002', 'RUN-0003']);
    // three events from the request and approval, then one per run
    assert.deepEqual(state.events.map((event) => event.seq), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(state.runs.map((run) => run.current), [false, false, true]);
  });
});

describe('editing and approving versions', () => {
  it('turns evidence historical and needs a new approval after an edit', async () => {
    const { service } = await approvedService();
    await service.applyRepair('REPAIR-001');
    await service.runTest('TEST-001');
    assert.equal(criterion(await service.getState(), 'AC-001').status, 'PASS');

    const original = (await service.getState()).criteria;
    const edited = await service.editRequirement({
      requirementText: 'A student must never spend more than they have left.',
      criteria: original.map(({ id, text }) => ({ id, text })),
    });
    assert.equal(edited.createdNewVersion, true);
    assert.equal(edited.version, 2);
    assert.equal(criterion(edited.state, 'AC-001').status, 'UNTESTED');
    assert.equal(edited.state.runs[0].current, false);
    assert.equal(edited.state.requirement.versions[0].status, 'approved');
    await expectRejected(service.runTest('TEST-001'), 'not_approved');

    const approved = await service.approveRequirement();
    assert.equal(approved.state.requirement.versions[0].status, 'superseded');
    const rerun = await service.runTest('TEST-001');
    assert.equal(rerun.outcome, 'PASS');
    assert.equal(rerun.state.runs.at(-1).requirementVersion, 2);
    assert.equal(rerun.state.runs[0].requirementVersion, 1);
  });

  it('edits a draft in place, and refuses an edit that changes nothing', async () => {
    const { service } = await newService();
    await service.proposeInterpretation(INTENT_EXAMPLE);
    const state = await service.getState();
    const same = { requirementText: state.requirement.versions[0].requirementText, criteria: state.criteria.map(({ id, text }) => ({ id, text })) };
    await expectRejected(service.editRequirement(same), 'no_change');
    const result = await service.editRequirement(REWORDED);
    assert.equal(result.createdNewVersion, false);
    assert.equal(result.state.requirement.versions.length, 1);
  });

  it('refuses edits with missing, extra or empty criteria', async () => {
    const { service } = await newService();
    await expectRejected(service.editRequirement(REWORDED), 'no_requirement');
    await service.proposeInterpretation(INTENT_EXAMPLE);
    await expectRejected(service.editRequirement({ ...REWORDED, criteria: [REWORDED.criteria[0]] }), 'invalid_request');
    await expectRejected(service.editRequirement({ ...REWORDED, requirementText: '' }), 'invalid_request');
    await expectRejected(service.editRequirement(null), 'invalid_request');
  });

  it('keeps the test locked until the reworded criterion is confirmed', async () => {
    const { service } = await approvedService();
    await service.editRequirement(REWORDED);
    await service.approveRequirement();
    await expectRejected(service.runTest('TEST-001'), 'mapping_unconfirmed');
    await expectRejected(service.confirmMapping({ criterionId: 'AC-002' }), 'nothing_to_confirm');
    await expectRejected(service.confirmMapping({ criterionId: 'AC-009' }), 'unknown_criterion');

    const confirmed = await service.confirmMapping({ criterionId: 'AC-001' });
    assert.equal(criterion(confirmed.state, 'AC-001').mapping.state, 'confirmed');
    assert.equal((await service.runTest('TEST-001')).outcome, 'FAIL');
    await expectRejected(service.confirmMapping({ criterionId: 'AC-001' }), 'nothing_to_confirm');
  });
});

describe('integrity checks made by the service itself', () => {
  it('records INCONCLUSIVE, with a cause, when the app breaks', async () => {
    const { service } = await approvedService();
    await writeFile(service.appPath, "export function createTracker() { throw new Error('broken app'); }\n");
    const run = await service.runTest('TEST-001');
    assert.equal(run.outcome, 'INCONCLUSIVE');
    const record = run.state.runs[0];
    assert.equal(record.cause, 'setup_error');
    assert.match(record.detail, /broken app/);
    assert.equal(criterion(run.state, 'AC-001').status, 'INCONCLUSIVE');
    assert.equal(run.state.summary.criteriaWithCurrentEvidence, 0);
  });

  it('records INCONCLUSIVE when the app hangs', async () => {
    const { service } = await approvedService({ runTimeoutMs: 500 });
    await writeFile(service.appPath, 'export function createTracker() { for (;;) {} }\n');
    const run = await service.runTest('TEST-001');
    assert.equal(run.outcome, 'INCONCLUSIVE');
    assert.equal(run.state.runs[0].cause, 'timeout');
  });

  it('records INCONCLUSIVE when the app file is missing', async () => {
    const { service } = await approvedService();
    await import('node:fs/promises').then(({ rm }) => rm(service.appPath));
    const run = await service.runTest('TEST-001');
    assert.equal(run.outcome, 'INCONCLUSIVE');
    assert.equal(run.state.runs[0].buildDigest, 'missing');
    assert.equal(run.state.app.state, 'missing');
  });

  it('keeps an inconclusive run on record and lets a later run replace it', async () => {
    const { service } = await approvedService();
    const seed = await readSeed();
    await writeFile(service.appPath, 'export const nothing = 1;\n');
    assert.equal((await service.runTest('TEST-001')).outcome, 'INCONCLUSIVE');
    await writeFile(service.appPath, seed);
    const second = await service.runTest('TEST-001');
    assert.equal(second.outcome, 'FAIL');
    assert.deepEqual(second.state.runs.map((run) => [run.outcome, run.current]), [
      ['INCONCLUSIVE', false],
      ['FAIL', true],
    ]);
  });
});

describe('the hands-on probe', () => {
  it('shows what the app does and records nothing', async () => {
    const { service } = await approvedService();
    const before = await service.getState();

    const defective = await service.probeAttempt({ amount: '25' });
    assert.equal(defective.recorded, false);
    assert.equal(defective.ok, true);
    assert.equal(defective.result.ok, true, 'the seeded build accepts the overspend');
    assert.equal(defective.remainingAfterCents, -500);

    await service.applyRepair('REPAIR-001');
    const repaired = await service.probeAttempt({ amount: '25.00' });
    assert.equal(repaired.result.ok, false);
    assert.equal(repaired.remainingAfterCents, 2000);
    const exact = await service.probeAttempt({ amount: '20' });
    assert.equal(exact.result.ok, true, 'exactly the remaining amount is allowed');

    const after = await service.getState();
    assert.equal(after.runs.length, before.runs.length);
    assert.equal(after.events.filter((event) => event.type === 'test_run_recorded').length, 0);
    assert.equal(criterion(after, 'AC-002').status, 'UNTESTED', 'trying it by hand is not evidence');
  });

  it('refuses amounts that are not plain dollars', async () => {
    const { service } = await newService();
    for (const bad of ['abc', '-5', '0', '', '1.234', 25, null]) {
      await expectRejected(service.probeAttempt({ amount: bad }), 'invalid_request');
    }
  });

  it('reports an app that breaks, without recording anything', async () => {
    const { service } = await newService();
    await writeFile(service.appPath, "export function createTracker() { throw new Error('nope'); }\n");
    const result = await service.probeAttempt({ amount: '25' });
    assert.equal(result.ok, false);
    assert.equal(result.recorded, false);
    assert.equal(result.state.eventCount, 0);
  });
});
