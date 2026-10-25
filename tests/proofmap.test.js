import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildProofMap } from '../src/domain/proofmap.js';
import { CTX_REPAIRED, CTX_SEED, REPAIRED_DIGEST, logBuilder } from './fixtures.js';

const REWORDED = {
  requirementText: 'A student must never go over the budget they have left.',
  criteria: [
    { id: 'AC-001', text: 'An expense bigger than the money left is refused and nothing else changes.' },
    { id: 'AC-002', text: 'An expense equal to the money left is accepted and leaves $0.00.' },
  ],
};

const chain = (map, id) => map.find((item) => item.criterionId === id);
const ids = (item) => item.nodes.map((node) => node.id);

describe('proof map chains', () => {
  it('has nothing to show before a requirement exists', () => {
    assert.deepEqual(buildProofMap(logBuilder().state()), []);
    assert.deepEqual(buildProofMap(logBuilder().propose().state()).length, 2);
  });

  it('links request, requirement, criterion, test, current run and explanation for a tested criterion', () => {
    const log = logBuilder().propose().approve().run({ accepts: true }).repair().run({ accepts: false, buildDigest: REPAIRED_DIGEST });
    const map = buildProofMap(log.state(CTX_REPAIRED));
    assert.deepEqual(ids(chain(map, 'AC-001')), ['INT-001', 'REQ-001', 'AC-001', 'TEST-001', 'RUN-0002', 'EXPL-AC-001']);
    const run = chain(map, 'AC-001').nodes[4];
    assert.deepEqual(run.badge, { type: 'status', value: 'PASS' });
    assert.equal(chain(map, 'AC-001').status, 'PASS');
  });

  it('keeps the earlier failing run on the chain as historical, with the reason', () => {
    const log = logBuilder().propose().approve().run({ accepts: true }).repair().run({ accepts: false, buildDigest: REPAIRED_DIGEST });
    const earlier = chain(buildProofMap(log.state(CTX_REPAIRED)), 'AC-001').earlierRuns;
    assert.equal(earlier.length, 1);
    assert.equal(earlier[0].runId, 'RUN-0001');
    assert.equal(earlier[0].outcome, 'FAIL');
    assert.ok(earlier[0].reasons.some((reason) => /app code is different/.test(reason)));
  });

  it('shows a criterion with no test as UNTESTED, with placeholders and no run', () => {
    const log = logBuilder().propose().approve().run({ accepts: true }).repair().run({ accepts: false, buildDigest: REPAIRED_DIGEST });
    const untested = chain(buildProofMap(log.state(CTX_REPAIRED)), 'AC-002');
    assert.deepEqual(ids(untested), ['INT-001', 'REQ-001', 'AC-002', 'NOTEST-AC-002', 'NORUN-AC-002', 'EXPL-AC-002']);
    assert.equal(untested.status, 'UNTESTED');
    assert.deepEqual(untested.nodes[5].badge, { type: 'status', value: 'UNTESTED' });
    assert.deepEqual(untested.earlierRuns, []);
  });

  it('stops showing a run as current evidence once the requirement is edited', () => {
    const log = logBuilder().propose().approve().run({ accepts: false }).edit(REWORDED);
    const map = buildProofMap(log.state());
    const tested = chain(map, 'AC-001');
    assert.equal(tested.nodes[4].id, 'NORUN-AC-001');
    assert.equal(tested.status, 'UNTESTED');
    assert.deepEqual(tested.earlierRuns.map((run) => run.runId), ['RUN-0001']);
    assert.equal(tested.nodes[1].title, 'REQ-001 version 2');
    assert.deepEqual(tested.nodes[1].badge, { type: 'chip', value: 'draft' });
  });

  it('shows the verified outcome for a stored run that does not match its own observations', () => {
    const log = logBuilder().propose().approve().run({ accepts: true });
    log.events[log.events.length - 1].data.outcome = 'PASS';
    const tested = chain(buildProofMap(log.state()), 'AC-001');
    assert.equal(tested.status, 'INCONCLUSIVE');
    assert.deepEqual(tested.nodes[4].badge, { type: 'status', value: 'INCONCLUSIVE' });
  });

  it('never presents a pass as current for the wrong build', () => {
    const log = logBuilder().propose().approve().run({ accepts: false, buildDigest: REPAIRED_DIGEST });
    const tested = chain(buildProofMap(log.state(CTX_SEED)), 'AC-001');
    assert.equal(tested.status, 'UNTESTED');
    assert.equal(tested.nodes[4].id, 'NORUN-AC-001');
  });
});
