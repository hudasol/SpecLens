// Proof Map: for each acceptance criterion, the chain from the original request to what the evidence shows.
// It is derived from the same state as every other view and holds no records of its own.

function chainFor(state, criterion) {
  const test = criterion.testId ? state.tests.find((item) => item.id === criterion.testId) : null;
  const current = state.runs.find((run) => run.id === criterion.currentRunId) ?? null;
  const requirement = state.requirement;
  const latest = requirement.versions[requirement.versions.length - 1];

  return [
    { id: state.intent.id, kind: 'Request', title: state.intent.id, text: state.intent.text },
    {
      id: requirement.id,
      kind: 'Requirement',
      title: `${requirement.id} version ${latest.version}`,
      text: latest.requirementText,
      badge: { type: 'chip', value: latest.status },
    },
    { id: criterion.id, kind: 'Criterion', title: criterion.id, text: criterion.text },
    test
      ? { id: test.id, kind: 'Test', title: test.id, text: test.title }
      : { id: `NOTEST-${criterion.id}`, kind: 'Test', title: 'No test', text: 'No SpecLens test covers this criterion.' },
    current
      ? { id: current.id, kind: 'Run', title: current.id, text: current.detail, badge: { type: 'status', value: current.outcome } }
      : { id: `NORUN-${criterion.id}`, kind: 'Run', title: 'No current run', text: 'There is no current evidence.' },
    {
      id: `EXPL-${criterion.id}`,
      kind: 'Explanation',
      title: 'What it shows',
      text: current ? current.explanation.headline : (criterion.untestedReason ?? 'Nothing is claimed.'),
      badge: { type: 'status', value: criterion.status },
    },
  ];
}

export function buildProofMap(state) {
  if (!state.intent || !state.requirement) return [];
  return state.criteria.map((criterion) => ({
    criterionId: criterion.id,
    status: criterion.status,
    nodes: chainFor(state, criterion),
    earlierRuns: state.runs
      .filter((run) => run.criterionId === criterion.id && !run.current)
      .map((run) => ({ runId: run.id, outcome: run.outcome, reasons: run.reasonLabels })),
  }));
}
