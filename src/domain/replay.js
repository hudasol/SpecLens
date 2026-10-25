// Build Replay: a timeline of what was recorded, in order. Every row is one stored event.
// The "result updated" notes are derived by comparing the shown results before and after an event.

import { formatCents } from './money.js';
import { shortDigest } from './digest.js';
import { deriveState } from './state.js';

export function digestAfter(events, seedDigest) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].type === 'app_repaired') return events[index].data.afterDigest;
  }
  return seedDigest;
}

function describeEvent(event) {
  const d = event.data ?? {};
  switch (event.type) {
    case 'intent_recorded':
      return { title: 'Request recorded', detail: `"${d.text}"`, tone: 'neutral', view: 'intent' };
    case 'interpretation_proposed':
      return {
        title: `Requirement drafted (version ${d.version})`,
        detail: `${d.interpreter} proposed one requirement and ${d.criteria.length} acceptance criteria. Nothing is approved yet.`,
        tone: 'neutral',
        view: 'intent',
      };
    case 'draft_edited':
      return { title: `Draft version ${d.version} edited`, detail: 'The draft text was changed before approval.', tone: 'neutral', view: 'intent' };
    case 'revision_created':
      return {
        title: `New version ${d.version} created`,
        detail: `Edited from approved version ${d.fromVersion}. Evidence gathered for version ${d.fromVersion} is now historical.`,
        tone: 'warning',
        view: 'intent',
      };
    case 'requirement_approved':
      return {
        title: `Version ${d.version} approved`,
        detail: `Approved by the user. Content fingerprint ${shortDigest(d.digest)}. This version can no longer change.`,
        tone: 'neutral',
        view: 'intent',
      };
    case 'mapping_confirmed':
      return {
        title: 'Test mapping confirmed',
        detail: `The user confirmed that ${d.testId} still checks the reworded ${d.criterionId}.`,
        tone: 'neutral',
        view: 'intent',
      };
    case 'test_run_recorded':
      return {
        title: `${d.testId} ran: ${d.outcome}`,
        detail:
          d.outcome === 'INCONCLUSIVE'
            ? `${d.detail} Build ${shortDigest(d.buildDigest)}.`
            : `${d.detail} Build ${shortDigest(d.buildDigest)}, ${formatDuration(d.durationMs)}.`,
        tone: d.outcome === 'PASS' ? 'pass' : d.outcome === 'FAIL' ? 'fail' : 'warning',
        view: 'lab',
      };
    case 'app_repaired':
      return {
        title: `${d.repairId} applied`,
        detail: `The app file changed from build ${shortDigest(d.beforeDigest)} to build ${shortDigest(d.afterDigest)}. Earlier runs are now historical.`,
        tone: 'warning',
        view: 'lab',
      };
    default:
      return { title: event.type, detail: '', tone: 'neutral', view: 'intent' };
  }
}

function formatDuration(ms) {
  return Number.isFinite(ms) ? `${ms} ms` : 'duration unknown';
}

function statusMap(state) {
  return new Map(state.criteria.map((criterion) => [criterion.id, criterion]));
}

export function buildReplay(events, { seedDigest, repairedDigest }) {
  const items = [];
  let previous = new Map();
  let finalState = null;

  events.forEach((event, index) => {
    const prefix = events.slice(0, index + 1);
    const state = deriveState(prefix, {
      currentBuildDigest: digestAfter(prefix, seedDigest),
      seedDigest,
      repairedDigest,
    });
    const now = statusMap(state);
    const annotations = [];
    for (const [id, criterion] of now) {
      const before = previous.get(id);
      if (before && before.status !== criterion.status) {
        annotations.push({
          kind: 'result_updated',
          criterionId: id,
          from: before.status,
          to: criterion.status,
          because:
            criterion.status === 'UNTESTED'
              ? criterion.untestedReason
              : `${criterion.currentRunId} is the current evidence.`,
        });
      }
    }
    items.push({
      seq: event.seq,
      eventId: event.id,
      at: event.at,
      actor: event.actor,
      type: event.type,
      ...describeEvent(event),
      refs: {
        runId: event.type === 'test_run_recorded' ? event.data.runId : null,
        version: event.data?.version ?? null,
      },
      annotations,
    });
    previous = now;
    finalState = state;
  });

  const gaps = [];
  if (finalState) {
    if (!finalState.requirement) gaps.push('No requirement has been drafted yet.');
    else if (finalState.requirement.versions.at(-1).status !== 'approved') {
      gaps.push(`Requirement version ${finalState.requirement.latestVersion} is a draft and has not been approved.`);
    }
    for (const criterion of finalState.criteria) {
      if (criterion.status === 'PASS') continue;
      gaps.push(`${criterion.id} is ${criterion.status}. ${criterion.untestedReason ?? ''}`.trim());
    }
    if (finalState.criteria.some((criterion) => criterion.status === 'PASS')) {
      gaps.push('A passing result covers one scenario on one build. It is not proof that the whole app is correct.');
    }
  }
  return { items, gaps };
}
