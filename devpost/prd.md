---
doc: prd
status: approved
---

# SpecLens 2.0: Product Requirements

SpecLens helps beginners who build with AI assistants see what they asked for, what they agreed to, what was tested and what the test result actually proves. Source: scope.md, "The Unique Kernel", "The Core Loop" and "The POC Boundary".

## The Core Journey

1. The user opens SpecLens and writes the original request, or uses the example "Don't let students overspend."
2. The user asks SpecLens to propose a requirement. The request is recorded, SpecLens lists what is unclear in it and why it cannot be tested yet, and a proposal appears, clearly marked as not yet agreed.
3. The user reads and edits the proposed requirement and acceptance criteria, then approves them. The approved version is saved as its own record.
4. The user sees which executable test is linked to which acceptance criterion.
5. In the Evidence Lab the user runs the test against the student budget tracker. The first run fails because the app accepts an expense larger than the remaining budget.
6. The user reads the expected and observed behavior for each assertion and applies the documented repair.
7. The user reruns the same test. It passes, and the earlier failing run is still listed as history.
8. In the Proof Map the user follows the chain from the request to the run, and sees what the pass establishes and what it does not.
9. The user sees at least one agreed behavior that is still UNTESTED.
10. In Build Replay the user reads the recorded sequence of events that led to this state. A reset returns everything to the start.

## Screens and Layout

One page application with a persistent header and four views.

- Header: product name, tagline, the four view tabs, a compact status strip (current build of the app under test, requirement version, status of each acceptance criterion) and a Reset demo button.
- Next step bar under the header: one sentence that says what to do next and a button that goes there.
- Intent Studio: original request, proposal, editable draft, approval, version history, linked tests.
- Evidence Lab: app under test and scenario, run and repair actions, latest run with its assertions, run history, and a hands on attempt panel for the budget tracker.
- Proof Map: one chain per acceptance criterion from request to requirement to criterion to test to run to explanation. The coverage line is in the header strip, and the last box of each chain says what the evidence does and does not prove.
- Build Replay: a vertical timeline of recorded events with links to the records they created, and a final list of remaining verification gaps.

On narrow screens the traces and timelines stack vertically and nothing scrolls sideways.

## Look and Feel

Evidence first and calm. Cream paper background, ink coloured text, hard two pixel borders, small offset shadows on primary actions, monospaced identifiers (REQ, AC, TEST, RUN), and a clear type hierarchy. Plain language comes first, with technical detail one click away in expandable sections.

Statuses are shown as a word plus a distinct shape, never colour alone: PASS with a check, FAIL with a cross, UNTESTED with a dashed circle, INCONCLUSIVE with a question mark in a diamond. PASS is not green, so the interface never reads as "all good".

## Features and Behavior

### Intent Studio

The original request is recorded and cannot be edited. A deterministic, offline interpreter proposes a requirement and two acceptance criteria. The user edits and approves.

As a beginner, I want to turn a vague request into a specific requirement that I approve myself, so that I know exactly what was agreed.

- [x] The original request is shown unchanged, with a note on what is unclear in it.
- [x] The proposal is shown separately from the original wording and is labelled "not yet agreed" until the user approves it.
- [x] Editing a draft changes the draft only.
- [x] Approval is an explicit button press and creates a distinct approved record (version 1).
- [x] The approved version cannot be changed. Editing it creates version 2 as a new draft.
- [x] After an edit, the interface says that the approved version and its evidence are no longer current for the new version, and what to do about it.
- [x] If the wording of an acceptance criterion changes, the link to its test must be confirmed again by the user before the test can run against that version.
- [x] A request the interpreter does not recognise gets a clear message and no invented proposal.

### Evidence Lab

A small student budget tracker with a seeded defect, and a real test for the first acceptance criterion.

As a beginner, I want to run a real test and read exactly what was expected and what happened, so that I do not have to trust a green badge.

- [x] The scenario is shown before any run: budget $100.00, already spent $80.00, remaining $20.00, attempted expense $25.00.
- [x] Running the test executes the real tracker code in a separate process and records a run.
- [x] On a fresh reset the first run is FAIL, because the app saves the $25.00 expense.
- [x] Every run lists each assertion with expected value, observed value and a result.
- [x] A failed assertion is shown differently from a runner crash, a setup error, a timeout or missing evidence. The latter are INCONCLUSIVE and never PASS.
- [x] The documented repair changes the real application file. It is offered only while the app is in the seeded defect state.
- [x] Rerunning uses the same test identifier and version, and creates a new run. The earlier run is kept.
- [x] After the repair the same test passes: the expense is rejected, the remaining balance is still $20.00 and the expense history is unchanged.
- [x] A hands on panel lets the user try an expense against the live app. It is labelled as exploration and never creates evidence.

### Evidence Contract and statuses

One shared record drives all four views.

- [x] PASS: the test ran to completion, every assertion was evaluated and all held, for the tested requirement version and the current build.
- [x] FAIL: the test ran far enough to evaluate its assertions and at least one did not hold.
- [x] UNTESTED: there is no valid, applicable evidence for this requirement version and build.
- [x] INCONCLUSIVE: the test could not establish a result.
- [x] Evidence is labelled historical, with a reason, when the requirement version, the criterion wording or the application build has changed since the run.
- [x] A requirement is never labelled "verified". The interface shows how many of its acceptance criteria have current evidence and how many do not.

### Proof Map

- [x] Each acceptance criterion shows its full trace from original request to runs.
- [x] Criteria with no test or no current evidence are visible and marked UNTESTED.
- [x] Failed and inconclusive evidence is shown, not hidden.
- [x] Every node links to the same record in the other views.
- [x] The last box of each chain, and its detail panel, state in plain language what the latest result establishes and what it does not establish.

### Build Replay

- [x] Every entry is generated from a recorded event, in recorded order.
- [x] The timeline covers: request recorded, interpretation proposed, requirement approved, test run, defect demonstrated, repair applied, test rerun, result updated, and remaining gaps.
- [x] Each entry can be expanded to show the underlying record.

### Reset

- [x] Reset asks for confirmation, then restores the seeded defect build and an empty event log. The request is recorded again when the user submits it.
- [x] A fresh reset always reproduces the same story.

## States and Boundaries

- **Fresh start**: The request box is empty, with a button to use the example, and the next step bar says to write the request. No requirement or runs exist.
- **Proposal, not approved**: The draft is editable and marked not yet agreed. The Evidence Lab explains that tests only run against an approved requirement.
- **Approved, no runs**: The link between each criterion and its test, or the lack of one, is shown. AC-001 is UNTESTED until it is run.
- **Running**: The run button is disabled and shows progress. The service handles one change at a time, so a second run cannot overlap the first.
- **FAIL**: Expected and observed values are shown beside each assertion. The next step bar offers the repair.
- **Repaired, not rerun**: The earlier FAIL is labelled historical because the build changed. AC-001 is UNTESTED until the rerun.
- **PASS**: The pass is labelled with its limits. AC-002 remains UNTESTED.
- **INCONCLUSIVE**: The cause is named: setup error, runner crash, timeout, application exception, invalid output or missing evidence.
- **Requirement edited after approval**: Version 2 is a draft. Version 1 evidence is labelled as belonging to version 1 only.
- **Reset confirm**: A dialog explains what will be erased.
- **State file damaged or server error**: If the saved file is damaged the server refuses to start and says to run `npm run reset`. If the server cannot be reached the page says so and offers Try again. Nothing is silently ignored.

## Product Decisions

- Rule based interpreter instead of an AI model: the core workflow must be deterministic, offline and reproducible.
- Execute the test in a separate process: a crash or timeout must be distinguishable from an assertion failure.
- One event log as the only source of truth: every view and the replay are derived from it, so they cannot disagree.
- Exactly equal to the remaining budget is allowed: spending the last dollar is not overspending. This is written into AC-002.
- Money is stored as whole cents: it avoids rounding errors in a budget tool.
- PASS is not green: the interface must not read as proof of correctness.

## What We're Building

The four views, the shared evidence model, the budget tracker with its seeded defect, the isolated test runner, the documented repair, reset, automated tests, and documentation.

## Deferred From the POC

More than one test per requirement, more than one scenario, exporting reports, and a classroom mode.

## Possible Later Enhancements

Importing a small project to verify, a shareable report, and a lesson mode for beginners.

## Non-Goals

A coding agent, arbitrary repository analysis, automatic repair of arbitrary defects, multi agent systems, team collaboration, permissions, hosted deployment, and any external AI service in the core workflow.

## Revision Note

This document was approved before the build and was brought in line with what was built afterwards. The differences are: the request is written by the user and recorded on submit (not pre-recorded), the coverage line lives in the header strip, runs record a test version instead of a source digest, and a damaged state file stops the server with a clear message instead of showing a Reset button. Each acceptance box is ticked because an automated test or the browser check exercises it. The team should still confirm them by using the app.

## Open Questions

- None open on identity: commits use the repository local identity Huda Mueen.
- License: MIT, chosen to satisfy the open source requirement.
