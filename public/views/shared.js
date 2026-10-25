import { checkBadge, chip, h, idCode, notice, statusBadge, bulletList } from '../dom.js';
import { formatDateTime, formatTime } from '../format.js';

export function pageHeading(title, lead) {
  return h('div', { class: 'page-heading' }, h('h1', null, title), h('p', { class: 'lead' }, lead));
}

export function panel(title, ...children) {
  return h('section', { class: 'panel' }, h('h2', null, title), ...children);
}

export function emptyState(text, linkHref, linkText) {
  return h(
    'div',
    { class: 'empty' },
    h('p', null, text),
    linkHref ? h('a', { class: 'button button-secondary', href: linkHref }, linkText) : null,
  );
}

export function currentChip(run) {
  return run.current ? chip('Current evidence', 'current') : chip('Historical', 'historical');
}

function checksTable(run) {
  if (!run.checks || run.checks.length === 0) return null;
  return h(
    'div',
    { class: 'table-scroll' },
    h(
      'table',
      { class: 'table table-cards' },
      h('caption', { class: 'visually-hidden' }, `Checks recorded for ${run.id}`),
      h(
        'thead',
        null,
        h('tr', null, ['Check', 'What it checks', 'Expected', 'Observed', 'Result'].map((name) => h('th', { scope: 'col' }, name))),
      ),
      h(
        'tbody',
        null,
        run.checks.map((check) =>
          h(
            'tr',
            null,
            h('td', { 'data-label': 'Check' }, idCode(check.id), h('span', { class: 'small' }, ` ${check.kind}`)),
            h('td', { 'data-label': 'What it checks' }, check.label),
            h('td', { 'data-label': 'Expected' }, check.expected ?? 'n/a'),
            h('td', { 'data-label': 'Observed' }, check.actual ?? 'n/a'),
            h('td', { 'data-label': 'Result' }, checkBadge(check.status)),
          ),
        ),
      ),
    ),
  );
}

// The full record of one run: used by both Evidence Lab and Proof Map so they can never disagree.
export function runDetail(run) {
  return h(
    'div',
    { class: 'run-detail' },
    h('div', { class: 'run-head' }, idCode(run.id), statusBadge(run.outcome), currentChip(run)),
    run.current
      ? null
      : notice('info', `Kept on record, but not current evidence. ${run.reasonLabels.join(' ')}`),
    run.cause ? notice('warning', `${run.causeLabel} ${run.detail}`) : h('p', null, run.detail),
    h(
      'dl',
      { class: 'facts' },
      h('div', null, h('dt', null, 'Test'), h('dd', null, idCode(run.testId), ` version ${run.testVersion}`)),
      h('div', null, h('dt', null, 'Requirement'), h('dd', null, idCode(run.requirementId), ` version ${run.requirementVersion}`)),
      h('div', null, h('dt', null, 'Criterion'), h('dd', null, idCode(run.criterionId))),
      h('div', null, h('dt', null, 'App build tested'), h('dd', null, idCode(run.shortBuildDigest))),
      h('div', null, h('dt', null, 'Started'), h('dd', null, formatDateTime(run.startedAt))),
      h('div', null, h('dt', null, 'Duration'), h('dd', null, Number.isFinite(run.durationMs) ? `${run.durationMs} ms` : 'unknown')),
      h('div', null, h('dt', null, 'Event'), h('dd', null, idCode(run.eventId))),
    ),
    checksTable(run),
    h(
      'div',
      { class: 'explain' },
      h('h3', null, 'What this evidence says'),
      h('p', { class: 'headline' }, run.explanation.headline),
      run.explanation.proves.length ? h('h4', null, 'What it shows') : null,
      run.explanation.proves.length ? bulletList(run.explanation.proves) : null,
      h('h4', null, 'What it does not show'),
      bulletList(run.explanation.doesNotProve),
    ),
    run.observations
      ? h(
          'details',
          { class: 'raw' },
          h('summary', null, 'Raw observations from the test process'),
          h('pre', { tabindex: '0', role: 'region', 'aria-label': `Raw observations for ${run.id}` }, JSON.stringify(run.observations, null, 2)),
        )
      : null,
  );
}

export function runSummaryLine(run) {
  return h(
    'span',
    { class: 'run-line' },
    idCode(run.id),
    statusBadge(run.outcome),
    currentChip(run),
    h('span', { class: 'small' }, `build ${run.shortBuildDigest}, ${formatTime(run.startedAt)}`),
  );
}
