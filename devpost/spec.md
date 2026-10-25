---
doc: spec
status: approved, then revised after the build
---

# SpecLens 2.0: Technical Spec

## How This Works, In Plain Language

SpecLens is a small local web app. A Node.js server keeps one append only list of events: the original request was recorded, an interpretation was proposed, a requirement was approved, a test was run, a repair was applied. Nothing else is stored.

Every screen is computed from that list, so the four views cannot disagree with each other. When the user presses "Run test", the server starts a separate Node process that loads the real student budget tracker file, plays the scenario against it, and prints what it saw. The server decides PASS, FAIL or INCONCLUSIVE from those observations, appends a run record to the list, and the screens update.

The student budget tracker is a real file on disk. It starts with one seeded defect. The documented repair edits that file with an exact, checked patch, so the rerun exercises changed code.

## The Core Journey Through the System

PRD ref: prd.md > The Core Journey

1. Browser loads the page and calls GET /api/state. The server folds the event log into a state object and returns it, together with the current build fingerprint and the next step.
2. "Propose a requirement" calls POST /api/interpretation/propose. The interpreter returns a deterministic proposal and the service appends `intent_recorded` and `interpretation_proposed`. A request it does not recognise records nothing.
3. Edits call POST /api/requirement/edit. If the latest version is a draft it is updated. If it is approved, a new draft version is created. Both append events.
4. "Approve" calls POST /api/requirement/approve. The service validates the draft and appends `requirement_approved`.
5. "Run test" calls POST /api/tests/TEST-001/run. The service checks that an approved version exists and that the test still maps to the criterion wording. The runner starts a child process, collects observations, and the evidence engine classifies them. The service appends `test_run_recorded`.
6. "Apply repair" calls POST /api/repair/apply. The service checks that the working file is byte identical to the seeded defect, applies the patch, and appends `app_repaired`. The hands on panel calls POST /api/app/attempt, which runs the same isolated process but records nothing.
7. Rerun repeats step 5 and creates a new run record.
8. The Proof Map and Build Replay are built from the same state object.
9. "Reset demo" calls POST /api/reset. The service replaces the event log and restores the seeded defect file.

## Stack

- Node.js 20 or newer (developed and tested on Node 22), ES modules.
- No runtime dependencies. HTTP uses node:http. Hashing uses node:crypto. Child processes use node:child_process.
- Front end: plain HTML, CSS and JavaScript modules served by the same server. No build step.
- Tests: the built in node:test runner.
- Optional browser check: Playwright, installed only by whoever wants to run it. It is not a dependency of the project.

Why: a project that starts with `npm start` on a clean checkout and has nothing to install is easier to review, easier to run on a judge's machine, and has nothing to break.

## Where It Runs and How Someone Tries It

PRD ref: prd.md > Screens and Layout

Locally. `npm start` serves http://127.0.0.1:4173. The port can be changed with the PORT environment variable, the address with HOST and the data folder with SPECLENS_DATA_DIR. The data folder is `.speclens/` and is ignored by git. `npm run reset` restores the seeded state without starting the server. The server listens on this computer only, checks the Host and Origin headers, accepts changes only as JSON, and sends a strict content security policy. A demo video is recorded from the running app.

## Look and Feel

PRD ref: prd.md > Look and Feel

CSS custom properties define the palette (cream paper, ink, accent colours for statuses), spacing and type scale. The first version uses system fonts only, with a monospaced stack for identifiers. Status badges always combine a word and a shape. All text is added to the page as text, never as markup.

## Components

### Requirement register

PRD ref: prd.md > Features and Behavior > Intent Studio

`src/domain/requirements.js` cleans and validates text, checks that an edit keeps the same criteria, and fingerprints the content of a version (SHA 256 of normalised text). The versions themselves are folded from events in `src/domain/state.js`: an edit to a draft changes the draft, an edit to an approved version creates a new draft, and an approved version never changes. A criterion signature is the digest of its normalised wording.

### Interpreter

PRD ref: prd.md > Features and Behavior > Intent Studio

`src/domain/interpreter.js`. A rule based function that recognises the demo request and a few close rewordings and returns a fixed proposal: three clarifying questions, one requirement statement, and two acceptance criteria. For unrecognised input it returns a message and no proposal.

### Student budget tracker (application under test)

PRD ref: prd.md > Features and Behavior > Evidence Lab

`demo-app/tracker.defective.js` is the pristine seeded defect. At first start and at reset it is copied to `.speclens/app/tracker.mjs`, which is the working copy that tests run against. The seed itself is never executed or changed. Amounts are whole cents. `addExpense` rejects invalid amounts in all builds. The seeded defect is a missing comparison with the remaining budget.

### Test registry and runner

PRD ref: prd.md > Features and Behavior > Evidence Lab

`src/domain/catalog.js` defines the example request, the proposed requirement, the scenario, and TEST-001 (overspend attempt is rejected with no side effects) with the signature of the criterion wording it was written for, its four checks and its stated limits. `src/runner/child.mjs` is the isolated process that plays the scenario against the working copy. `src/runner/execute.js` starts it, enforces a timeout, and captures output.

### Evidence engine

PRD ref: prd.md > Features and Behavior > Evidence Contract and statuses

`src/domain/evidence.js`. Pure functions: `classifyRun` turns raw runner output into PASS, FAIL or INCONCLUSIVE and never trusts the runner's own verdict; `verifyRecordedRun` recomputes a stored run's outcome from its own observations, so a stored PASS that the observations do not support is shown as INCONCLUSIVE, and the checks shown are recomputed from the observations as well; `assessRuns` says whether each run is current evidence or historical and why (the requirement version, the criterion wording, the app build or the test version changed, or a later run replaced it); `deriveCriterionStatus` gives a criterion's status from its current evidence, or UNTESTED; `explainRun` states what a run does and does not establish.

### Event log and state fold

PRD ref: prd.md > Features and Behavior > Build Replay

`src/domain/state.js` folds events into requirement versions, mappings, runs, the app build state, coverage and the next step. `src/domain/replay.js` builds the Build Replay rows and the list of remaining gaps from the same events. Rows show the verified outcome of each run, and the list of gaps uses the real app file, so a stored label or an edit made outside SpecLens cannot make the replay disagree with the Proof Map. `src/domain/privacy.js` keeps folders and user names out of recorded error details. `src/services/store.js` persists events as JSON with atomic writes. The service serialises all changes.

### Repair

PRD ref: prd.md > Features and Behavior > Evidence Lab

`src/services/repair.js`. One documented patch, REPAIR-001, defined as an exact find and replace on the working copy. It refuses to apply unless the file digest equals the seeded defect digest.

### Service layer and HTTP API

`src/services/speclens-service.js` is the only place that changes state, and it enforces every rule. `src/http/server.js` maps routes to service calls and serves the static front end.

### Front end views

PRD ref: prd.md > Screens and Layout

`public/` holds one module per view (`views/intent.js`, `lab.js`, `map.js`, `replay.js`), shared helpers (`dom.js`, `views/shared.js`), a hash router in `app.js` and an API client. Views render from the state object and hold no business rules. The Proof Map chains are built in `src/domain/proofmap.js`, sent with the state as `proofMap`, and drawn by `views/map.js`, so tests can check them.

## Data Model

Every event: `{ seq, id, type, at, actor, data }`. `seq` is a gapless counter and defines order. `at` is an ISO timestamp.

Event types: `intent_recorded`, `interpretation_proposed`, `draft_edited`, `revision_created`, `requirement_approved`, `mapping_confirmed`, `test_run_recorded`, `app_repaired`.

Run record (inside `test_run_recorded`):

- `runId` (RUN-0001, sequential), `testId`, `testVersion`
- `requirementId`, `requirementVersion`, `criterionId`, `criterionSignature`
- `buildDigest` (SHA 256 of the application file that was tested)
- `startedAt`, `finishedAt`, `durationMs`
- `outcome` (PASS, FAIL, INCONCLUSIVE), `cause` (for INCONCLUSIVE) and `detail`
- `checks`: list of `{ id, kind, label, status, expected, actual }`, where status is held, violated or not evaluated
- `observations`: what the isolated process saw, which is enough to recompute the outcome

Derived, never stored: criterion status, requirement coverage, run currency (current or historical with reasons), the plain language explanation of each run, replay entries, next step.

## File Structure

```
package.json            scripts: start, reset, test, test:ui
server.js               starts the HTTP server
demo-app/               the application under test (seeded defect)
src/domain/             pure rules: catalog, events, requirements, interpreter, evidence, state, replay, proofmap, privacy
src/runner/             isolated test execution
src/services/           store, repair, service layer
src/http/               API routes and static file server
public/                 front end: index.html, styles.css, modules for each view
tests/                  automated tests (node:test)
scripts/                reset.js and ui-check.mjs (optional browser check)
devpost/                scope.md, prd.md, spec.md, checklist.md
```

## External Services and Dependencies

None at runtime. No network calls, no accounts, no keys. A .env.example documents PORT, HOST and SPECLENS_DATA_DIR only.

## Important Failure Modes

- **The test process crashes or exits with an error** → INCONCLUSIVE with cause "runner crash". Never FAIL, never PASS.
- **The test process runs past the timeout** → the process is stopped and the run is INCONCLUSIVE with cause "timeout".
- **The application file is missing, has a syntax error or throws while the scenario is set up** → INCONCLUSIVE with cause "setup error" or "application exception", with the message shown.
- **The runner output is incomplete or any assertion lacks expected or observed values** → INCONCLUSIVE with cause "missing evidence".
- **The scenario precondition does not hold (the attempted expense is not larger than the remaining budget)** → INCONCLUSIVE, because the test did not establish what it claims to test.
- **The user edits a criterion's wording after approval** → the test cannot run against the new version until the user confirms the link again.
- **The working file no longer matches the seeded defect when the repair is requested** → the repair is refused with a clear message and nothing is changed.
- **The state file is damaged, or is well formed but makes no sense as a record** → the server refuses to start and says to run `npm run reset`.
- **The app file changes while a test is running** → INCONCLUSIVE with cause "build changed during run".
- **A stored run does not match its own observations** (for example a hand edited PASS) → it is shown as INCONCLUSIVE and listed as an integrity issue.
- **The test process prints far more than a report needs** → the process is stopped and the run is INCONCLUSIVE with cause "invalid output".
- **Two requests arrive at once** → mutations run one at a time.

## What Was Simplified and Why

- **One test and one scenario** instead of a test suite per requirement: a complete, honest story is worth more than breadth in a first version.
- **A rule based interpreter** instead of an AI model: the core workflow must be deterministic and run offline.
- **A JSON event file** instead of a database: one process, one user, and reset must be trivial.
- **A fixed, documented repair** instead of automatic repair: SpecLens verifies; it does not fix arbitrary code.
- **Plain JavaScript modules for the front end** instead of a framework: no build step and nothing to install.

## Decisions and Open Issues

- The license is MIT.
- AC-002 (exact budget is allowed) is covered by the repository's developer unit tests but has no SpecLens evidence run, so the interface shows it as UNTESTED. This is intentional and explained in the interface and README.
- Fonts are not bundled. The first version uses system fonts. A later step may add OFL licensed font files.
- The test process is separate and time limited, but it is not a security sandbox. The app under test is the demo's own file and is trusted. Running unknown code would need real sandboxing.
- The app under test runs inside the test process, because it has to be loaded to be observed. The process receives a one time token that the app never sees, and only a report carrying that token is accepted, so an app that merely prints a report cannot forge one. An app written to tamper with the test process itself could still fake what is observed. The mechanism guards against careless or accidental forgery, not against a hostile app.
- This document was approved before the build and revised afterwards to match what was built. The differences are the file name `tracker.mjs`, `catalog.js` replacing `test-registry.js`, `testVersion` replacing a test digest, and the damaged state handling above.
- The demo video and the Devpost description are written and recorded by the team, as the official workflow requires.
