import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TEST_001 } from '../src/domain/catalog.js';
import { classifyRun } from '../src/domain/evidence.js';
import { executeScenario } from '../src/runner/execute.js';
import { readSeed, repairedSource, writeVariant } from './helpers.js';

async function runSource(source, timeoutMs = 8000) {
  const appPath = await writeVariant(source);
  const execution = await executeScenario({ appPath, scenario: TEST_001.scenario, timeoutMs });
  return { execution, verdict: classifyRun(TEST_001, execution) };
}

describe('running the real test in an isolated process', () => {
  it('records a FAIL against the seeded build', async () => {
    const { execution, verdict } = await runSource(await readSeed());
    assert.equal(execution.status, 'completed');
    assert.equal(verdict.outcome, 'FAIL');
    assert.equal(verdict.checks.find((c) => c.id === 'A2').actual, 'accepted');
    assert.equal(execution.report.observations.after.remainingCents, -500);
  });

  it('records a PASS against the repaired build, with the same test and scenario', async () => {
    const { execution, verdict } = await runSource(await repairedSource());
    assert.equal(execution.status, 'completed');
    assert.equal(verdict.outcome, 'PASS');
    assert.equal(execution.report.observations.attempt.result.reason, 'exceeds_remaining_budget');
    assert.equal(execution.report.observations.after.history.length, 2);
  });

  it('reports observations, never a verdict', async () => {
    const { execution } = await runSource(await repairedSource());
    assert.deepEqual(Object.keys(execution.report).sort(), ['observations', 'ok']);
    assert.ok(!('outcome' in execution.report));
  });

  it('measures how long the run took', async () => {
    const { execution } = await runSource(await repairedSource());
    assert.ok(Number.isFinite(execution.durationMs) && execution.durationMs >= 0);
  });

  it('ignores noise the app prints while it runs', async () => {
    const noisy = (await repairedSource()).replace(
      'function addExpense({ label, amountCents }) {',
      "function addExpense({ label, amountCents }) {\n    console.log('SPECLENS_RESULT not json');\n    console.log('hello from the app');",
    );
    const { verdict } = await runSource(noisy);
    assert.equal(verdict.outcome, 'PASS');
  });
});

describe('problems come back as INCONCLUSIVE, never as PASS or FAIL', () => {
  const expectInconclusive = ({ verdict }, cause) => {
    assert.equal(verdict.outcome, 'INCONCLUSIVE');
    assert.equal(verdict.cause, cause);
    assert.ok(verdict.detail.length > 0);
  };

  it('when the app throws on the overspend attempt', async () => {
    const source = (await repairedSource()).replace(
      "return reject('exceeds_remaining_budget');",
      "throw new Error('ledger exploded');",
    );
    const result = await runSource(source);
    expectInconclusive(result, 'app_exception');
    assert.match(result.verdict.detail, /ledger exploded/);
  });

  it('when the app cannot be created', async () => {
    const result = await runSource("export function createTracker() { throw new Error('cannot start'); }\n");
    expectInconclusive(result, 'setup_error');
    assert.match(result.verdict.detail, /cannot start/);
  });

  it('when the app does not provide what the test needs', async () => {
    expectInconclusive(await runSource('export const nothing = 1;\n'), 'setup_error');
  });

  it('when the app file has a syntax error', async () => {
    expectInconclusive(await runSource('export function createTracker( {\n'), 'setup_error');
  });

  it('when the app file does not exist', async () => {
    const execution = await executeScenario({
      appPath: '/definitely/not/here/tracker.mjs',
      scenario: TEST_001.scenario,
      timeoutMs: 8000,
    });
    assert.equal(classifyRun(TEST_001, execution).cause, 'setup_error');
  });

  it('when the app refuses the setup expenses, so the starting state is wrong', async () => {
    const source = (await readSeed()).replace(
      "if (typeof label !== 'string'",
      "if (true) return reject('closed for business');\n    if (typeof label !== 'string'",
    );
    expectInconclusive(await runSource(source), 'setup_invalid');
  });

  it('when the app never finishes, after the time limit', async () => {
    const started = Date.now();
    const result = await runSource('export function createTracker() { for (;;) {} }\n', 600);
    expectInconclusive(result, 'timeout');
    assert.ok(Date.now() - started < 5000, 'the hung process must be stopped promptly');
  });

  it('when the app ends the process without a report', async () => {
    expectInconclusive(await runSource('export function createTracker() { process.exit(0); }\n'), 'invalid_output');
  });

  it('when the process is killed', async () => {
    expectInconclusive(
      await runSource("export function createTracker() { process.kill(process.pid, 'SIGKILL'); }\n"),
      'runner_crash',
    );
  });

  it('when the app exits with an error code and no report', async () => {
    expectInconclusive(await runSource('export function createTracker() { process.exit(3); }\n'), 'runner_crash');
  });

  it('when the app floods the output', async () => {
    const source = [
      "import { writeSync } from 'node:fs';",
      'export function createTracker() {',
      "  const chunk = 'x'.repeat(100000) + '\\n';",
      '  for (let i = 0; i < 40; i += 1) writeSync(1, chunk);',
      '  process.exit(0);',
      '}',
      '',
    ].join('\n');
    expectInconclusive(await runSource(source), 'invalid_output');
  });

  it('when the app throws something that is not an error object', async () => {
    const source = (await repairedSource()).replace(
      "if (amountCents > remainingCents()) return reject('exceeds_remaining_budget');",
      "if (amountCents > remainingCents()) throw 'plain text failure';",
    );
    const result = await runSource(source);
    expectInconclusive(result, 'app_exception');
    assert.match(result.verdict.detail, /plain text failure/);
  });
});
