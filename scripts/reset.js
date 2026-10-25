// npm run reset: restore the seeded demo (empty record, defective app) without starting the server.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../src/services/speclens-service.js';
import { writeFileAtomic } from '../src/services/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(root, process.env.SPECLENS_DATA_DIR ?? '.speclens');

try {
  // A damaged state file is exactly why someone runs this, so clear it before the service reads it.
  await writeFileAtomic(path.join(dataDir, 'state.json'), `${JSON.stringify({ schema: 1, events: [] }, null, 2)}\n`);
  const service = await createService({ dataDir, seedPath: path.join(root, 'demo-app', 'tracker.defective.js') });
  await service.reset();
  console.log('SpecLens was reset. The record is empty and the app is back to its seeded state.');
} catch (error) {
  console.error(`SpecLens could not reset: ${error.message}`);
  process.exit(1);
}
