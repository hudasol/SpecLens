// Everything the interface shows is folded from the event log, in order. Nothing is stored twice.

import { shortDigest } from './digest.js';
import { REQUIREMENT_ID, TESTS, getTest } from './catalog.js';
import {
  CAUSE_LABELS,
  REASON_LABELS,
  assessRuns,
  deriveCriterionStatus,
  explainRun,
  verifyRecordedRun,
} from './evidence.js';
import { contentDigest, withSignature } from './requirements.js';

function buildCriteria(list, previous = []) {
  return list.map((item) => {
    const earlier = previous.find((criterion) => criterion.id === item.id);
    const testId = item.testId !== undefined ? item.testId : (earlier?.testId ?? null);
    return withSignature({ id: item.id, text: item.text, testId });
  });
}

function mappingFor(criterion, confirmations) {
  if (!criterion.testId) return { state: 'none', testId: null, usable: false };
  const test = getTest(criterion.testId);
  if (!test) return { state: 'none', testId: criterion.testId, usable: false };
  if (test.designedForSignature === criterion.signature) {
    return { state: 'matches_test_design', testId: test.id, usable: true };
  }
  const confirmed = confirmations.some(
    (item) =>
      item.criterionId === criterion.id &&
      item.testId === criterion.testId &&
      item.criterionSignature === criterion.signature,
  );
  return { state: confirmed ? 'confirmed' : 'needs_confirmation', testId: test.id, usable: confirmed };
}

function runnableGate(latest, criterion) {
  if (!latest) {
    return { ok: false, code: 'no_requirement', reason: 'Record a request and approve a requirement in Intent Studio first.' };
  }
  if (latest.status !== 'approved') {
    return {
      ok: false,
      code: 'not_approved',
      reason: `Requirement version ${latest.version} is a draft. Approve it in Intent Studio before running tests.`,
    };
  }
  if (!criterion) {
    return { ok: false, code: 'no_criterion', reason: 'No criterion in the current requirement is mapped to this test.' };
  }
  if (!criterion.mapping.usable) {
    return {
      ok: false,
      code: 'mapping_unconfirmed',
      reason: `${criterion.id} was reworded. Confirm in Intent Studio that this test still checks it.`,
    };
  }
  return { ok: true, code: 'ready', reason: null };
}

function untestedReason(criterion, latest, historicalRuns) {
  if (!criterion.testId) return 'No SpecLens test is mapped to this criterion, so nothing was run for it.';
  if (criterion.mapping.state === 'needs_confirmation') {
    return 'The wording changed. Confirm the test mapping, then run the test.';
  }
  if (latest.status !== 'approved') return 'The requirement is a draft. Approve it, then run the test.';
  if (historicalRuns.length > 0) {
    const last = historicalRuns[historicalRuns.length - 1];
    const why = last.reasons.map((reason) => REASON_LABELS[reason]).join(' ');
    return `Earlier evidence exists but is historical. ${why} Run the test again.`;
  }
  return 'The test has not been run yet.';
}

function appBlock(ctx, repairs) {
  const { currentBuildDigest, seedDigest, repairedDigest } = ctx;
  let state = 'modified';
  let label = 'Modified outside SpecLens';
  if (currentBuildDigest === seedDigest) {
    state = 'defective';
    label = 'Seeded defect present';
  } else if (currentBuildDigest === repairedDigest) {
    state = 'repaired';
    label = 'Repaired by REPAIR-001';
  } else if (currentBuildDigest === 'missing') {
    state = 'missing';
    label = 'App file missing';
  }
  return {
    state,
    label,
    digest: currentBuildDigest,
    shortDigest: shortDigest(currentBuildDigest),
    seedDigest,
    repairedDigest,
    repairs,
  };
}

function nextStepFor({ intent, latest, criteria, app }) {
  if (!intent || !latest) {
    return {
      code: 'record_intent',
      view: 'intent',
      text: 'Write the request in Intent Studio and ask for a proposed requirement.',
    };
  }
  if (latest.status === 'draft') {
    return {
      code: 'approve',
      view: 'intent',
      text: `Review requirement version ${latest.version}, then approve it.`,
    };
  }
  const pending = criteria.find((criterion) => criterion.mapping.state === 'needs_confirmation');
  if (pending) {
    return {
      code: 'confirm_mapping',
      view: 'intent',
      text: `Confirm that ${pending.mapping.testId} still checks the reworded ${pending.id}.`,
    };
  }
  const target = criteria.find((criterion) => criterion.testId && criterion.mapping.usable);
  if (!target) {
    return { code: 'no_tests', view: 'map', text: 'No criterion has a test. Open the Proof Map to see the gaps.' };
  }
  switch (target.status) {
    case 'UNTESTED':
      return {
        code: 'run',
        view: 'lab',
        text:
          target.historicalRunIds.length > 0
            ? `Run ${target.testId} again. Earlier evidence for ${target.id} is historical.`
            : `Run ${target.testId} in Evidence Lab.`,
      };
    case 'FAIL':
      return app.state === 'defective'
        ? {
            code: 'repair',
            view: 'lab',
            text: `${target.testId} failed. Review the documented repair, apply it, then run the same test again.`,
          }
        : {
            code: 'rerun',
            view: 'lab',
            text: `${target.testId} failed on this build. Change the app, then run the same test again.`,
          };
    case 'INCONCLUSIVE':
      return {
        code: 'rerun',
        view: 'lab',
        text: `The last run of ${target.testId} was inconclusive. Read the cause, then run it again.`,
      };
    default: {
      const gaps = criteria.filter((criterion) => criterion.status !== 'PASS').map((criterion) => criterion.id);
      return {
        code: 'review',
        view: 'map',
        text:
          gaps.length > 0
            ? `${target.id} passed. ${gaps.join(', ')} still has no passing evidence. Open the Proof Map to inspect the chain.`
            : 'Every criterion has passing evidence. Open the Proof Map to inspect the chain.',
      };
    }
  }
}

// ctx: { currentBuildDigest, seedDigest, repairedDigest }
export function deriveState(events, ctx) {
  const issues = [];
  let intent = null;
  let interpretation = null;
  const versions = [];
  const confirmations = [];
  const recorded = [];
  const repairs = [];

  const findVersion = (number) => versions.find((version) => version.version === number);

  for (const event of events) {
    const data = event.data ?? {};
    switch (event.type) {
      case 'intent_recorded':
        intent = { id: data.intentId, text: data.text, recordedAt: event.at, eventId: event.id };
        break;
      case 'interpretation_proposed':
        interpretation = {
          intentId: data.intentId,
          interpreter: data.interpreter,
          proposedAt: event.at,
          eventId: event.id,
        };
        versions.push({
          version: data.version,
          status: 'draft',
          requirementText: data.requirementText,
          criteria: buildCriteria(data.criteria),
          createdAt: event.at,
          createdBy: data.interpreter,
          basedOn: null,
          approvedAt: null,
          digest: null,
          eventId: event.id,
        });
        break;
      case 'draft_edited': {
        const version = findVersion(data.version);
        if (!version || version.status !== 'draft') {
          issues.push({ code: 'edit_of_non_draft', eventId: event.id, message: `${event.id} tried to change a version that is not a draft. It was ignored.` });
          break;
        }
        version.requirementText = data.requirementText;
        version.criteria = buildCriteria(data.criteria, version.criteria);
        version.editedAt = event.at;
        break;
      }
      case 'revision_created': {
        const from = findVersion(data.fromVersion);
        if (!from || data.version !== versions.length + 1) {
          issues.push({ code: 'bad_revision', eventId: event.id, message: `${event.id} does not continue the version history. It was ignored.` });
          break;
        }
        versions.push({
          version: data.version,
          status: 'draft',
          requirementText: data.requirementText,
          criteria: buildCriteria(data.criteria, from.criteria),
          createdAt: event.at,
          createdBy: event.actor,
          basedOn: data.fromVersion,
          approvedAt: null,
          digest: null,
          eventId: event.id,
        });
        break;
      }
      case 'requirement_approved': {
        const version = findVersion(data.version);
        if (!version || version.status !== 'draft') {
          issues.push({ code: 'approval_of_non_draft', eventId: event.id, message: `${event.id} approved a version that is not a draft. It was ignored.` });
          break;
        }
        const actual = contentDigest(version);
        if (data.digest !== actual) {
          issues.push({ code: 'approval_digest_mismatch', eventId: event.id, message: `${event.id} approved different text from the draft it names. It was ignored.` });
          break;
        }
        versions.forEach((other) => {
          if (other.status === 'approved') other.status = 'superseded';
        });
        version.status = 'approved';
        version.approvedAt = event.at;
        version.digest = actual;
        break;
      }
      case 'mapping_confirmed':
        confirmations.push({
          criterionId: data.criterionId,
          testId: data.testId,
          criterionSignature: data.criterionSignature,
          version: data.version,
          at: event.at,
          eventId: event.id,
        });
        break;
      case 'test_run_recorded':
        recorded.push({ ...data, id: data.runId, eventId: event.id, recordedAt: event.at });
        break;
      case 'app_repaired':
        repairs.push({ ...data, eventId: event.id, at: event.at });
        break;
      default:
        break;
    }
  }

  const latest = versions[versions.length - 1] ?? null;
  const criteria = latest
    ? latest.criteria.map((criterion) => ({ ...criterion, mapping: mappingFor(criterion, confirmations) }))
    : [];

  // Verify every stored run against its own observations before it can count as anything.
  const verified = recorded.map((run) => {
    const check = verifyRecordedRun(run);
    if (!check.consistent) {
      issues.push({
        code: 'run_record_inconsistent',
        eventId: run.eventId,
        message: `${run.id} does not match its own observations, so it is treated as inconclusive.`,
      });
    }
    return {
      ...run,
      recordedOutcome: run.outcome,
      outcome: check.outcome,
      cause: check.cause ?? null,
    };
  });

  const assessed = assessRuns(verified, {
    latestVersion: latest ? latest.version : null,
    criteria,
    currentBuildDigest: ctx.currentBuildDigest,
  }).map((run) => ({
    ...run,
    shortBuildDigest: shortDigest(run.buildDigest),
    causeLabel: run.cause ? (CAUSE_LABELS[run.cause] ?? run.cause) : null,
    reasonLabels: run.reasons.map((reason) => REASON_LABELS[reason]),
    explanation: explainRun(run),
  }));

  const criteriaOut = criteria.map((criterion) => {
    const { status, runId } = deriveCriterionStatus(criterion.id, assessed);
    const forCriterion = assessed.filter((run) => run.criterionId === criterion.id);
    const historical = forCriterion.filter((run) => !run.current);
    return {
      ...criterion,
      status,
      currentRunId: runId,
      runIds: forCriterion.map((run) => run.id),
      historicalRunIds: historical.map((run) => run.id),
      untestedReason: status === 'UNTESTED' ? untestedReason(criterion, latest, historical) : null,
    };
  });

  const tests = TESTS.map((test) => {
    const criterion = criteriaOut.find((item) => item.testId === test.id) ?? null;
    return {
      id: test.id,
      version: test.version,
      title: test.title,
      covers: test.covers,
      checks: test.checks,
      limits: test.limits,
      scenario: test.scenario,
      criterionId: criterion ? criterion.id : null,
      runnable: runnableGate(latest, criterion),
    };
  });

  const counts = { PASS: 0, FAIL: 0, UNTESTED: 0, INCONCLUSIVE: 0 };
  criteriaOut.forEach((criterion) => {
    counts[criterion.status] += 1;
  });
  const withEvidence = counts.PASS + counts.FAIL;
  const summary = {
    criteriaTotal: criteriaOut.length,
    criteriaWithCurrentEvidence: withEvidence,
    counts,
    line: criteriaOut.length
      ? `${withEvidence} of ${criteriaOut.length} criteria have current evidence`
      : 'No criteria yet',
  };

  const app = appBlock(ctx, repairs);

  return {
    intent,
    interpretation,
    requirement: latest
      ? { id: REQUIREMENT_ID, latestVersion: latest.version, versions: versions.map((v) => ({ ...v, shortDigest: shortDigest(v.digest) })) }
      : null,
    criteria: criteriaOut,
    tests,
    runs: assessed,
    app,
    summary,
    nextStep: nextStepFor({ intent, latest, criteria: criteriaOut, app }),
    integrityIssues: issues,
    eventCount: events.length,
  };
}
