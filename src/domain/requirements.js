import { normalizeText, sha256, textSignature } from './digest.js';

export const LIMITS = Object.freeze({ intent: 300, requirement: 600, criterion: 600 });

// Returns { ok: true, value } with tidy text, or { ok: false, message }.
export function cleanText(label, value, max) {
  if (typeof value !== 'string') return { ok: false, message: `${label} must be text.` };
  const tidy = value.replace(/\s+/g, ' ').trim();
  if (tidy === '') return { ok: false, message: `${label} cannot be empty.` };
  if (tidy.length > max) return { ok: false, message: `${label} is longer than ${max} characters.` };
  return { ok: true, value: tidy };
}

// Digest of what an approver actually saw: the requirement and every criterion, in order.
export function contentDigest({ requirementText, criteria }) {
  return sha256(
    JSON.stringify({
      requirement: normalizeText(requirementText),
      criteria: criteria.map((criterion) => [criterion.id, normalizeText(criterion.text)]),
    }),
  );
}

export function withSignature(criterion) {
  return { ...criterion, signature: textSignature(criterion.text) };
}

// Edits may reword criteria but not add or remove them.
export function validateEdit(latest, input) {
  if (!input || typeof input !== 'object') return { ok: false, message: 'Send the requirement and its criteria.' };
  const requirement = cleanText('The requirement', input.requirementText, LIMITS.requirement);
  if (!requirement.ok) return requirement;
  if (!Array.isArray(input.criteria)) return { ok: false, message: 'Send the criteria as a list.' };
  const wanted = latest.criteria.map((criterion) => criterion.id);
  const given = input.criteria.map((criterion) => criterion?.id);
  if (given.length !== wanted.length || wanted.some((id) => !given.includes(id))) {
    return { ok: false, message: `Send exactly these criteria: ${wanted.join(', ')}.` };
  }
  const criteria = [];
  for (const id of wanted) {
    const item = input.criteria.find((criterion) => criterion.id === id);
    const text = cleanText(`Criterion ${id}`, item.text, LIMITS.criterion);
    if (!text.ok) return text;
    criteria.push({ id, text: text.value });
  }
  return { ok: true, requirementText: requirement.value, criteria };
}
