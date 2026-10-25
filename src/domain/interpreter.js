// An offline, rule based interpreter. It is deliberately small and honest: it recognises
// the demo request and a few close rewordings, and says so plainly for anything else.
// No AI service is called and nothing leaves this computer.

import { normalizeText } from './digest.js';
import { CANONICAL, INTENT_ID, REQUIREMENT_ID } from './catalog.js';
import { LIMITS, cleanText } from './requirements.js';

export const INTERPRETER_ID = 'offline rules v1';

const PATTERN =
  /\b(?:don'?t|do not|never|must not|should not|shouldn'?t)\b.*\b(?:let|allow|permit)\b.*\b(?:students?|users?)\b.*\b(?:over-?spend|spend more than|exceed(?:ing)? (?:their|the) (?:budget|balance))/;

export function interpretIntent(rawText) {
  const text = cleanText('The request', rawText, LIMITS.intent);
  if (!text.ok) return { ok: false, message: text.message };

  const lowered = normalizeText(text.value).toLowerCase().replace(/[‘’]/g, "'");
  if (!PATTERN.test(lowered)) {
    return {
      ok: true,
      recognised: false,
      interpreter: INTERPRETER_ID,
      message:
        'This offline demo interpreter only recognises the example request about students overspending. Nothing was recorded. Try the example, or reset and write the requirement yourself in a later version.',
    };
  }

  return {
    ok: true,
    recognised: true,
    interpreter: INTERPRETER_ID,
    intent: { id: INTENT_ID, text: text.value },
    proposal: {
      requirementId: REQUIREMENT_ID,
      version: 1,
      requirementText: CANONICAL.requirementText,
      clarifications: [...CANONICAL.clarifications],
      criteria: CANONICAL.criteria.map((criterion) => ({
        id: criterion.id,
        text: criterion.text,
        testId: criterion.testId,
      })),
    },
  };
}
