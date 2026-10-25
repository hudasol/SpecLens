# SpecLens 2.0

**Prove What Your AI Actually Built.**

SpecLens is a small verification workspace for people who build software by asking an AI coding assistant. It keeps four things apart that are easy to blur together: what you asked for, what you agreed should be built, what was actually tested, and what the recorded test result does and does not prove.

Built by Team Kanban: Huda Mueen Qureshi and Awaiz Ahmed. Created for the Build With AI: Basics hackathon.

## What SpecLens is

SpecLens has four connected views over one shared record:

| View | What it does |
| --- | --- |
| Intent Studio | Turns a vague request into an editable requirement with acceptance criteria. Nothing counts until you approve it. An approved version is never changed. |
| Evidence Lab | Runs a real test against a small student budget tracker, shows the expected and observed behaviour for every check, and offers one documented repair for the seeded defect. |
| Proof Map | Lets you follow each acceptance criterion from your request to the requirement, the criterion, the test, the recorded run and a plain explanation of what that run shows. |
| Build Replay | A timeline built only from events that were really recorded, ending with what is still not proven. |

There is no database, no account and no outside service. Everything runs on your own computer.

## Who it is for

Beginners who build with AI coding assistants and cannot yet tell the difference between "the assistant said it works", "I asked for this", "this was tested" and "this is proven". An engineer can open the same screens and inspect every record behind them.

## The problem it addresses

A green tick on its own tells you very little. It does not say which requirement was checked, which version of the requirement, which build of the code, or what the check could never have caught. SpecLens shows that chain next to every result, and it refuses to present a result as current proof once the requirement, the wording of a criterion or the code has changed since the test ran.

## How the Evidence Contract works

Every result is bound to one chain of records:

1. **Original intent.** The request as you wrote it, kept exactly as written (INT-001).
2. **Approved requirement.** The wording you explicitly approved, as a numbered version (REQ-001, version 1).
3. **Acceptance criterion.** A specific, checkable statement under the requirement (AC-001, AC-002).
4. **Executable test.** A real test that is paired with a criterion (TEST-001 is written for AC-001).
5. **Recorded outcome.** A run record that names the test, the requirement version, the criterion wording and the build of the code it ran against (RUN-0001 and so on). Runs are only ever added. Reruns create new runs.
6. **Explanation.** A plain statement of what this run shows and what it does not show.

Rules that keep the contract honest:

- A test runs in a separate process. The process only reports what it observed. SpecLens works out the verdict itself, so a test cannot declare its own PASS.
- A run only counts as current proof while the requirement version, the criterion wording and the application build all still match what the run used. Otherwise it is kept on record and labelled historical, with the reason.
- If you reword a criterion, the test is locked until you confirm that it still checks the new wording.
- A stored PASS or FAIL is recomputed from its own observations whenever it is shown. A record that has been edited by hand, or that has no observations, is shown as INCONCLUSIVE and listed as an integrity issue.
- A requirement is never labelled "verified". SpecLens only says how many of its criteria have current evidence.

## Install and run

You need Node.js 20 or later. There is nothing else to install, because SpecLens has no runtime dependencies.

```
git clone https://github.com/hudasol/SpecLens.git
cd SpecLens
npm start
```

Then open http://127.0.0.1:4173 in a browser. The server listens on this computer only. To use another port, set `PORT` before starting. The optional settings are listed in `.env.example`. No secret is ever needed.

The automated checks were run on Node.js 22 on Linux. The declared minimum is Node.js 20. SpecLens has not yet been run on Windows or macOS by its authors, so please report anything that behaves differently there.

## Run the automated tests

```
npm test
```

This runs 171 tests with the built in Node test runner: the budget tracker in both builds, the evidence rules, the interpreter, the isolated runner (including crashes, timeouts and flooding), the service and the whole journey, the HTTP server and its safety checks, and checks on the published files themselves.

There is also a browser check that drives the real interface at desktop and phone widths:

```
npm run test:ui
```

It needs Playwright with a Chromium browser, which are not project dependencies. If they are not installed the script says so and does nothing. In the build environment it ran 32 checks (16 at each width) and all passed.

## Reset the demo

Press **Reset demo** in the page and confirm. It clears the request, every requirement version and every run, and restores the budget tracker with its seeded defect. Or, from a terminal with the server stopped:

```
npm run reset
```

Both give the same starting point every time.

## Reproduce the seeded failure

The example is a student budget tracker. The budget is $100.00, $80.00 is already spent, so $20.00 remains. The test then tries to add a $25.00 expense, which is more than what is left.

1. Start SpecLens and open **Intent Studio**.
2. Press **Use the example request** (or type your own words), then **Propose a requirement**. The request is recorded, SpecLens lists what is unclear in it, and a proposal appears, marked as not yet agreed.
3. Read the requirement and the two acceptance criteria. Edit them if you like, then press **Approve version 1**.
4. Open **Evidence Lab** and press **Run TEST-001**.

The result is a FAIL. The tracker accepted the $25.00 expense, the remaining balance became negative, and the history gained an entry. Each check shows what was expected and what was observed.

In Evidence Lab you can also try an expense by hand against the live app. That is exploration. It is labelled as such and never creates evidence.

## Apply the repair and rerun the same test

1. In **Evidence Lab**, press **Apply REPAIR-001**. It adds one comparison to the working copy of the tracker. The patch is shown as removed and added lines. It is offered only while the app is still in its seeded state.
2. The earlier FAIL is now labelled historical, because the build it ran against has changed. AC-001 goes back to UNTESTED.
3. Press **Run TEST-001** again. It is the same test, the same scenario and the same criterion.

The result is a PASS. The expense is rejected, the balance is still $20.00 and the history is unchanged. The earlier FAIL stays on record.

Open **Proof Map** to follow the chain behind the PASS, and **Build Replay** to see the recorded events in order. AC-002 (an expense exactly equal to the remaining budget is allowed) is deliberately left without a SpecLens test, so it shows UNTESTED.

A step by step script for a two minute recording is in `devpost/demo-script.md`.

## What the statuses mean

| Status | Meaning |
| --- | --- |
| PASS | The test ran to completion, every check was evaluated and every check held, for this requirement version, this criterion wording and this build. |
| FAIL | The test ran far enough to evaluate its checks and at least one check did not hold. |
| UNTESTED | There is no valid, applicable evidence for this criterion as it now stands. Either no test covers it, or the only runs are historical. |
| INCONCLUSIVE | The test could not establish a result. The cause is named: timeout, crash of the test process, unreadable output, setup error, an error in the app, missing evidence, a changed build during the run, or a stored record that does not match its own observations. |

Statuses are always shown as a word with a distinct shape, never colour alone. PASS is deliberately not green.

## What the current prototype proves

- For one scenario ($100.00 budget, $80.00 spent, a $25.00 attempt), TEST-001 establishes four things on the build it ran against: the attempt really was larger than the remaining budget, the app rejected it, the balance did not change, and no history entry was added.
- The evidence records which requirement version, which criterion wording and which build each run belongs to, and the interface says plainly when a run no longer counts.
- A failing run and a passing run of the same test are both kept, so the repair can be seen as a change in evidence and not as a replaced result.
- The same story can be reproduced from a reset state, and the test suite checks that it behaves that way.

## What the prototype does not support

- Only one scenario, one test and one seeded defect. There is no way to add a project, a test or a defect.
- No analysis of other repositories and no automatic repair of other defects.
- The interpreter is a fixed, offline rule based function. It recognises the demo request and close rewordings of it, and says so plainly for anything else. It does not call any AI model.
- No accounts, sharing, export or hosted version.

## Known limitations and the boundaries of the evidence

- A PASS covers one scenario on one build. It does not show that the whole tracker is correct, and the interface says so beside every PASS.
- TEST-001 covers AC-001 only. AC-002 has no SpecLens run and shows UNTESTED. The repository's developer unit tests do exercise that behaviour, but they are not recorded in SpecLens and are not counted as evidence.
- The test runs in a separate, time limited process, but that is not a security sandbox. The app under test is the demonstration's own file and is trusted. Running unknown code would need real sandboxing.
- The saved state is a plain JSON file in `.speclens/`. SpecLens detects an edited run record and refuses to show it as proof, but anyone who can edit the file can still change what the timeline says happened. It is a tool for honest working, not a tamper proof audit log.
- The interface uses system fonts only. Colours and layout were checked with an automated accessibility scan and with screenshots at desktop and phone widths, but not with a screen reader.
- Playwright and the accessibility scanner used during development are not part of the repository.

## Project layout

```
server.js            starts the local server
scripts/             reset.js and ui-check.mjs (browser check)
demo-app/            the budget tracker with the seeded defect (never edited by SpecLens)
src/domain/          pure rules: catalog, events, requirements, interpreter, evidence, state, replay
src/runner/          the isolated test process and the code that starts it
src/services/        storage, the documented repair, and the service that is the only place state changes
src/http/            the local HTTP server and its safety checks
public/              the interface: one module per view
tests/               automated tests
devpost/             scope, requirements, technical spec, checklist, demo script
```

The working copy of the tracker that tests run against, and the event log, live in `.speclens/` and are not committed.

## Hackathon notes

The planning documents `devpost/scope.md`, `devpost/prd.md` and `devpost/spec.md` were written and approved before the build and revised afterwards to match what was built. The skill pack installer from the official instructions could not be run in the build environment, so its steps were followed from the published structure only. The team should run the installer and confirm the steps before submitting. The demonstration video and the project description on Devpost are written and recorded by the team.

## License

MIT. See `LICENSE`. SpecLens has no runtime dependencies, so there are no third party licenses to carry.

## Attribution

SpecLens 2.0 is a project of **Team Kanban**: Huda Mueen Qureshi and Awaiz Ahmed.
