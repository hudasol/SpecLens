// The fixed material of the demo: the example request, the requirement the offline
// interpreter proposes for it, and the one executable test that ships with SpecLens.

import { textSignature } from './digest.js';

export const INTENT_ID = 'INT-001';
export const REQUIREMENT_ID = 'REQ-001';
export const INTENT_EXAMPLE = "Don't let students overspend.";

export const CANONICAL = Object.freeze({
  requirementText: 'A student must not be able to spend more than the budget they have left.',
  criteria: Object.freeze([
    Object.freeze({
      id: 'AC-001',
      testId: 'TEST-001',
      text: 'When an expense is larger than the remaining budget, the tracker rejects it, the remaining balance is unchanged, and no entry is added to the history.',
    }),
    Object.freeze({
      id: 'AC-002',
      testId: null,
      text: 'When an expense is exactly equal to the remaining budget, the tracker accepts it and the remaining balance becomes $0.00.',
    }),
  ]),
});

// Budget $100.00, $80.00 already spent, $20.00 left, then an attempt to spend $25.00.
export const SCENARIO = Object.freeze({
  budgetCents: 10000,
  seed: Object.freeze([
    Object.freeze({ label: 'Textbooks', amountCents: 5000 }),
    Object.freeze({ label: 'Groceries', amountCents: 3000 }),
  ]),
  attempt: Object.freeze({ label: 'Concert ticket', amountCents: 2500 }),
});

export const TEST_001 = Object.freeze({
  id: 'TEST-001',
  version: 1,
  title: 'Overspend attempt is rejected with no side effects',
  covers: 'AC-001',
  // The test was written for this exact wording. A different wording needs the user to confirm the pairing.
  designedForSignature: textSignature(CANONICAL.criteria[0].text),
  scenario: SCENARIO,
  // Said plainly beside every result so a PASS is never read as more than it is.
  limits: Object.freeze([
    'It does not check an expense that is exactly equal to the remaining budget (that is AC-002, which has no SpecLens test).',
    'It does not check other amounts, other budgets, or longer sequences of expenses.',
    'It does not check which reason the tracker gives when it rejects the expense.',
    'It does not show that the app is free of other defects.',
    'It does not show that the requirement itself is the right one.',
  ]),
  checks: Object.freeze([
    Object.freeze({ id: 'A1', kind: 'precondition', label: 'The attempt is larger than the remaining budget' }),
    Object.freeze({ id: 'A2', kind: 'assertion', label: 'The tracker rejects the attempt' }),
    Object.freeze({ id: 'A3', kind: 'assertion', label: 'The remaining balance is unchanged' }),
    Object.freeze({ id: 'A4', kind: 'assertion', label: 'No entry is added to the history' }),
  ]),
});

export const TESTS = Object.freeze([TEST_001]);

export function getTest(id) {
  return TESTS.find((test) => test.id === id) ?? null;
}
