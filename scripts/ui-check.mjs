// A browser check of the whole journey at desktop and phone widths: npm run test:ui
//
// It starts SpecLens on a spare port with a throwaway data folder, drives it with a real browser,
// and checks what a person would see. It needs Playwright and a Chromium browser, which are NOT
// project dependencies. If they are missing it says so and exits without claiming anything passed.

import { mkdir, mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttpServer } from '../src/http/server.js';
import { createService } from '../src/services/speclens-service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.log('SKIPPED: Playwright is not installed here, so the browser check did not run.');
  console.log('Nothing is claimed about the interface from this run.');
  process.exit(0);
}

const shots = path.join(root, 'test-results', 'ui');
await mkdir(shots, { recursive: true });

const service = await createService({
  dataDir: await mkdtemp(path.join(tmpdir(), 'speclens-ui-')),
  seedPath: path.join(root, 'demo-app', 'tracker.defective.js'),
});
const server = createHttpServer({ service, publicDir: path.join(root, 'public') });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const results = [];
let failures = 0;
async function check(name, task) {
  try {
    await task();
    results.push(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const squash = (text) => text.replace(/\s+/g, ' ').trim();

async function stripItems(page) {
  return (await page.locator('#strip li').allInnerTexts()).map(squash);
}

async function noSideScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow <= 1, `the page scrolls sideways by ${overflow}px`);
}

async function journey(browser, label, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  const tab = (name) => page.getByRole('link', { name, exact: true });
  const shot = (name) => page.screenshot({ path: path.join(shots, `${label}-${name}.png`), fullPage: true });
  const name = (text) => `${label}: ${text}`;

  await page.request.post(`${base}/api/reset`, { data: {} });
  await page.goto(base);

  await check(name('loads with four views, a strip and a next step'), async () => {
    await page.getByRole('heading', { name: 'Intent Studio' }).waitFor();
    expect((await page.title()).includes('SpecLens'), 'the title does not name the product');
    expect((await page.locator('#tabs a').count()) === 4, 'expected four tabs');
    expect(squash(await page.locator('#next').innerText()).includes('Write the request'), 'the first next step is wrong');
    expect(squash(await page.locator('#strip').innerText()).includes('Seeded defect present'), 'the build is not shown as seeded');
    await noSideScroll(page);
    await shot('01-start');
  });

  await check(name('a request that is not recognised is explained and records nothing'), async () => {
    await page.locator('#intent-input').fill('Make it faster.');
    await page.getByRole('button', { name: 'Propose a requirement' }).click();
    await page.getByText('only recognises the example request').waitFor();
    expect((await page.locator('#strip li').count()) === 0, 'a requirement appeared');
  });

  await check(name('the example becomes a draft requirement with two criteria'), async () => {
    await page.getByRole('button', { name: 'Use the example request' }).click();
    expect((await page.locator('#intent-input').inputValue()) === "Don't let students overspend.", 'example text missing');
    await page.getByRole('button', { name: 'Propose a requirement' }).click();
    await page.getByRole('heading', { name: 'Requirement REQ-001' }).waitFor();
    const items = await stripItems(page);
    expect(items.length === 2 && items.every((item) => item.endsWith('UNTESTED')), `strip was ${items.join(' | ')}`);
    expect(await page.getByRole('button', { name: 'Approve version 1' }).isEnabled(), 'approve is disabled');
    await noSideScroll(page);
    await shot('02-draft');
  });

  await check(name('the test stays locked until the requirement is approved'), async () => {
    await tab('Evidence Lab').click();
    await page.getByRole('heading', { name: 'Test TEST-001' }).waitFor();
    expect(await page.getByRole('button', { name: 'Run TEST-001' }).isDisabled(), 'run is enabled before approval');
    await page.getByText('Approve it in Intent Studio before running tests').waitFor();
  });

  await check(name('approving makes the version immutable and unlocks the test'), async () => {
    await tab('Intent Studio').click();
    await page.getByRole('button', { name: 'Approve version 1' }).click();
    await page.getByText('Version 1 is approved and can no longer change').waitFor();
    expect(await page.getByRole('button', { name: 'Approve version 1' }).isDisabled(), 'approve is still enabled');
    expect(/approved/i.test(squash(await page.locator('#strip').innerText())), 'strip does not say approved');
  });

  await check(name('running the real test records a FAIL against the seeded build'), async () => {
    await tab('Evidence Lab').click();
    await page.getByRole('button', { name: 'Run TEST-001' }).click();
    await page.locator('.run-detail', { hasText: 'RUN-0001' }).waitFor();
    expect((await page.locator('.run-detail .badge-fail', { hasText: 'Violated' }).count()) === 3, 'expected three violated assertions');
    const items = await stripItems(page);
    expect(items[0] === 'AC-001 FAIL' && items[1] === 'AC-002 UNTESTED', `strip was ${items.join(' | ')}`);
    expect(squash(await page.locator('#strip').innerText()).includes('1 of 2 criteria have current evidence'), 'coverage line is wrong');
    expect(squash(await page.locator('.run-detail').innerText()).includes('What it does not show'), 'limits are missing');
    await noSideScroll(page);
    await shot('03-fail');
  });

  await check(name('a hands on try shows the defect and records nothing'), async () => {
    await page.getByRole('button', { name: 'Try this expense' }).click();
    await page.getByText('The app accepted it.').waitFor();
    await page.getByText('Nothing is recorded and no result changes').waitFor();
    expect((await page.locator('.run-list li').count()) === 1, 'a hands on try created a run');
  });

  await check(name('the documented repair keeps the FAIL on record but not as current evidence'), async () => {
    await page.getByRole('button', { name: 'Apply REPAIR-001' }).click();
    await page.getByText('REPAIR-001 is applied to the working copy').waitFor();
    const items = await stripItems(page);
    expect(items[0] === 'AC-001 UNTESTED', `strip was ${items.join(' | ')}`);
    const history = squash(await page.locator('.run-list').innerText());
    expect(history.includes('RUN-0001') && history.includes('FAIL') && history.includes('Historical'), `history was ${history}`);
    expect(history.includes('The app code is different'), 'the reason is not shown');
  });

  await check(name('the same test now passes, and both runs stay on record'), async () => {
    await page.getByRole('button', { name: 'Run TEST-001' }).click();
    await page.locator('.run-detail', { hasText: 'RUN-0002' }).waitFor();
    const items = await stripItems(page);
    expect(items[0] === 'AC-001 PASS' && items[1] === 'AC-002 UNTESTED', `strip was ${items.join(' | ')}`);
    expect((await page.locator('.run-list li').count()) === 2, 'expected two runs on record');
    await page.getByRole('button', { name: 'Try this expense' }).click();
    await page.getByText('The app rejected it').waitFor();
    await noSideScroll(page);
    await shot('04-pass');
  });

  await check(name('the Proof Map walks the chain and explains what is not proven'), async () => {
    await tab('Proof Map').click();
    await page.getByRole('heading', { name: /Chain for/ }).first().waitFor();
    expect((await page.locator('.chain').count()) === 2, 'expected a chain for each criterion');
    expect((await page.locator('.chain').first().locator('.node').count()) === 6, 'expected six boxes in a chain');
    await page.locator('.chain').first().locator('[data-node="RUN-0002"]').click();
    await page.locator('#detail').waitFor();
    const detail = squash(await page.locator('#detail').innerText());
    expect(detail.includes('RUN-0002') && detail.includes('What it does not show'), 'run detail is incomplete');
    expect(detail.includes('exactly equal to the remaining budget'), 'the AC-002 limit is not stated');
    await page.locator('.earlier').getByRole('button', { name: 'RUN-0001' }).click();
    await page.getByText('historical').first().waitFor();
    await page.locator('.chain').nth(1).locator('[data-node="NOTEST-AC-002"]').click();
    await page.getByText('not recorded here and are not counted as evidence').waitFor();
    await noSideScroll(page);
    await shot('05-map');
  });

  await check(name('the Build Replay lists the recorded events and where results changed'), async () => {
    await tab('Build Replay').click();
    await page.locator('.timeline').waitFor();
    expect((await page.locator('.timeline-item').count()) === 6, 'expected six recorded events');
    expect((await page.locator('.annotation').count()) === 3, 'expected three result changes');
    expect(squash(await page.locator('.annotation').first().innerText()).includes('UNTESTED to FAIL'), 'first change is wrong');
    await page.locator('#replay-range').fill('2');
    expect((await page.locator('.timeline-item.future').count()) === 4, 'scrubbing did not dim later events');
    await page.locator('#replay-range').fill('6');
    expect((await page.locator('.timeline-item.future').count()) === 0, 'showing all did not restore events');
    await page.getByText('AC-002 is UNTESTED').waitFor();
    await noSideScroll(page);
    await shot('06-replay');
  });

  await check(name('editing an approved requirement makes a new version and old evidence historical'), async () => {
    await tab('Intent Studio').click();
    const field = page.locator('#crit-AC-001');
    await field.fill('An expense bigger than the money left is refused and nothing else changes.');
    await page.getByRole('button', { name: 'Save as version 2' }).click();
    await page.getByText('Version 2 was created as a draft').waitFor();
    const items = await stripItems(page);
    expect(items[0] === 'AC-001 UNTESTED', `strip was ${items.join(' | ')}`);
    await page.getByRole('button', { name: 'Approve version 2' }).click();
    await page.getByText('Version 2 is approved and cannot change').waitFor();
    await page.getByRole('button', { name: /Confirm that TEST-001 still checks AC-001/ }).waitFor();
    await shot('07-version-2');
  });

  await check(name('a reworded criterion locks the test until the pairing is confirmed'), async () => {
    await tab('Evidence Lab').click();
    expect(await page.getByRole('button', { name: 'Run TEST-001' }).isDisabled(), 'run is enabled while the pairing is unconfirmed');
    await tab('Intent Studio').click();
    await page.getByRole('button', { name: /Confirm that TEST-001 still checks AC-001/ }).click();
    await page.getByText('You confirmed that TEST-001 still checks AC-001').waitFor();
    await tab('Evidence Lab').click();
    await page.getByRole('button', { name: 'Run TEST-001' }).click();
    await page.locator('.run-detail', { hasText: 'RUN-0003' }).waitFor();
    const items = await stripItems(page);
    expect(items[0] === 'AC-001 PASS', `strip was ${items.join(' | ')}`);
    expect(squash(await page.locator('.run-detail').innerText()).includes('REQ-001 version 2'), 'run is not linked to version 2');
  });

  await check(name('reset asks first, can be cancelled, and then restores the seeded state'), async () => {
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Keep my work' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    expect((await page.locator('#strip li').count()) === 2, 'cancelling lost work');

    await page.getByRole('button', { name: 'Reset demo' }).click();
    await page.getByRole('button', { name: 'Reset everything' }).click();
    await page.getByText('The demo was reset').waitFor();
    await page.getByRole('heading', { name: 'Intent Studio' }).waitFor();
    expect((await page.locator('#strip li').count()) === 0, 'criteria remain after reset');
    expect(squash(await page.locator('#strip').innerText()).includes('Seeded defect present'), 'the app was not restored');
    await tab('Build Replay').click();
    await page.getByText('Nothing has been recorded yet').waitFor();
  });

  await check(name('the keyboard reaches the skip link first and the views have names'), async () => {
    await page.goto(base);
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.className);
    expect(first === 'skip-link', `first tab stop was ${first}`);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('button, a, input, textarea')].filter(
        (el) => !(el.textContent.trim() || el.getAttribute('aria-label') || (el.labels && el.labels.length)),
      ).length,
    );
    expect(unnamed === 0, `${unnamed} controls have no name`);
  });

  await check(name('no errors reached the browser console (this includes policy violations)'), async () => {
    expect(problems.length === 0, problems.join(' | '));
  });

  await context.close();
}

const browser = await chromium.launch();
await journey(browser, 'desktop', { width: 1280, height: 900 });
await journey(browser, 'phone', { width: 375, height: 812 });
await browser.close();
await new Promise((resolve) => server.close(resolve));

console.log(results.join('\n'));
console.log(`\n${results.length - failures} of ${results.length} browser checks passed.`);
console.log(`Screenshots were saved to ${path.relative(root, shots)}.`);
process.exit(failures === 0 ? 0 : 1);
