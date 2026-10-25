import { bulletList, chip, h, idCode, notice, statusBadge } from '../dom.js';
import { formatCents } from '../format.js';
import { emptyState, pageHeading, panel, runDetail, runSummaryLine } from './shared.js';

export function renderLab(ctx) {
  const { state } = ctx;
  const test = state.tests[0];
  const criterion = state.criteria.find((item) => item.id === test.criterionId) ?? null;

  return h(
    'div',
    { class: 'view' },
    pageHeading(
      'Evidence Lab',
      'Run a real test against the student budget tracker. The test starts a separate process, loads the app file, and records what actually happened.',
    ),
    h(
      'div',
      { class: 'columns' },
      h('div', { class: 'column' }, appPanel(ctx), probePanel(ctx)),
      h('div', { class: 'column' }, testPanel(ctx, test, criterion)),
    ),
    resultPanel(ctx),
    repairPanel(ctx),
    historyPanel(ctx),
  );
}

function appPanel({ state }) {
  const { scenario, app } = state;
  const spent = scenario.seed.reduce((sum, item) => sum + item.amountCents, 0);
  const remaining = scenario.budgetCents - spent;
  const tone = app.state === 'defective' ? 'fail' : app.state === 'repaired' ? 'current' : 'warning';
  return panel(
    'Application under test',
    h('p', null, 'A small student budget tracker. Each test run starts from this same scenario.'),
    h(
      'dl',
      { class: 'facts' },
      h('div', null, h('dt', null, 'Budget'), h('dd', null, formatCents(scenario.budgetCents))),
      h(
        'div',
        null,
        h('dt', null, 'Already spent'),
        h('dd', null, `${formatCents(spent)} (${scenario.seed.map((item) => `${item.label} ${formatCents(item.amountCents)}`).join(', ')})`),
      ),
      h('div', null, h('dt', null, 'Remaining'), h('dd', null, formatCents(remaining))),
      h(
        'div',
        null,
        h('dt', null, 'Attempt'),
        h('dd', null, `${scenario.attempt.label} ${formatCents(scenario.attempt.amountCents)}`),
      ),
    ),
    h(
      'p',
      { class: 'meta' },
      'Build ',
      idCode(app.shortDigest || 'none'),
      ' ',
      chip(app.label, tone),
    ),
    app.state === 'modified'
      ? notice('warning', 'The app file was changed outside SpecLens. Earlier evidence no longer applies to this build.')
      : null,
    app.state === 'missing' ? notice('error', 'The app file is missing. Reset the demo to restore it.') : null,
  );
}

function describeProbe(probe) {
  if (!probe.ok) return `The app did not answer: ${probe.detail}`;
  const answer = probe.result.ok
    ? 'The app accepted it.'
    : `The app rejected it${probe.result.reason ? ` (${probe.result.reason})` : ''}.`;
  return `${answer} Remaining balance went from ${formatCents(probe.remainingBeforeCents)} to ${formatCents(probe.remainingAfterCents)}. The history has ${probe.historyAfter} entries (it had ${probe.historyBefore}).`;
}

function probePanel(ctx) {
  const { ui, busy, act, api } = ctx;
  const submit = async (event) => {
    event.preventDefault();
    await act(
      async () => {
        ui.probe = null;
        const result = await api.probe(ui.probeAmount);
        ui.probe = result;
        return result;
      },
      null,
      'probe',
    );
  };
  return panel(
    'Try the app yourself',
    h('p', null, 'Add a hands on expense to the scenario above and see how the current build responds.'),
    h(
      'form',
      { class: 'inline-form', onsubmit: submit },
      h('label', { for: 'probe-amount' }, 'Amount in dollars'),
      h('input', {
        id: 'probe-amount',
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        value: ui.probeAmount,
        'data-key': 'probe-amount',
        oninput: (event) => {
          ui.probeAmount = event.target.value;
        },
      }),
      h('button', { type: 'submit', class: 'button button-secondary', disabled: busy }, ui.working === 'probe' ? 'Trying...' : 'Try this expense'),
    ),
    ui.probe ? h('p', { class: 'probe-result' }, describeProbe(ui.probe)) : null,
    h('p', { class: 'hint' }, 'A hands on try is not evidence. Nothing is recorded and no result changes.'),
  );
}

function testPanel(ctx, test, criterion) {
  const { state, busy, act, api, ui } = ctx;
  const run = () =>
    act(
      () => api.runTest(test.id),
      (result) => ({
        kind: result.outcome === 'PASS' ? 'success' : 'info',
        text: `${result.runId} was recorded: ${result.outcome}.`,
      }),
      'run',
    ).then((result) => {
      if (result) ui.labRunId = result.runId;
      ctx.rerender();
    });

  return panel(
    `Test ${test.id}`,
    h('p', { class: 'test-title' }, test.title),
    criterion
      ? h('p', null, 'It checks ', idCode(criterion.id), ': ', criterion.text)
      : h('p', null, 'No criterion in the current requirement is mapped to this test.'),
    h(
      'ol',
      { class: 'check-list' },
      test.checks.map((check) =>
        h('li', null, idCode(check.id), ' ', chip(check.kind, check.kind), ' ', check.label),
      ),
    ),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'button button-primary',
          disabled: busy || !test.runnable.ok,
          'aria-describedby': test.runnable.ok ? null : 'run-blocked',
          onclick: run,
        },
        ui.working === 'run' ? 'Running...' : `Run ${test.id}`,
      ),
    ),
    test.runnable.ok
      ? h('p', { class: 'hint' }, `Each run is a new record. It stops after ${state.runner.timeoutMs / 1000} seconds and is then recorded as INCONCLUSIVE.`)
      : h('p', { class: 'hint', id: 'run-blocked' }, test.runnable.reason, ' ', h('a', { href: '#/intent' }, 'Open Intent Studio')),
  );
}

function resultPanel(ctx) {
  const { state, ui } = ctx;
  const run = state.runs.find((item) => item.id === ui.labRunId) ?? state.runs[state.runs.length - 1] ?? null;
  if (!run) {
    return panel('Result', emptyState('No run has been recorded yet. Run the test to create the first record.'));
  }
  return panel(
    'Result',
    h('p', { class: 'hint' }, 'Showing ', run === state.runs[state.runs.length - 1] ? 'the latest run.' : 'the run you selected.'),
    runDetail(run),
    h('p', null, h('a', { href: `#/map/${run.id}` }, 'See this run in the Proof Map')),
  );
}

function repairPanel(ctx) {
  const { state, busy, act, api, ui } = ctx;
  const { repair, app } = state;
  const hadFail = state.runs.some((run) => run.outcome === 'FAIL');
  const apply = () =>
    act(
      () => api.applyRepair(repair.id),
      () => ({
        kind: 'success',
        text: `${repair.id} was applied. Earlier runs are now historical. Run the test again to gather evidence for this build.`,
      }),
      'repair',
    );

  let body;
  if (app.state === 'repaired') {
    body = notice('success', `${repair.id} is applied to the working copy of the app (build ${app.shortDigest}). Run the test again to gather evidence for this build.`);
  } else if (!repair.applicable) {
    body = notice('warning', 'The app was changed outside SpecLens or is missing, so the documented repair cannot be applied. Reset the demo to restore the seeded app.');
  } else {
    body = h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'button button-primary', disabled: busy, onclick: apply }, ui.working === 'repair' ? 'Applying...' : `Apply ${repair.id}`),
    );
  }

  return panel(
    `Documented repair ${repair.id}`,
    h('p', null, repair.explanation),
    h(
      'pre',
      { class: 'diff', tabindex: '0', role: 'region', 'aria-label': `Patch for ${repair.patch.file}` },
      h('span', { class: 'diff-file' }, `${repair.patch.file}\n`),
      repair.patch.removed.map((line) => h('span', { class: 'diff-removed' }, `- ${line}\n`)),
      repair.patch.added.map((line) => h('span', { class: 'diff-added' }, `+ ${line}\n`)),
    ),
    body,
    app.state === 'defective' && !hadFail
      ? h('p', { class: 'hint' }, 'You can apply the repair at any time, but the story is clearest after the test has failed once.')
      : null,
  );
}

function historyPanel(ctx) {
  const { state, ui, rerender } = ctx;
  if (state.runs.length === 0) return null;
  return panel(
    'Every run on record',
    h('p', null, 'Earlier runs are never deleted. A run stops counting as current evidence when the requirement, the criterion wording or the app code changes.'),
    h(
      'ol',
      { class: 'run-list' },
      [...state.runs].reverse().map((run) =>
        h(
          'li',
          null,
          runSummaryLine(run),
          run.current ? null : h('span', { class: 'small' }, ` ${run.reasonLabels.join(' ')}`),
          ' ',
          h(
            'button',
            {
              type: 'button',
              class: 'link-button',
              onclick: () => {
                ui.labRunId = run.id;
                rerender();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              },
            },
            'Show this run',
          ),
        ),
      ),
    ),
  );
}
