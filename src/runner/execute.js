// Starts the isolated process, enforces a time limit, and turns whatever happened into a plain record.
// It never throws and never decides a verdict. Anything unexpected becomes a failed execution,
// which the evidence rules record as INCONCLUSIVE.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHILD = fileURLToPath(new URL('./child.mjs', import.meta.url));
const MARK = 'SPECLENS_RESULT ';
const MAX_OUTPUT_BYTES = 256 * 1024;

export const DEFAULT_TIMEOUT_MS = 10000;

function minimalEnv() {
  const env = { NODE_ENV: 'test' };
  for (const key of ['PATH', 'SystemRoot', 'TEMP', 'TMP']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

const tail = (text) => text.trim().split('\n').slice(-3).join(' ').slice(0, 300);

// Resolves to { status: 'completed', report, durationMs } or { status: 'failed', cause, detail, durationMs }.
export function executeScenario({ appPath, scenario, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let overflow = false;
    let timedOut = false;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, durationMs: Date.now() - started });
    };

    let child;
    try {
      child = spawn(process.execPath, [CHILD, appPath, JSON.stringify(scenario)], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: minimalEnv(),
        windowsHide: true,
      });
    } catch (error) {
      resolve({ status: 'failed', cause: 'runner_crash', detail: `Could not start the test process: ${error.message}`, durationMs: 0 });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const collect = (which) => (chunk) => {
      if (which === 'out') stdout += chunk;
      else stderr += chunk;
      if (stdout.length + stderr.length > MAX_OUTPUT_BYTES && !overflow) {
        overflow = true;
        child.kill('SIGKILL');
      }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', collect('out'));
    child.stderr.on('data', collect('err'));

    child.on('error', (error) => {
      finish({ status: 'failed', cause: 'runner_crash', detail: `The test process could not run: ${error.message}` });
    });

    child.on('close', (code, signal) => {
      if (timedOut) {
        finish({ status: 'failed', cause: 'timeout', detail: `The test did not finish within ${timeoutMs} ms and was stopped.` });
        return;
      }
      if (overflow) {
        finish({ status: 'failed', cause: 'invalid_output', detail: 'The test process printed far more output than a report needs and was stopped.' });
        return;
      }
      const line = stdout.split('\n').reverse().find((text) => text.startsWith(MARK));
      if (!line) {
        const crashed = signal !== null || code !== 0;
        finish({
          status: 'failed',
          cause: crashed ? 'runner_crash' : 'invalid_output',
          detail: crashed
            ? `The test process stopped without a report (${signal ?? `exit code ${code}`}). ${tail(stderr)}`.trim()
            : 'The test process ended without returning a report.',
        });
        return;
      }
      try {
        finish({ status: 'completed', report: JSON.parse(line.slice(MARK.length)) });
      } catch {
        finish({ status: 'failed', cause: 'invalid_output', detail: 'The test process returned a report that is not valid JSON.' });
      }
    });
  });
}
