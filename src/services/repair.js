// The one documented repair for the one seeded defect.
// It is an exact find and replace. SpecLens is not a general repair engine.

export const REPAIR_001 = Object.freeze({
  id: 'REPAIR-001',
  title: 'Add the missing remaining budget check to addExpense',
  file: 'tracker.mjs',
  explanation:
    'addExpense never compares the amount with the remaining budget, so it saves any positive amount. The repair adds that one comparison before the expense is saved.',
  find: '    // SEEDED DEFECT: nothing here compares amountCents with the remaining budget.\n',
  replace: "    if (amountCents > remainingCents()) return reject('exceeds_remaining_budget');\n",
});

// Returns { ok: true, source } or { ok: false, reason }. Never throws for bad input.
export function applyRepairToSource(source, repair = REPAIR_001) {
  if (typeof source !== 'string') return { ok: false, reason: 'source_not_text' };
  // A copy saved with Windows line endings must match too, and keeps those line endings.
  const windows = source.includes('\r\n');
  const find = windows ? repair.find.replace(/\n/g, '\r\n') : repair.find;
  const replace = windows ? repair.replace.replace(/\n/g, '\r\n') : repair.replace;
  const parts = source.split(find);
  if (parts.length === 1) return { ok: false, reason: 'defect_marker_not_found' };
  if (parts.length > 2) return { ok: false, reason: 'defect_marker_ambiguous' };
  return { ok: true, source: parts.join(replace) };
}

// What the user sees as the patch: the removed and added lines, without code indentation noise.
export function describePatch(repair = REPAIR_001) {
  return {
    file: repair.file,
    removed: repair.find.replace(/\n$/, '').trim().split('\n'),
    added: repair.replace.replace(/\n$/, '').trim().split('\n'),
  };
}
