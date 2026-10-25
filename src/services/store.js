// Storage for the event log: one JSON file, replaced atomically so a crash never leaves half a file.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateLog } from '../domain/events.js';

export class StateFileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StateFileError';
  }
}

// On Windows a virus scanner or an indexer can hold a file for a moment, which makes a rename fail
// with EPERM, EBUSY or EACCES. A few short retries solve that. Any other error is reported at once.
async function renameWithRetry(from, to, attempts = 6) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const busy = ['EPERM', 'EBUSY', 'EACCES'].includes(error.code);
      if (!busy || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 30 * attempt));
    }
  }
}

export async function writeFileAtomic(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, text, 'utf8');
    await renameWithRetry(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export function createStore(statePath) {
  return {
    path: statePath,

    async load() {
      let text;
      try {
        text = await readFile(statePath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw new StateFileError(`The saved state could not be read (${error.code ?? error.message}).`);
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new StateFileError('The saved state is not valid JSON. Run "npm run reset" to start again.');
      }
      const problem = validateLog(parsed?.events);
      if (problem) throw new StateFileError(`The saved state is damaged: ${problem} Run "npm run reset" to start again.`);
      return parsed.events;
    },

    async save(events) {
      await writeFileAtomic(statePath, `${JSON.stringify({ schema: 1, events }, null, 2)}\n`);
    },
  };
}
