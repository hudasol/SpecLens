// The only place that changes SpecLens. Every rule is enforced here, so the interface cannot bypass one.
// All changes run one at a time, and each is saved before it is visible.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { INTENT_EXAMPLE, SCENARIO, getTest } from '../domain/catalog.js';
import { sha256, shortDigest } from '../domain/digest.js';
import { classifyRun, inconclusive } from '../domain/evidence.js';
import { makeEvent, runId } from '../domain/events.js';
import { INTERPRETER_ID, interpretIntent } from '../domain/interpreter.js';
import { parseDollarsToCents } from '../domain/money.js';
import { scrubPaths } from '../domain/privacy.js';
import { buildProofMap } from '../domain/proofmap.js';
import { buildReplay } from '../domain/replay.js';
import { LIMITS, contentDigest, validateEdit } from '../domain/requirements.js';
import { deriveState } from '../domain/state.js';
import { DEFAULT_TIMEOUT_MS, executeScenario } from '../runner/execute.js';
import { REPAIR_001, applyRepairToSource, describePatch } from './repair.js';
import { StateFileError, createStore, writeFileAtomic } from './store.js';

export class ServiceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
  }
}

export async function createService({
  dataDir,
  seedPath,
  now = () => new Date(),
  runTimeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const appPath = path.join(dataDir, 'app', 'tracker.mjs');
  const store = createStore(path.join(dataDir, 'state.json'));

  const seedSource = await readFile(seedPath, 'utf8');
  const seedDigest = sha256(seedSource);
  const repaired = applyRepairToSource(seedSource);
  if (!repaired.ok) throw new Error(`The documented repair does not apply to the seed (${repaired.reason}).`);
  const repairedDigest = sha256(repaired.source);

  // The working copy is what tests run against. The seed itself is never executed or changed.
  try {
    await readFile(appPath);
  } catch {
    await writeFileAtomic(appPath, seedSource);
  }
  let events = await store.load();

  // A file can be valid JSON with a valid shape and still be nonsense for SpecLens, for example a run
  // with its checks removed. Find that now, with a clear message, and not on the first request.
  try {
    const ctx = await context();
    deriveState(events, ctx);
    buildReplay(events, ctx);
  } catch {
    throw new StateFileError('The saved state is damaged and cannot be read as a SpecLens record. Run "npm run reset" to start again.');
  }

  let chain = Promise.resolve();
  function exclusive(task) {
    const next = chain.then(task);
    chain = next.catch(() => {});
    return next;
  }

  async function currentDigest() {
    try {
      return sha256(await readFile(appPath, 'utf8'));
    } catch {
      return 'missing';
    }
  }

  async function context() {
    return { currentBuildDigest: await currentDigest(), seedDigest, repairedDigest };
  }

  async function derive() {
    return deriveState(events, await context());
  }

  async function view() {
    const log = events;
    const ctx = await context();
    const state = deriveState(log, ctx);
    return {
      ...state,
      events: log,
      proofMap: buildProofMap(state),
      replay: buildReplay(log, ctx),
      scenario: SCENARIO,
      example: INTENT_EXAMPLE,
      limits: LIMITS,
      interpreter: { id: INTERPRETER_ID, description: 'Offline and rule based. No AI service is called.' },
      repair: {
        id: REPAIR_001.id,
        title: REPAIR_001.title,
        explanation: REPAIR_001.explanation,
        patch: describePatch(),
        applicable: state.app.state === 'defective',
      },
      runner: { timeoutMs: runTimeoutMs },
    };
  }

  async function append(entries) {
    const next = [...events];
    for (const entry of entries) {
      next.push(
        makeEvent({
          seq: next.length + 1,
          type: entry.type,
          data: entry.data,
          at: now().toISOString(),
          actor: entry.actor ?? 'user',
        }),
      );
    }
    await store.save(next); // saved first, so the log in memory never runs ahead of the log on disk
    events = next;
  }

  async function done(result = {}) {
    return { ...result, state: await view() };
  }

  const requireRequirement = (state) => {
    if (!state.requirement) {
      throw new ServiceError('no_requirement', 'There is no requirement yet. Start in Intent Studio.', 409);
    }
    return state.requirement.versions[state.requirement.versions.length - 1];
  };

  return {
    appPath,
    seedDigest,
    repairedDigest,

    getState: () => view(),

    proposeInterpretation: (text) =>
      exclusive(async () => {
        if (events.length > 0) {
          throw new ServiceError(
            'already_started',
            'A request is already recorded. Edit the requirement, or reset the demo to start again.',
            409,
          );
        }
        const result = interpretIntent(text);
        if (!result.ok) throw new ServiceError('invalid_request', result.message, 400);
        if (!result.recognised) {
          return done({ recognised: false, message: result.message, interpreter: result.interpreter });
        }
        await append([
          { type: 'intent_recorded', data: { intentId: result.intent.id, text: result.intent.text }, actor: 'user' },
          {
            type: 'interpretation_proposed',
            data: { intentId: result.intent.id, interpreter: result.interpreter, ...result.proposal },
            actor: 'interpreter',
          },
        ]);
        return done({ recognised: true });
      }),

    editRequirement: (input) =>
      exclusive(async () => {
        const state = await derive();
        const latest = requireRequirement(state);
        const edit = validateEdit(latest, input);
        if (!edit.ok) throw new ServiceError('invalid_request', edit.message, 400);
        if (contentDigest(edit) === contentDigest(latest)) {
          throw new ServiceError('no_change', 'Nothing changed, so no new version was made.', 409);
        }
        const common = {
          requirementId: state.requirement.id,
          requirementText: edit.requirementText,
          criteria: edit.criteria,
        };
        if (latest.status === 'draft') {
          await append([{ type: 'draft_edited', data: { ...common, version: latest.version } }]);
          return done({ version: latest.version, createdNewVersion: false });
        }
        await append([
          {
            type: 'revision_created',
            data: { ...common, fromVersion: latest.version, version: latest.version + 1 },
          },
        ]);
        return done({ version: latest.version + 1, createdNewVersion: true });
      }),

    approveRequirement: () =>
      exclusive(async () => {
        const state = await derive();
        const latest = requireRequirement(state);
        if (latest.status !== 'draft') {
          throw new ServiceError('already_approved', `Version ${latest.version} is already approved. Edit it to make a new version.`, 409);
        }
        await append([
          {
            type: 'requirement_approved',
            data: { requirementId: state.requirement.id, version: latest.version, digest: contentDigest(latest) },
          },
        ]);
        return done({ version: latest.version });
      }),

    confirmMapping: (input) =>
      exclusive(async () => {
        const state = await derive();
        const latest = requireRequirement(state);
        const criterion = state.criteria.find((item) => item.id === input?.criterionId);
        if (!criterion) throw new ServiceError('unknown_criterion', 'That criterion does not exist.', 404);
        if (criterion.mapping.state !== 'needs_confirmation') {
          throw new ServiceError('nothing_to_confirm', `${criterion.id} has no test pairing waiting for confirmation.`, 409);
        }
        await append([
          {
            type: 'mapping_confirmed',
            data: {
              requirementId: state.requirement.id,
              version: latest.version,
              criterionId: criterion.id,
              testId: criterion.mapping.testId,
              criterionSignature: criterion.signature,
            },
          },
        ]);
        return done({ criterionId: criterion.id });
      }),

    runTest: (testId) =>
      exclusive(async () => {
        const test = getTest(testId);
        if (!test) throw new ServiceError('unknown_test', 'That test does not exist.', 404);
        const state = await derive();
        const entry = state.tests.find((item) => item.id === test.id);
        if (!entry.runnable.ok) throw new ServiceError(entry.runnable.code, entry.runnable.reason, 409);
        const criterion = state.criteria.find((item) => item.id === entry.criterionId);

        const startedAt = now().toISOString();
        const digestBefore = await currentDigest();
        const execution = await executeScenario({ appPath, scenario: test.scenario, timeoutMs: runTimeoutMs });
        const digestAfter = await currentDigest();

        // A verdict is only ever computed here, from what the isolated process observed.
        const verdict =
          digestBefore !== digestAfter
            ? inconclusive(test, 'build_changed_during_run', 'The app file changed while the test was running.')
            : classifyRun(test, execution);
        const observations =
          execution.status === 'completed' && execution.report?.ok === true ? execution.report.observations : null;

        const number = events.filter((event) => event.type === 'test_run_recorded').length + 1;
        await append([
          {
            type: 'test_run_recorded',
            actor: 'runner',
            data: {
              runId: runId(number),
              testId: test.id,
              testVersion: test.version,
              requirementId: state.requirement.id,
              requirementVersion: state.requirement.latestVersion,
              criterionId: criterion.id,
              criterionSignature: criterion.signature,
              buildDigest: digestBefore,
              startedAt,
              finishedAt: now().toISOString(),
              durationMs: execution.durationMs ?? null,
              outcome: verdict.outcome,
              cause: verdict.cause,
              detail: scrubPaths(verdict.detail),
              checks: verdict.checks,
              observations,
            },
          },
        ]);
        return done({ runId: runId(number), outcome: verdict.outcome });
      }),

    applyRepair: (repairId) =>
      exclusive(async () => {
        if (repairId !== REPAIR_001.id) throw new ServiceError('unknown_repair', 'That repair does not exist.', 404);
        let source;
        try {
          source = await readFile(appPath, 'utf8');
        } catch {
          throw new ServiceError('app_missing', 'The app file is missing. Reset the demo to restore it.', 409);
        }
        const beforeDigest = sha256(source);
        if (beforeDigest !== seedDigest) {
          throw new ServiceError(
            'repair_not_applicable',
            'The repair only applies to the app exactly as it was seeded. Reset the demo to restore it.',
            409,
          );
        }
        const patched = applyRepairToSource(source);
        if (!patched.ok) throw new ServiceError('repair_not_applicable', `The repair could not be applied (${patched.reason}).`, 409);
        await writeFileAtomic(appPath, patched.source);
        try {
          await append([
            {
              type: 'app_repaired',
              data: {
                repairId: REPAIR_001.id,
                file: REPAIR_001.file,
                beforeDigest,
                afterDigest: sha256(patched.source),
                patch: describePatch(),
              },
            },
          ]);
        } catch (error) {
          await writeFileAtomic(appPath, source); // keep the file and the record in step
          throw error;
        }
        return done({ repairId: REPAIR_001.id });
      }),

    reset: () =>
      exclusive(async () => {
        await writeFileAtomic(appPath, seedSource);
        await store.save([]);
        events = [];
        return done({ reset: true });
      }),

    // A hands on try of the app. It is not evidence: nothing is recorded and no result changes.
    probeAttempt: (input) =>
      exclusive(async () => {
        const amountCents =
          typeof input?.amount === 'string' ? parseDollarsToCents(input.amount) : null;
        if (amountCents === null || amountCents < 1) {
          throw new ServiceError('invalid_request', 'Enter an amount in dollars, such as 25 or 25.50.', 400);
        }
        const scenario = { ...SCENARIO, attempt: { label: 'Hands on expense', amountCents } };
        const execution = await executeScenario({ appPath, scenario, timeoutMs: runTimeoutMs });
        const digest = await currentDigest();
        if (execution.status !== 'completed' || execution.report?.ok !== true) {
          return {
            recorded: false,
            ok: false,
            detail: scrubPaths(execution.detail ?? execution.report?.error ?? 'The app did not answer.'),
            build: shortDigest(digest),
            state: await view(),
          };
        }
        const { before, attempt, after } = execution.report.observations;
        return {
          recorded: false,
          ok: true,
          build: shortDigest(digest),
          attemptCents: amountCents,
          remainingBeforeCents: before.remainingCents,
          remainingAfterCents: after.remainingCents,
          historyBefore: before.history.length,
          historyAfter: after.history.length,
          result: attempt.result,
          state: await view(),
        };
      }),
  };
}
