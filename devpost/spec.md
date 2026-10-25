---
doc: spec
status: approved
---

# SpecLens 2.0: Technical Spec

## How This Works, In Plain Language

SpecLens is a small local web app. A Node.js server keeps one append only list of events: the original request was recorded, an interpretation was proposed, a requirement was approved, a test was run, a repair was applied. Nothing else is stored.

Every screen is computed from that list, so the four views cannot disagree with each other. When the user presses "Run test", the server starts a separate Node process that loads the real student budget tracker file, plays the scenario against it, and prints what it saw. The server decides PASS, FAIL or INCONCLUSIVE from those observations, appends a run record to the list, and the screens update.

The student budget tracker is a real file on disk. It starts with one seeded defect. The documented repair edits that file with an exact, checked patch, so the rerun exercises changed code.

## The Core Journey Through the System

PRD ref: prd.md > The Core Journey

1. Browser loads the page and calls GET /api/state. The server folds the event log into a state object and returns it, together with the current build fingerprint and the next step.
2. "Propose an interpretation" calls POST /api/interpretation/propose. The interpreter returns a deterministic proposal and the service appends `interpretation_proposed`.
3. Edits call POST /api/requirement/edit. If the latest version is a draft it is updated. If it is approved, a new draft version is created. Both append events.
4. "Approve" calls POST /api/requirement/approve. The service validates the draft and appends `requirement_approved`.
5. "Run test" calls POST /api/tests/TEST-001/run. The service checks that an approved version exists and that the test still maps to the criterion wording. The runner starts a child process, collects observations, and the evidence engine classifies them. The service appends `test_run_recorded`.
6. "Apply repair" calls POST /api/repair/apply. The service checks that the working file is byte identical to the seeded defect, applies the patch, and appends `app_repaired`.
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

Locally. `npm start` serves http://localhost:4173. The port can be changed with the PORT environment variable and the data folder with SPECLENS_DATA_DIR. The data folder is `.speclens/` and is ignored by git. A demo video is recorded from the running app.

## Look and Feel

PRD ref: prd.md > Look and Feel

CSS custom properties define the palette (cream paper, ink, accent colours for statuses), spacing and type scale. Headings use Space Grotesk and body text uses IBM Plex Sans when the fonts are available locally, with system fonts as the fallback. Identifiers use a monospaced stack. Status badges always combine a word and a shape.

## Components

### Requirement register

PRD ref: prd.md > Features and Behavior > Intent Studio

`src/domain/requirements.js`. Pure functions that validate and apply requirement operations: propose, edit draft, create revision, approve. Approved versions are immutable. Statement and criteria digests are SHA 256 of normalised text.

### Interpreter

PRD ref: prd.md > Features and Behavior > Intent Studio

`src/domain/interpreter.js`. A rule based function that recognises the demo request and returns a fixed proposal with clarifying questions, one requirement statement, and two acceptance criteria. For unrecognised input it returns a message and no proposal.

### Student budget tracker (application under test)

PRD ref: prd.md > Features and Behavior > Evidence Lab

`demo-app/tracker.defective.js` is the pristine seeded defect. At reset it is copied to `.speclens/app/tracker.js`, which is the working copy that tests run against. Amounts are whole cents. `addExpense` rejects invalid amounts in all builds. The seeded defect is a missing comparison with the remaining budget.

### Test registry and runner

PRD ref: prd.md > Features and Behavior > Evidence Lab

`src/domain/test-registry.js` defines TEST-001 (overspend attempt is rejected with no side effects), the criterion it is written for, the signature of that criterion wording, and its four assertions. `src/runner/child.mjs` is the isolated process that plays the scenario against the working copy. `src/runner/execute.js` starts it, enforces a timeout, and captures output.

### Evidence engine

PRD ref: prd.md > Features and Behavior > Evidence Contract and statuses

`src/domain/evidence.js`. Three pure functions: `classifyRun` turns raw runner output into PASS, FAIL or INCONCLUSIVE and never trusts the runner's own verdict; `assessRun` says whether a run is current proof or historical and why; `deriveCriterionStatus` gives a criterion's status from its current evidence, or UNTESTED.

### Event log and state fold

PRD ref: prd.md > Features and Behavior > Build Replay

`src/domain/state.js` folds events into requirements, versions, runs and repairs, and builds the Proof Map and Build Replay structures and the next step. `src/services/store.js` persists events as JSON with atomic writes and serialises all mutations.

### Repair

PRD ref: prd.md > Features and Behavior > Evidence Lab

`src/services/repair.js`. One documented patch, REPAIR-001, defined as an exact find and replace on the working copy. It refuses to apply unless the file digest equals the seeded defect digest.

### Service layer and HTTP API

`src/services/speclens-service.js` is the only place that changes state, and it enforces every rule. `src/http/server.js` maps routes to service calls and serves the static front end.

### Front end views

PRD ref: prd.md > Screens and Layout

`public/` holds one module per view (intent, lab, map, replay), shared components (status badge, record links), a hash router and an API client. Views render from the state object and hold no business rules.

## Data Model

Every event: `{ seq, id, type, at, actor, data }`. `seq` is a gapless counter and defines order. `at` is an ISO timestamp.

Event types: `intent_recorded`, `interpretation_proposed`, `draft_edited`, `revision_created`, `requirement_approved`, `mapping_confirmed`, `test_run_recorded`, `app_repaired`.

Run record (inside `test_run_recorded`):

- `runId` (RUN-0001, sequential), `testId`, `testDigest` (SHA 256 of the test definition and runner source)
- `requirementId`, `requirementVersion`, `criterionId`, `criterionSignature`
- `build` (digest of the application file and a label: seeded defect, repaired, or modified)
- `startedAt`, `finishedAt`, `durationMs`
- `outcome` (PASS, FAIL, INCONCLUSIVE) and, for INCONCLUSIVE, `cause`
- `assertions`: list of `{ id, kind, description, expected, observed, evaluated, passed }`
- `expectedBehavior`, `observedBehavior`, `establishes`, `limitations`
- `raw`: exit code, signal, truncated output, for inspection only

Derived, never stored: criterion status, requirement coverage, run currency (current or historical with reasons), replay entries, next step.

## File Structure

```
package.json            scripts: start, reset, test
server.js               starts the HTTP server
demo-app/               the application under test (seeded defect)
src/domain/             pure rules: requirements, interpreter, test registry, evidence, state
src/runner/             isolated test execution
src/services/           store, repair, service layer
src/http/               API routes and static file server
public/                 front end: index.html, styles.css, modules for each view
tests/                  automated tests (node:test) and an optional browser check
devpost/                scope.md, prd.md, spec.md, checklist.md
```

## External Services and Dependencies

None at runtime. No network calls, no accounts, no keys. A .env.example documents PORT and SPECLENS_DATA_DIR only.

## Important Failure Modes

- **The test process crashes or exits with an error** → INCONCLUSIVE with cause "runner crash". Never FAIL, never PASS.
- **The test process runs past the timeout** → the process is stopped and the run is INCONCLUSIVE with cause "timeout".
- **The application file is missing, has a syntax error or throws while the scenario is set up** → INCONCLUSIVE with cause "setup error" or "application exception", with the message shown.
- **The runner output is incomplete or any assertion lacks expected or observed values** → INCONCLUSIVE with cause "missing evidence".
- **The scenario precondition does not hold (the attempted expense is not larger than the remaining budget)** → INCONCLUSIVE, because the test did not establish what it claims to test.
- **The user edits a criterion's wording after approval** → the test cannot run against the new version until the user confirms the link again.
- **The working file no longer matches the seeded defect when the repair is requested** → the repair is refused with a clear message and nothing is changed.
- **The state file is damaged** → the API returns a clear error and the page shows it with a Reset button.
- **Two requests arrive at once** → mutations run one at a time.

## What Was Simplified and Why

- **One test and one scenario** instead of a test suite per requirement — a complete, honest story is worth more than breadth in a first version.
- **A rule based interpreter** instead of an AI model — the core workflow must be deterministic and run offline.
- **A JSON event file** instead of a database — one process, one user, and reset must be trivial.
- **A fixed, documented repair** instead of automatic repair — SpecLens verifies; it does not fix arbitrary code.
- **Plain JavaScript modules for the front end** instead of a framework — no build step and nothing to install.

## Decisions and Open Issues

- Commits use the repository local identity Huda Mueen with the address chosen by the team. The license is MIT.
- AC-002 (exact budget is allowed) is covered by the repository's developer unit tests but has no SpecLens evidence run, so the interface shows it as UNTESTED. This is intentional and explained in the interface and README.
- Fonts are not bundled in the first version. A later step may add OFL licensed font files.
- The demo video and the Devpost description are written and recorded by the team, as the official workflow requires.
