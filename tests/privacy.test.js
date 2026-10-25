import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INTENT_EXAMPLE, TEST_001 } from '../src/domain/catalog.js';
import { classifyRun } from '../src/domain/evidence.js';
import { scrubPaths } from '../src/domain/privacy.js';
import { executeScenario } from '../src/runner/execute.js';
import { createService } from '../src/services/speclens-service.js';
import { readSeed, tempDir, writeVariant } from './helpers.js';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('keeping folders and user names out of recorded details', () => {
  it('keeps only the file name from file addresses and from both kinds of path', () => {
    assert.equal(scrubPaths('Error in file:///C:/Projects/demo/tracker.mjs:3:9'), 'Error in tracker.mjs:3:9');
    assert.equal(scrubPaths('at file:///srv/demo/app/child.mjs:41'), 'at child.mjs:41');
    assert.equal(scrubPaths('Cannot find C:\\Projects\\demo\\x\\tracker.mjs now'), 'Cannot find tracker.mjs now');
    assert.equal(scrubPaths('failed (/tmp/speclens-app-abc/tracker.mjs)'), 'failed (tracker.mjs)');
  });

  it('leaves ordinary text alone', () => {
    for (const text of ['and/or', 'The balance is $20.00 of $100.00', '25/50 spent', 'exits with code 1', 'a / b']) {
      assert.equal(scrubPaths(text), text);
    }
    assert.equal(scrubPaths(undefined), undefined);
  });

  it('keeps the folder of a crashed app out of the saved run', async () => {
    const crashing = `${await readSeed()}\nprocess.stderr.write(new Error('boom').stack + '\\n');\nprocess.exit(3);\n`;
    const folder = await tempDir('speclens-broken-');
    const seedPath = path.join(folder, 'tracker.defective.js');
    await writeFile(seedPath, crashing);

    // The raw message from the crashed process does contain full file addresses, so the check below means something.
    const raw = classifyRun(TEST_001, await executeScenario({ appPath: await writeVariant(crashing), scenario: TEST_001.scenario }));
    assert.ok(raw.detail.includes('file://'), raw.detail);

    const dataDir = await tempDir('speclens-data-');
    const service = await createService({ dataDir, seedPath });
    await service.proposeInterpretation(INTENT_EXAMPLE);
    await service.approveRequirement();
    await service.runTest('TEST-001');
    const run = (await service.getState()).runs[0];
    assert.equal(run.outcome, 'INCONCLUSIVE');
    assert.equal(run.cause, 'runner_crash');
    assert.ok(!run.detail.includes('file://') && !run.detail.includes(tmpdir()) && !run.detail.includes(dataDir), run.detail);
    assert.match(run.detail, /child\.mjs:\d+/);
  });
});
