import { api } from './api.js';
import { chip, clear, h, idCode, notice, statusBadge } from './dom.js';
import { renderIntent } from './views/intent.js';
import { renderLab } from './views/lab.js';
import { renderMap } from './views/map.js';
import { renderReplay } from './views/replay.js';

const VIEWS = [
  { id: 'intent', number: 1, label: 'Intent Studio', render: renderIntent },
  { id: 'lab', number: 2, label: 'Evidence Lab', render: renderLab },
  { id: 'map', number: 3, label: 'Proof Map', render: renderMap },
  { id: 'replay', number: 4, label: 'Build Replay', render: renderReplay },
];

// Things the person has typed or chosen but not yet sent. They survive a redraw.
const ui = {
  notice: null,
  intentText: null,
  edit: null,
  probeAmount: '25',
  probe: null,
  labRunId: null,
  replayPos: null,
  busy: false,
  working: null,
};

let state = null;
let loadError = null;

const els = {
  strip: document.getElementById('strip'),
  next: document.getElementById('next'),
  tabs: document.getElementById('tabs'),
  main: document.getElementById('main'),
  announce: document.getElementById('announce'),
  dialog: document.getElementById('reset-dialog'),
  resetOpen: document.getElementById('reset-open'),
};

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const view = VIEWS.find((item) => item.id === parts[0]) ?? VIEWS[0];
  let param = null;
  try {
    param = parts[1] ? decodeURIComponent(parts[1]) : null;
  } catch {
    param = null;
  }
  return { view, param };
}

export function navigate(path) {
  const target = `#/${path}`;
  if (location.hash === target) render();
  else location.hash = target;
}

async function refreshQuietly() {
  try {
    state = await api.state();
    loadError = null;
  } catch {
    // The error notice already says what went wrong.
  }
}

async function act(task, describe, working = null) {
  if (ui.busy) return null;
  ui.busy = true;
  ui.working = working;
  ui.notice = null;
  render();
  try {
    const result = await task();
    if (result?.state) state = result.state;
    ui.notice = describe ? describe(result) : null;
    return result;
  } catch (error) {
    ui.notice = { kind: 'error', text: error.message };
    if (error.status === 409) await refreshQuietly(); // another tab may have moved things on
    return null;
  } finally {
    ui.busy = false;
    ui.working = null;
    render();
  }
}

function announce(text) {
  els.announce.textContent = '';
  if (text) setTimeout(() => (els.announce.textContent = text), 50);
}

function renderStrip() {
  clear(els.strip);
  if (!state) return;
  const requirement = state.requirement;
  const latest = requirement ? requirement.versions[requirement.versions.length - 1] : null;

  els.strip.append(
    h(
      'div',
      { class: 'strip-block' },
      h('span', { class: 'strip-label' }, 'Requirement'),
      latest
        ? h('span', null, idCode(requirement.id), ` version ${latest.version} `, chip(latest.status, latest.status))
        : h('span', null, 'None yet'),
    ),
    h(
      'div',
      { class: 'strip-block' },
      h('span', { class: 'strip-label' }, 'Criteria'),
      state.criteria.length
        ? h(
            'ul',
            { class: 'strip-criteria' },
            state.criteria.map((criterion) =>
              h(
                'li',
                null,
                h('a', { href: `#/map/${criterion.id}` }, idCode(criterion.id), statusBadge(criterion.status)),
              ),
            ),
          )
        : h('span', null, 'None yet'),
    ),
    h(
      'div',
      { class: 'strip-block' },
      h('span', { class: 'strip-label' }, 'Coverage'),
      h('span', null, state.summary.line),
    ),
    h(
      'div',
      { class: 'strip-block' },
      h('span', { class: 'strip-label' }, 'App build'),
      h('span', null, idCode(state.app.shortDigest || 'none'), ` ${state.app.label}`),
    ),
  );
}

function renderNext(route) {
  clear(els.next);
  if (!state) return;
  const target = VIEWS.find((view) => view.id === state.nextStep.view);
  els.next.append(
    h('span', { class: 'next-label' }, 'Next step'),
    h('span', { class: 'next-text' }, state.nextStep.text),
  );
  // Note: Element.append would print the word "null" for a missing node, so it is only added when it exists.
  if (target && target.id !== route.view.id) {
    els.next.append(h('a', { class: 'button button-primary', href: `#/${target.id}` }, `Go to ${target.label}`));
  }
}

function renderTabs(route) {
  clear(els.tabs);
  for (const view of VIEWS) {
    els.tabs.append(
      h(
        'a',
        {
          class: 'tab',
          href: `#/${view.id}`,
          'aria-current': view.id === route.view.id ? 'page' : null,
        },
        h('span', { class: 'tab-number', 'aria-hidden': 'true' }, view.number),
        view.label,
      ),
    );
  }
}

function render() {
  const active = document.activeElement;
  const focusKey = active?.dataset?.key ?? null;
  const selection =
    active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;

  const route = parseRoute();
  document.title = `${route.view.label}: SpecLens`;
  renderStrip();
  renderNext(route);
  renderTabs(route);
  els.resetOpen.disabled = ui.busy || !state;

  clear(els.main);
  if (!state) {
    els.main.append(
      loadError
        ? h(
            'div',
            { class: 'panel' },
            notice('error', loadError),
            h('button', { type: 'button', class: 'button button-primary', onclick: load }, 'Try again'),
          )
        : h('p', { class: 'loading' }, 'Loading the record...'),
    );
    return;
  }

  if (ui.notice) {
    els.main.append(notice(ui.notice.kind, ui.notice.text));
    if (ui.notice.kind !== 'error') announce(ui.notice.text);
  }
  els.main.append(
    route.view.render({ state, ui, busy: ui.busy, route, navigate, act, rerender: render, api }),
  );

  if (focusKey) {
    const again = els.main.querySelector(`[data-key="${focusKey}"]`);
    if (again) {
      again.focus({ preventScroll: true });
      if (selection && typeof again.setSelectionRange === 'function') again.setSelectionRange(...selection);
    }
  }
}

async function load() {
  try {
    state = await api.state();
    loadError = null;
  } catch (error) {
    loadError = error.message;
  }
  render();
}

window.addEventListener('hashchange', () => {
  ui.notice = null;
  const route = parseRoute();
  render();
  // Choosing a box in the Proof Map brings its details into view. Any other move starts at the top.
  const detail = route.view.id === 'map' && route.param ? document.getElementById('detail') : null;
  if (detail) {
    detail.scrollIntoView({ block: 'start' });
    detail.focus({ preventScroll: true });
  } else {
    els.main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
});

els.resetOpen.addEventListener('click', () => {
  els.dialog.returnValue = '';
  els.dialog.showModal();
});

els.dialog.addEventListener('close', async () => {
  if (els.dialog.returnValue !== 'confirm') return;
  const result = await act(
    () => api.reset(),
    () => ({ kind: 'success', text: 'The demo was reset. The record is empty and the app is back to its seeded state.' }),
  );
  if (result) {
    ui.edit = null;
    ui.intentText = null;
    ui.probe = null;
    ui.labRunId = null;
    ui.replayPos = null;
    navigate('intent');
  }
});

load();
