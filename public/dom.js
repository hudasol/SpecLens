// Tiny helpers for building the interface. Text is always added as text, never as markup,
// so nothing a user types can become HTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

function addChildren(element, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function h(tag, attributes, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'class') element.className = value;
    else if (name.startsWith('on') && typeof value === 'function') element.addEventListener(name.slice(2), value);
    else if (value === true) element.setAttribute(name, '');
    else element.setAttribute(name, String(value));
  }
  addChildren(element, children);
  return element;
}

export function svgEl(tag, attributes, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes ?? {})) element.setAttribute(name, String(value));
  addChildren(element, children);
  return element;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// Every status is a word and a shape as well as a colour, so colour is never the only signal.
const SHAPES = {
  PASS: [['circle', { cx: 10, cy: 10, r: 8 }], ['path', { d: 'M6 10.5l3 3 5-6' }]],
  FAIL: [['circle', { cx: 10, cy: 10, r: 8 }], ['path', { d: 'M7 7l6 6M13 7l-6 6' }]],
  UNTESTED: [['circle', { cx: 10, cy: 10, r: 8, 'stroke-dasharray': '3 3' }]],
  INCONCLUSIVE: [
    ['path', { d: 'M10 2l8 8-8 8-8-8z' }],
    ['path', { d: 'M8.2 8.2a1.9 1.9 0 1 1 2.9 1.6c-.7.4-1.1.8-1.1 1.6' }],
    ['circle', { cx: 10, cy: 13.6, r: 0.6, fill: 'currentColor' }],
  ],
};

export function statusIcon(status) {
  const shapes = SHAPES[status] ?? SHAPES.UNTESTED;
  return svgEl(
    'svg',
    {
      viewBox: '0 0 20 20',
      width: 18,
      height: 18,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'status-icon',
    },
    shapes.map(([tag, attributes]) => svgEl(tag, attributes)),
  );
}

export function statusBadge(status) {
  return h('span', { class: `badge badge-${status.toLowerCase()}` }, statusIcon(status), h('span', null, status));
}

const CHECK_WORDS = { held: ['PASS', 'Held'], violated: ['FAIL', 'Violated'], not_evaluated: ['UNTESTED', 'Not evaluated'] };

export function checkBadge(status) {
  const [shape, word] = CHECK_WORDS[status] ?? CHECK_WORDS.not_evaluated;
  return h('span', { class: `badge badge-${shape.toLowerCase()}` }, statusIcon(shape), h('span', null, word));
}

export const idCode = (id) => h('code', { class: 'id' }, id);

export const chip = (text, kind = 'neutral') => h('span', { class: `chip chip-${kind}` }, text);

// Only errors interrupt a screen reader. Other notices are announced through the page's polite live region.
export function notice(kind, text) {
  return h('div', { class: `notice notice-${kind}`, role: kind === 'error' ? 'alert' : null }, text);
}

export function bulletList(items, className = 'plain-list') {
  return h('ul', { class: className }, items.map((item) => h('li', null, item)));
}
