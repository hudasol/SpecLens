// Builders for the in memory records the domain tests need. Nothing here touches disk.

import { INTENT_EXAMPLE, SCENARIO, TEST_001 } from '../src/domain/catalog.js';
import { sha256 } from '../src/domain/digest.js';
import { classifyRun } from '../src/domain/evidence.js';
import { makeEvent, runId } from '../src/domain/events.js';
import { interpretIntent } from '../src/domain/interpreter.js';
import { contentDigest } from '../src/domain/requirements.js';
import { deriveState } from '../src/domain/state.js';

export const SEED_DIGEST = sha256('seed build');
export const REPAIRED_DIGEST = sha256('repaired build');
export const CTX_SEED = { currentBuildDigest: SEED_DIGEST, seedDigest: SEED_DIGEST, repairedDigest: REPAIRED_DIGEST };
export const CTX_REPAIRED = { ...CTX_SEED, currentBuildDigest: REPAIRED_DIGEST };

const entry = (id, label, amountCents) => ({ id, label, amountCents });

// What the isolated process reports for the demo scenario, for a build that accepts or rejects the overspend.
export function observations({ accepts }) {
  const seeded = [entry('E1', 'Textbooks', 5000), entry('E2', 'Groceries', 3000)];
  const before = { budgetCents: 10000, spentCents: 8000, remainingCents: 2000, history: seeded };
  const attemptResult = accepts
    ? { ok: true, expense: entry('E3', 'Concert ticket', 2500) }
    : { ok: false, reason: 'exceeds_remaining_budget' };
  const after = accepts
    ? { budgetCents: 10000, spentCents: 10500, remainingCents: -500, history: [...seeded, entry('E3', 'Concert ticket', 2500)] }
    : { ...before, history: seeded.map((item) => ({ ...item })) };
  return {
    seed: SCENARIO.seed.map((item, index) => ({ ...item, result: { ok: true, expense: seeded[index] } })),
    before,
    attempt: { ...SCENARIO.attempt, result: attemptResult },
    after,
  };
}

export const completed = (obs) => ({ status: 'completed', report: { ok: true, observations: obs } });

export function classifyObservations(obs) {
  return classifyRun(TEST_001, completed(obs));
}

// Appends events with fixed, increasing times so every test sees the same log.
export function logBuilder() {
  const events = [];
  const add = (type, data, actor = 'user') => {
    events.push(
      makeEvent({
        seq: events.length + 1,
        type,
        data,
        at: new Date(Date.UTC(2026, 9, 25, 12, 0, events.length)).toISOString(),
        actor,
      }),
    );
    return events;
  };
  const state = (ctx = CTX_SEED) => deriveState(events, ctx);
  const latest = (ctx = CTX_SEED) => {
    const current = state(ctx).requirement;
    return current.versions[current.versions.length - 1];
  };

  const api = {
    events,
    add,
    state,
    propose() {
      const result = interpretIntent(INTENT_EXAMPLE);
      add('intent_recorded', { intentId: result.intent.id, text: result.intent.text });
      add('interpretation_proposed', {
        intentId: result.intent.id,
        interpreter: result.interpreter,
        ...result.proposal,
      }, 'system');
      return api;
    },
    approve() {
      const version = latest();
      add('requirement_approved', {
        requirementId: 'REQ-001',
        version: version.version,
        digest: contentDigest(version),
      });
      return api;
    },
    // Edits the latest version, as the service would: in place for a draft, a new version after approval.
    edit({ requirementText, criteria }) {
      const version = latest();
      if (version.status === 'draft') {
        add('draft_edited', { requirementId: 'REQ-001', version: version.version, requirementText, criteria });
      } else {
        add('revision_created', {
          requirementId: 'REQ-001',
          fromVersion: version.version,
          version: version.version + 1,
          requirementText,
          criteria,
        });
      }
      return api;
    },
    confirm(criterionId = 'AC-001') {
      const version = latest();
      const criterion = version.criteria.find((item) => item.id === criterionId);
      add('mapping_confirmed', {
        requirementId: 'REQ-001',
        version: version.version,
        criterionId,
        testId: criterion.testId,
        criterionSignature: criterion.signature,
      });
      return api;
    },
    run({ accepts, buildDigest = SEED_DIGEST, version, criterionId = 'AC-001' }) {
      const target = latest();
      const criterion = target.criteria.find((item) => item.id === criterionId);
      const obs = observations({ accepts });
      const verdict = classifyObservations(obs);
      const count = events.filter((event) => event.type === 'test_run_recorded').length + 1;
      add('test_run_recorded', {
        runId: runId(count),
        testId: 'TEST-001',
        testVersion: 1,
        requirementId: 'REQ-001',
        requirementVersion: version ?? target.version,
        criterionId,
        criterionSignature: criterion.signature,
        buildDigest,
        startedAt: '2026-10-25T12:00:00.000Z',
        finishedAt: '2026-10-25T12:00:00.050Z',
        durationMs: 50,
        outcome: verdict.outcome,
        cause: verdict.cause,
        detail: verdict.detail,
        checks: verdict.checks,
        observations: obs,
      }, 'system');
      return api;
    },
    repair() {
      add('app_repaired', {
        repairId: 'REPAIR-001',
        file: 'tracker.mjs',
        beforeDigest: SEED_DIGEST,
        afterDigest: REPAIRED_DIGEST,
      });
      return api;
    },
  };
  return api;
}
