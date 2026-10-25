import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyRepairToSource, describePatch, REPAIR_001 } from '../src/services/repair.js';
import { loadTracker, readSeed, repairedSource } from './helpers.js';

const BUDGET = 10000;

async function trackerWith(source, spent = [5000, 3000]) {
  const { createTracker } = await loadTracker(source);
  const tracker = createTracker({ budgetCents: BUDGET });
  spent.forEach((amountCents, index) => {
    const result = tracker.addExpense({ label: `Seed ${index + 1}`, amountCents });
    assert.equal(result.ok, true);
  });
  return tracker;
}

describe('budget tracker behaviour that holds in every build', () => {
  for (const [name, load] of [
    ['seeded build', readSeed],
    ['repaired build', repairedSource],
  ]) {
    describe(name, () => {
      it('rejects a budget that is not a non negative whole number of cents', async () => {
        const { createTracker } = await loadTracker(await load());
        for (const bad of [-1, 1.5, '100', NaN, undefined]) {
          assert.throws(() => createTracker({ budgetCents: bad }), TypeError);
        }
      });

      it('rejects amounts that are not positive whole cents', async () => {
        const tracker = await trackerWith(await load(), []);
        for (const bad of [0, -5, 1.5, '10', NaN, null, undefined]) {
          const result = tracker.addExpense({ label: 'Bad', amountCents: bad });
          assert.deepEqual(result, { ok: false, reason: 'invalid_amount' });
        }
        assert.equal(tracker.history().length, 0);
      });

      it('rejects a missing or blank label', async () => {
        const tracker = await trackerWith(await load(), []);
        for (const bad of ['', '   ', undefined, 7]) {
          assert.deepEqual(tracker.addExpense({ label: bad, amountCents: 100 }), {
            ok: false,
            reason: 'missing_label',
          });
        }
      });

      it('accepts a valid expense and reports the new balance', async () => {
        const tracker = await trackerWith(await load());
        assert.equal(tracker.remainingCents(), 2000);
        const result = tracker.addExpense({ label: '  Bus pass ', amountCents: 1500 });
        assert.equal(result.ok, true);
        assert.equal(result.expense.label, 'Bus pass');
        assert.equal(tracker.remainingCents(), 500);
        assert.equal(tracker.spentCents(), 9500);
        assert.equal(tracker.budgetCents(), BUDGET);
      });

      it('hands out copies, so callers cannot change the real history', async () => {
        const tracker = await trackerWith(await load());
        tracker.history()[0].amountCents = 1;
        tracker.history().pop();
        assert.equal(tracker.history().length, 2);
        assert.equal(tracker.history()[0].amountCents, 5000);
        assert.equal(tracker.remainingCents(), 2000);
      });

      it('gives each expense its own identifier', async () => {
        const tracker = await trackerWith(await load());
        const ids = tracker.history().map((expense) => expense.id);
        assert.equal(new Set(ids).size, ids.length);
      });
    });
  }
});

describe('the seeded defect', () => {
  it('is present in the pristine copy and marked exactly once', async () => {
    const seed = await readSeed();
    assert.equal(seed.split('SEEDED DEFECT').length, 2);
    assert.ok(seed.includes(REPAIR_001.find));
  });

  it('lets a $25.00 expense through when only $20.00 remains', async () => {
    const tracker = await trackerWith(await readSeed());
    const result = tracker.addExpense({ label: 'Concert ticket', amountCents: 2500 });
    assert.equal(result.ok, true, 'this is the defect the demo is built to expose');
    assert.equal(tracker.remainingCents(), -500);
    assert.equal(tracker.history().length, 3);
  });
});

describe('the repaired build', () => {
  it('rejects an expense larger than the remaining budget and changes nothing', async () => {
    const tracker = await trackerWith(await repairedSource());
    const result = tracker.addExpense({ label: 'Concert ticket', amountCents: 2500 });
    assert.deepEqual(result, { ok: false, reason: 'exceeds_remaining_budget' });
    assert.equal(tracker.remainingCents(), 2000);
    assert.equal(tracker.history().length, 2);
  });

  it('rejects a single cent more than the remaining budget', async () => {
    const tracker = await trackerWith(await repairedSource());
    assert.equal(tracker.addExpense({ label: 'Edge', amountCents: 2001 }).ok, false);
    assert.equal(tracker.remainingCents(), 2000);
  });

  it('accepts an expense exactly equal to the remaining budget', async () => {
    const tracker = await trackerWith(await repairedSource());
    const result = tracker.addExpense({ label: 'Exactly enough', amountCents: 2000 });
    assert.equal(result.ok, true);
    assert.equal(tracker.remainingCents(), 0);
  });

  it('rejects any further expense once the budget is used up', async () => {
    const tracker = await trackerWith(await repairedSource(), [10000]);
    assert.equal(tracker.remainingCents(), 0);
    assert.deepEqual(tracker.addExpense({ label: 'One more', amountCents: 1 }), {
      ok: false,
      reason: 'exceeds_remaining_budget',
    });
  });

  it('checks the amount is valid before it checks the budget', async () => {
    const tracker = await trackerWith(await repairedSource());
    assert.equal(tracker.addExpense({ label: 'Bad', amountCents: -5 }).reason, 'invalid_amount');
  });
});

describe('the documented repair', () => {
  it('applies to the pristine copy and changes only the marked line', async () => {
    const seed = await readSeed();
    const result = applyRepairToSource(seed);
    assert.equal(result.ok, true);
    const before = seed.split('\n');
    const after = result.source.split('\n');
    assert.equal(after.length, before.length);
    const changed = after.filter((line, index) => line !== before[index]);
    assert.equal(changed.length, 1);
    assert.ok(changed[0].includes('exceeds_remaining_budget'));
  });

  it('refuses to apply twice, to unrelated text, or to ambiguous text', async () => {
    const once = (await applyRepairToSource(await readSeed())).source;
    assert.deepEqual(applyRepairToSource(once), { ok: false, reason: 'defect_marker_not_found' });
    assert.deepEqual(applyRepairToSource('export const x = 1;\n'), {
      ok: false,
      reason: 'defect_marker_not_found',
    });
    const doubled = `${REPAIR_001.find}${REPAIR_001.find}`;
    assert.deepEqual(applyRepairToSource(doubled), { ok: false, reason: 'defect_marker_ambiguous' });
    assert.deepEqual(applyRepairToSource(42), { ok: false, reason: 'source_not_text' });
  });

  it('describes the patch as the lines removed and added', () => {
    const patch = describePatch();
    assert.equal(patch.file, 'tracker.mjs');
    assert.equal(patch.removed.length, 1);
    assert.equal(patch.added.length, 1);
    assert.ok(patch.removed[0].startsWith('// SEEDED DEFECT'));
    assert.ok(patch.added[0].startsWith('if (amountCents > remainingCents())'));
  });
});
