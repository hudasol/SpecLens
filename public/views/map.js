import { bulletList, chip, h, idCode, statusBadge } from '../dom.js';
import { formatDateTime } from '../format.js';
import { emptyState, pageHeading, panel, runDetail, runSummaryLine } from './shared.js';

function chainFor(state, criterion) {
  const test = criterion.testId ? state.tests.find((item) => item.id === criterion.testId) : null;
  const current = state.runs.find((run) => run.id === criterion.currentRunId) ?? null;
  const requirement = state.requirement;
  const latest = requirement.versions[requirement.versions.length - 1];

  return [
    {
      id: state.intent.id,
      kind: 'Request',
      title: state.intent.id,
      text: state.intent.text,
    },
    {
      id: requirement.id,
      kind: 'Requirement',
      title: `${requirement.id} version ${latest.version}`,
      text: latest.requirementText,
      badge: chip(latest.status, latest.status),
    },
    {
      id: criterion.id,
      kind: 'Criterion',
      title: criterion.id,
      text: criterion.text,
    },
    test
      ? { id: test.id, kind: 'Test', title: test.id, text: test.title }
      : { id: `NOTEST-${criterion.id}`, kind: 'Test', title: 'No test', text: 'No SpecLens test covers this criterion.' },
    current
      ? { id: current.id, kind: 'Run', title: current.id, text: current.detail, badge: statusBadge(current.outcome) }
      : { id: `NORUN-${criterion.id}`, kind: 'Run', title: 'No current run', text: 'There is no current evidence.' },
    {
      id: `EXPL-${criterion.id}`,
      kind: 'Explanation',
      title: 'What it proves',
      text: current ? current.explanation.headline : criterion.untestedReason ?? 'Nothing is claimed.',
      badge: statusBadge(criterion.status),
    },
  ];
}

export function renderMap(ctx) {
  const { state, route, navigate } = ctx;

  if (!state.requirement) {
    return h(
      'div',
      { class: 'view' },
      pageHeading('Proof Map', 'Follow the chain from what you asked for to what the evidence does and does not prove.'),
      emptyState('There is nothing to map yet. Record a request and draft a requirement first.', '#/intent', 'Open Intent Studio'),
    );
  }

  const selected = route.param;
  const select = (id) => navigate(`map/${encodeURIComponent(id)}`);

  const chains = state.criteria.map((criterion) => {
    const nodes = chainFor(state, criterion);
    const historical = state.runs.filter((run) => run.criterionId === criterion.id && !run.current);
    return h(
      'section',
      { class: 'panel chain-panel' },
      h('h2', null, 'Chain for ', idCode(criterion.id), ' ', statusBadge(criterion.status)),
      h(
        'ol',
        { class: 'chain' },
        nodes.map((node) =>
          h(
            'li',
            null,
            h(
              'button',
              {
                type: 'button',
                class: `node node-${node.kind.toLowerCase()}`,
                'aria-pressed': selected === node.id ? 'true' : 'false',
                'data-node': node.id,
                onclick: () => select(node.id),
              },
              h('span', { class: 'node-kind' }, node.kind),
              h('span', { class: 'node-title' }, node.title),
              h('span', { class: 'node-text' }, node.text),
              node.badge ?? null,
            ),
          ),
        ),
      ),
      historical.length
        ? h(
            'div',
            { class: 'earlier' },
            h('p', { class: 'small' }, `Earlier runs for ${criterion.id}, kept on record:`),
            h(
              'ul',
              { class: 'plain-list inline-list' },
              historical.map((run) =>
                h(
                  'li',
                  null,
                  h('button', { type: 'button', class: 'link-button', onclick: () => select(run.id) }, run.id),
                  ' ',
                  statusBadge(run.outcome),
                  h('span', { class: 'small' }, ` historical: ${run.reasonLabels.join(' ')}`),
                ),
              ),
            ),
          )
        : null,
    );
  });

  return h(
    'div',
    { class: 'view' },
    pageHeading(
      'Proof Map',
      'Follow the chain from what you asked for to what the evidence does and does not prove. Select any box to see the record behind it.',
    ),
    ...chains,
    detailPanel(state, selected),
  );
}

function detailPanel(state, id) {
  if (!id) {
    return panel('Details', h('p', null, 'Select a box in a chain to see the record behind it.'));
  }
  const body = detailFor(state, id);
  if (!body) {
    return panel('Details', h('p', null, `${id} does not exist in the current record.`));
  }
  return h(
    'section',
    { class: 'panel', id: 'detail', tabindex: '-1', 'aria-label': `Details for ${id}` },
    h('h2', null, 'Details for ', idCode(id)),
    body,
  );
}

function detailFor(state, id) {
  const requirement = state.requirement;
  const latest = requirement.versions[requirement.versions.length - 1];

  if (id === state.intent.id) {
    return h(
      'div',
      { class: 'stack' },
      h('blockquote', { class: 'quote' }, state.intent.text),
      h('p', { class: 'meta' }, `Recorded ${formatDateTime(state.intent.recordedAt)} as event `, idCode(state.intent.eventId), '. This is the original request, kept exactly as written.'),
      h('p', null, h('a', { href: '#/intent' }, 'Open Intent Studio')),
    );
  }

  if (id === requirement.id) {
    return h(
      'div',
      { class: 'stack' },
      h('p', null, h('strong', null, `Current wording (version ${latest.version}, ${latest.status}):`), ' ', latest.requirementText),
      h('p', { class: 'meta' }, `${requirement.versions.length} version${requirement.versions.length === 1 ? '' : 's'} on record. `, latest.digest ? ['Approved text fingerprint ', idCode(latest.shortDigest), '.'] : 'This version is not approved yet.'),
      h('p', null, h('a', { href: '#/intent' }, 'Open Intent Studio')),
    );
  }

  const criterion = state.criteria.find((item) => item.id === id);
  if (criterion) {
    const mapping = {
      matches_test_design: 'The test was written for exactly this wording.',
      confirmed: 'You confirmed that the test still fits this wording.',
      needs_confirmation: 'The wording changed and the pairing is waiting for your confirmation.',
      none: 'No test is mapped to this criterion.',
    }[criterion.mapping.state];
    return h(
      'div',
      { class: 'stack' },
      h('p', null, criterion.text),
      h('p', { class: 'meta' }, 'Current status ', statusBadge(criterion.status)),
      criterion.untestedReason ? h('p', null, criterion.untestedReason) : null,
      h('p', { class: 'meta' }, `Test pairing: ${mapping}`),
    );
  }

  const test = state.tests.find((item) => item.id === id);
  if (test) {
    return h(
      'div',
      { class: 'stack' },
      h('p', null, test.title),
      h('ol', { class: 'check-list' }, test.checks.map((check) => h('li', null, idCode(check.id), ' ', chip(check.kind, check.kind), ' ', check.label))),
      h('h3', null, 'What this test does not cover'),
      bulletList(test.limits),
      h('p', null, h('a', { href: '#/lab' }, 'Open Evidence Lab')),
    );
  }

  const run = state.runs.find((item) => item.id === id);
  if (run) {
    return h(
      'div',
      { class: 'stack' },
      runDetail(run),
      h('p', null, h('a', { href: '#/lab' }, 'Open Evidence Lab')),
    );
  }

  const missing = /^(NOTEST|NORUN|EXPL)-(.+)$/.exec(id);
  if (missing) {
    const target = state.criteria.find((item) => item.id === missing[2]);
    if (!target) return null;
    if (missing[1] === 'NOTEST') {
      return h(
        'div',
        { class: 'stack' },
        h('p', null, `No SpecLens test covers ${target.id}, so nothing was run for it and its status is ${target.status}.`),
        h('p', { class: 'hint' }, 'Developer unit tests in the repository may cover this behaviour, but they are not recorded here and are not counted as evidence.'),
      );
    }
    if (missing[1] === 'NORUN') {
      const earlier = state.runs.filter((item) => item.criterionId === target.id);
      return h(
        'div',
        { class: 'stack' },
        h('p', null, target.untestedReason ?? 'There is no current run.'),
        earlier.length
          ? h('ul', { class: 'plain-list' }, earlier.map((item) => h('li', null, runSummaryLine(item), h('span', { class: 'small' }, ` ${item.reasonLabels.join(' ')}`))))
          : null,
      );
    }
    const current = state.runs.find((item) => item.id === target.currentRunId);
    return current
      ? h(
          'div',
          { class: 'stack' },
          h('p', { class: 'headline' }, current.explanation.headline),
          current.explanation.proves.length ? h('h3', null, 'What it shows') : null,
          current.explanation.proves.length ? bulletList(current.explanation.proves) : null,
          h('h3', null, 'What it does not show'),
          bulletList(current.explanation.doesNotProve),
        )
      : h(
          'div',
          { class: 'stack' },
          h('p', { class: 'headline' }, `${target.id} is ${target.status}. Nothing is claimed about it.`),
          h('p', null, target.untestedReason ?? ''),
        );
  }
  return null;
}
