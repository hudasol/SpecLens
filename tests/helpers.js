import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyRepairToSource } from '../src/services/repair.js';

export const SEED_PATH = fileURLToPath(new URL('../demo-app/tracker.defective.js', import.meta.url));

export async function tempDir(prefix = 'speclens-test-') {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export function readSeed() {
  return readFile(SEED_PATH, 'utf8');
}

export async function repairedSource() {
  const result = applyRepairToSource(await readSeed());
  assert.equal(result.ok, true, 'the documented repair must apply to the pristine seed');
  return result.source;
}

// Writes a variant of the app to a fresh folder and returns its file path.
export async function writeVariant(source, name = 'tracker.mjs') {
  const dir = await tempDir('speclens-app-');
  const file = path.join(dir, name);
  await writeFile(file, source);
  return file;
}

// Imports an app variant so unit tests can exercise it directly.
export async function loadTracker(source) {
  const file = await writeVariant(source);
  return import(pathToFileURL(file).href);
}
