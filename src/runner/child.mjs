// Runs one scenario against the app in this separate process and reports what it saw.
// It reports observations only. It never decides PASS or FAIL: the parent process does that.
//
// Usage: node child.mjs <path to app file> <scenario as JSON>
// The parent sends a one time token on standard input. It is read before the app is loaded and kept
// out of reach of the app, and the report must carry it. A line the app prints on its own cannot.

import { writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MARK = 'SPECLENS_RESULT ';
let stage = 'setup';

let token = '';
for await (const chunk of process.stdin) token += chunk;
token = token.trim();

// Synchronous, so the report is written completely before the process exits.
function emit(report) {
  writeSync(1, `${MARK}${token} ${JSON.stringify(report)}\n`);
}

function fail(error) {
  emit({ ok: false, stage, error: String(error?.message ?? error) });
  process.exit(0);
}

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

const [appPath, scenarioJson] = process.argv.slice(2);

function snapshot(tracker) {
  return {
    budgetCents: tracker.budgetCents(),
    spentCents: tracker.spentCents(),
    remainingCents: tracker.remainingCents(),
    history: tracker.history(),
  };
}

const observations = { seed: [] };
let tracker;

try {
  const scenario = JSON.parse(scenarioJson);
  const mod = await import(pathToFileURL(appPath).href);
  tracker = mod.createTracker({ budgetCents: scenario.budgetCents });
  for (const item of scenario.seed) {
    observations.seed.push({ ...item, result: tracker.addExpense({ ...item }) });
  }
  observations.before = snapshot(tracker);

  stage = 'attempt';
  observations.attempt = { ...scenario.attempt, result: tracker.addExpense({ ...scenario.attempt }) };

  stage = 'snapshot';
  observations.after = snapshot(tracker);
} catch (error) {
  fail(error);
}

emit({ ok: true, observations });
process.exit(0);
