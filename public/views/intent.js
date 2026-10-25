import { chip, h, idCode, notice, statusBadge } from '../dom.js';
import { formatDateTime } from '../format.js';
import { pageHeading, panel } from './shared.js';

const same = (a, b) => String(a ?? '').replace(/\s+/g, ' ').trim() === String(b ?? '').replace(/\s+/g, ' ').trim();

export function renderIntent(ctx) {
  const { state } = ctx;
  return h(
    'div',
    { class: 'view' },
    pageHeading(
      'Intent Studio',
      'Turn a plain request into a requirement and acceptance criteria you can read, edit and approve. Nothing is tested until you approve it.',
    ),
    requestPanel(ctx),
    state.requirement ? requirementPanel(ctx) : null,
    state.requirement ? versionsPanel(state) : null,
  );
}

function requestPanel(ctx) {
  const { state, ui, busy, act, api, rerender } = ctx;

  if (state.intent) {
    return panel(
      'Original request',
      h('blockquote', { class: 'quote' }, state.intent.text),
      h(
        'p',
        { class: 'meta' },
        idCode(state.intent.id),
        ` recorded ${formatDateTime(state.intent.recordedAt)}. Drafted by `,
        idCode(state.interpretation.interpreter),
        ', an offline rule based interpreter. No AI service was called and nothing left this computer.',
      ),
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    const text = (ui.intentText ?? '').trim();
    if (!text) {
      ui.notice = { kind: 'error', text: 'Write the request first, or use the example.' };
      rerender();
      return;
    }
    await act(
      () => api.propose(text),
      (result) =>
        result.recognised
          ? { kind: 'success', text: 'A draft requirement was proposed. Review it, change it if you want to, then approve it.' }
          : { kind: 'info', text: result.message },
      'propose',
    );
  };

  return panel(
    'Original request',
    h('p', null, 'What did you ask your AI tool for? Write it the way you said it.'),
    h(
      'form',
      { class: 'stack', onsubmit: submit },
      h('label', { for: 'intent-input' }, 'Request'),
      h(
        'textarea',
        {
          id: 'intent-input',
          rows: 3,
          maxlength: 300,
          'data-key': 'intent-input',
          placeholder: state.example,
          oninput: (event) => {
            ui.intentText = event.target.value;
          },
        },
        ui.intentText ?? '',
      ),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'button button-secondary',
            disabled: busy,
            onclick: () => {
              ui.intentText = state.example;
              rerender();
            },
          },
          'Use the example request',
        ),
        h(
          'button',
          { type: 'submit', class: 'button button-primary', disabled: busy },
          ui.working === 'propose' ? 'Proposing...' : 'Propose a requirement',
        ),
      ),
      h(
        'p',
        { class: 'hint' },
        'This is an offline demo interpreter. It recognises the example request and close rewordings, and tells you plainly when it does not.',
      ),
    ),
  );
}

function editState(ctx, latest) {
  const key = JSON.stringify([latest.version, latest.status, latest.requirementText, latest.criteria.map((c) => c.text)]);
  if (!ctx.ui.edit || ctx.ui.edit.key !== key) {
    ctx.ui.edit = {
      key,
      requirementText: latest.requirementText,
      criteria: Object.fromEntries(latest.criteria.map((criterion) => [criterion.id, criterion.text])),
    };
  }
  return ctx.ui.edit;
}

function requirementPanel(ctx) {
  const { state, busy, act, api } = ctx;
  const versions = state.requirement.versions;
  const latest = versions[versions.length - 1];
  const edit = editState(ctx, latest);
  const isDraft = latest.status === 'draft';

  const dirty = () =>
    !same(edit.requirementText, latest.requirementText) ||
    state.criteria.some((criterion) => !same(edit.criteria[criterion.id], criterion.text));

  let saveButton;
  let approveButton;
  let dirtyNote;
  const sync = () => {
    const changed = dirty();
    saveButton.disabled = busy || !changed;
    approveButton.disabled = busy || !isDraft || changed;
    dirtyNote.hidden = !changed;
    document.querySelectorAll('[data-confirm-mapping]').forEach((button) => {
      button.disabled = busy || changed;
    });
  };

  const save = () =>
    act(
      () =>
        api.editRequirement({
          requirementText: edit.requirementText,
          criteria: state.criteria.map((criterion) => ({ id: criterion.id, text: edit.criteria[criterion.id] })),
        }),
      (result) => ({
        kind: 'success',
        text: result.createdNewVersion
          ? `Version ${result.version} was created as a draft. Evidence gathered for the earlier version is now historical. Approve version ${result.version}, then run the tests again.`
          : `Draft version ${result.version} was saved.`,
      }),
      'save',
    );

  const approve = () =>
    act(
      () => api.approve(),
      (result) => ({
        kind: 'success',
        text: `Version ${result.version} is approved and can no longer change. You can now run its test in Evidence Lab.`,
      }),
      'approve',
    );

  const requirementField = h(
    'div',
    { class: 'stack' },
    h('label', { for: 'req-text' }, 'Requirement'),
    h(
      'textarea',
      {
        id: 'req-text',
        rows: 2,
        maxlength: 600,
        'data-key': 'req-text',
        oninput: (event) => {
          edit.requirementText = event.target.value;
          sync();
        },
      },
      edit.requirementText,
    ),
  );

  const criterionFields = state.criteria.map((criterion) =>
    h(
      'fieldset',
      { class: 'criterion' },
      h('legend', null, idCode(criterion.id), ' ', statusBadge(criterion.status)),
      h('label', { for: `crit-${criterion.id}`, class: 'visually-hidden' }, `Wording of ${criterion.id}`),
      h(
        'textarea',
        {
          id: `crit-${criterion.id}`,
          rows: 3,
          maxlength: 600,
          'data-key': `crit-${criterion.id}`,
          oninput: (event) => {
            edit.criteria[criterion.id] = event.target.value;
            sync();
          },
        },
        edit.criteria[criterion.id],
      ),
      mappingBlock(ctx, criterion),
    ),
  );

  saveButton = h(
    'button',
    { type: 'button', class: 'button button-secondary', onclick: save },
    saveLabel(ctx, latest),
  );
  approveButton = h(
    'button',
    { type: 'button', class: 'button button-primary', onclick: approve },
    ctx.ui.working === 'approve' ? 'Approving...' : `Approve version ${latest.version}`,
  );
  dirtyNote = h('p', { class: 'hint', hidden: true }, 'You have unsaved changes. Save them before you approve.');
  queueMicrotask(sync);

  return panel(
    `Requirement ${state.requirement.id}`,
    h(
      'p',
      { class: 'meta' },
      `Version ${latest.version} `,
      chip(latest.status, latest.status),
      latest.basedOn ? ` edited from version ${latest.basedOn}.` : '',
    ),
    isDraft
      ? notice(
          'info',
          'This version is a draft. Approving it means you accept this wording as the standard the tests are measured against.',
        )
      : notice(
          'info',
          `Version ${latest.version} is approved and cannot change. If you edit it, a new version is created and the evidence gathered for version ${latest.version} becomes historical until the new version is approved and tested again.`,
        ),
    h('div', { class: 'stack' }, requirementField, h('h3', null, 'Acceptance criteria'), ...criterionFields),
    h('div', { class: 'actions' }, saveButton, approveButton),
    dirtyNote,
  );
}

function saveLabel(ctx, latest) {
  if (ctx.ui.working === 'save') return 'Saving...';
  return latest.status === 'draft' ? 'Save draft' : `Save as version ${latest.version + 1}`;
}

function mappingBlock(ctx, criterion) {
  const { busy, act, api } = ctx;
  const mapping = criterion.mapping;
  switch (mapping.state) {
    case 'matches_test_design':
      return h('p', { class: 'mapping' }, 'Checked by ', idCode(mapping.testId), '. The test was written for exactly this wording.');
    case 'confirmed':
      return h('p', { class: 'mapping' }, 'Checked by ', idCode(mapping.testId), '. You confirmed that the test still fits this wording.');
    case 'needs_confirmation':
      return h(
        'div',
        { class: 'notice notice-warning' },
        h('p', null, 'You changed this wording. ', idCode(mapping.testId), ' was written for the original. Confirm that it still checks what this criterion now says, or the test stays locked.'),
        h(
          'button',
          {
            type: 'button',
            class: 'button button-secondary',
            'data-confirm-mapping': criterion.id,
            disabled: busy,
            onclick: () =>
              act(
                () => api.confirmMapping(criterion.id),
                () => ({ kind: 'success', text: `You confirmed that ${mapping.testId} still checks ${criterion.id}.` }),
                'confirm',
              ),
          },
          `Confirm that ${mapping.testId} still checks ${criterion.id}`,
        ),
      );
    default:
      return h('p', { class: 'mapping' }, 'No SpecLens test covers this criterion, so it will show UNTESTED until one exists.');
  }
}

function versionsPanel(state) {
  return panel(
    'Version history',
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'table table-cards' },
        h('caption', { class: 'visually-hidden' }, 'Every version of the requirement'),
        h(
          'thead',
          null,
          h('tr', null, ['Version', 'Status', 'Created', 'Approved', 'Fingerprint'].map((name) => h('th', { scope: 'col' }, name))),
        ),
        h(
          'tbody',
          null,
          state.requirement.versions.map((version) =>
            h(
              'tr',
              null,
              h('td', { 'data-label': 'Version' }, `Version ${version.version}`),
              h('td', { 'data-label': 'Status' }, chip(version.status, version.status)),
              h('td', { 'data-label': 'Created' }, formatDateTime(version.createdAt)),
              h('td', { 'data-label': 'Approved' }, version.approvedAt ? formatDateTime(version.approvedAt) : 'Not approved'),
              h('td', { 'data-label': 'Fingerprint' }, version.digest ? idCode(version.shortDigest) : 'None until approved'),
            ),
          ),
        ),
      ),
    ),
    h('p', { class: 'hint' }, 'The fingerprint is a short digest of the exact approved text, so any later change is visible.'),
  );
}
