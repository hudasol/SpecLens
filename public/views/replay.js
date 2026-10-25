import { bulletList, h, idCode, statusBadge } from '../dom.js';
import { formatDateTime } from '../format.js';
import { emptyState, pageHeading, panel } from './shared.js';

const VIEW_LABELS = { intent: 'Intent Studio', lab: 'Evidence Lab' };

function annotationBlock(note) {
  return h(
    'div',
    { class: 'annotation' },
    h('span', { class: 'annotation-label' }, 'Result updated'),
    idCode(note.criterionId),
    statusBadge(note.from),
    h('span', { 'aria-label': 'changed to' }, 'to'),
    statusBadge(note.to),
    note.because ? h('span', { class: 'small' }, note.because) : null,
  );
}

function itemLink(item) {
  if (item.refs.runId) return h('a', { href: `#/map/${item.refs.runId}` }, 'See this run in the Proof Map');
  return h('a', { href: `#/${item.view}` }, `Open ${VIEW_LABELS[item.view] ?? 'the view'}`);
}

export function renderReplay(ctx) {
  const { state, ui } = ctx;
  const { items, gaps } = state.replay;

  if (items.length === 0) {
    return h(
      'div',
      { class: 'view' },
      pageHeading('Build Replay', 'A timeline of what was actually recorded, in order.'),
      emptyState('Nothing has been recorded yet. This timeline fills in as you work.', '#/intent', 'Open Intent Studio'),
    );
  }

  const position = ui.replayPos === null ? items.length : Math.min(ui.replayPos, items.length);

  const list = h(
    'ol',
    { class: 'timeline' },
    items.map((item, index) =>
      h(
        'li',
        { class: `timeline-item tone-${item.tone}${index >= position ? ' future' : ''}` },
        h(
          'div',
          { class: 'tl-meta' },
          idCode(item.eventId),
          h('span', { class: 'small' }, `${formatDateTime(item.at)} by ${item.actor}`),
        ),
        h('h3', null, item.title),
        h('p', null, item.detail),
        item.annotations.map(annotationBlock),
        h('p', { class: 'small' }, itemLink(item)),
      ),
    ),
  );

  const label = h('output', { id: 'replay-position', for: 'replay-range' }, '');
  const update = () => {
    label.textContent = position === items.length ? `Showing all ${items.length} events` : `Showing the first ${position} of ${items.length} events`;
  };
  update();

  const range = h('input', {
    id: 'replay-range',
    type: 'range',
    min: 0,
    max: items.length,
    step: 1,
    value: position,
    'data-key': 'replay-range',
    oninput: (event) => {
      const value = Number(event.target.value);
      ui.replayPos = value >= items.length ? null : value;
      const shown = ui.replayPos === null ? items.length : ui.replayPos;
      label.textContent = shown === items.length ? `Showing all ${items.length} events` : `Showing the first ${shown} of ${items.length} events`;
      list.querySelectorAll('.timeline-item').forEach((node, index) => node.classList.toggle('future', index >= shown));
    },
  });

  return h(
    'div',
    { class: 'view' },
    pageHeading(
      'Build Replay',
      'Every row is one recorded event, in the order it happened. Nothing here is simulated or filled in afterwards.',
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Replay'),
      h('div', { class: 'scrubber' }, h('label', { for: 'replay-range' }, 'Replay position'), range, label),
      list,
    ),
    panel(
      'What is still not proven',
      h('p', null, 'This list is worked out from the record as it stands now.'),
      gaps.length ? bulletList(gaps) : h('p', null, 'Nothing is recorded yet.'),
    ),
  );
}
