// Student budget tracker: the application under test.
//
// This is the pristine copy that contains one deliberately seeded defect.
// SpecLens copies it to .speclens/app/tracker.js when the demo is reset.
// Tests run against the copy, never against this file. Do not fix it here.
//
// All amounts are whole cents, so a budget never suffers from rounding errors.

export function createTracker({ budgetCents }) {
  if (!Number.isInteger(budgetCents) || budgetCents < 0) {
    throw new TypeError('budgetCents must be a non negative whole number');
  }

  const expenses = [];
  let nextId = 1;

  const spentCents = () => expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const remainingCents = () => budgetCents - spentCents();

  function reject(reason) {
    return { ok: false, reason };
  }

  function addExpense({ label, amountCents }) {
    if (typeof label !== 'string' || label.trim() === '') return reject('missing_label');
    if (!Number.isInteger(amountCents) || amountCents <= 0) return reject('invalid_amount');
    // SEEDED DEFECT: nothing here compares amountCents with the remaining budget.
    const expense = { id: `E${nextId++}`, label: label.trim(), amountCents };
    expenses.push(expense);
    return { ok: true, expense: { ...expense } };
  }

  return {
    budgetCents: () => budgetCents,
    spentCents,
    remainingCents,
    history: () => expenses.map((expense) => ({ ...expense })),
    addExpense,
  };
}
