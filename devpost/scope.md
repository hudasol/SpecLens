---
doc: scope
status: approved
---

# SpecLens 2.0

Tagline: Prove What Your AI Actually Built.
Team: Team Kanban (Huda Mueen Qureshi, Awaiz Ahmed).

## The Unique Kernel

The Evidence Contract. Every result SpecLens shows is bound to one chain of records:

original intent, approved requirement, acceptance criterion, executable test, recorded run, and a plain explanation of what that run does and does not prove.

Most tools show a green badge and stop. SpecLens shows the chain behind the badge. It also refuses to present a result as current proof when the requirement, the wording of the acceptance criterion, or the application code has changed since the run.

## Who It's For

Beginners who build software by asking an AI coding assistant, and who cannot yet tell apart four things: "the AI said it works", "I asked for this", "this was tested", and "this is proven". A software engineer should be able to open the same screens and inspect the raw evidence behind every claim.

## The Core Loop

1. Start from a vague request: "Don't let students overspend."
2. Turn it into a requirement and acceptance criteria. The user edits them and approves them with an explicit action.
3. Run a real test against a small student budget tracker that contains a seeded defect. The test fails and the evidence shows why.
4. Apply the documented repair for that one seeded defect and rerun the same test. It passes. The earlier failing run stays on record.
5. Open the Proof Map to see what is evidenced and what is not. One agreed behavior stays UNTESTED on purpose.

## Inspiration & Identity

The name describes a lens on the gap between what was specified and what was shown. The look is evidence first: cream paper, ink text, hard borders, monospaced identifiers, and every status written in words and shape, never colour alone. It should feel like a focused verification workspace and not like an admin dashboard.

## Why This Matters to the Learner

Team Kanban builds with AI coding assistants. The habit of asking "what did we agree, and what proves it?" is the habit that keeps AI built software honest. SpecLens makes that habit visible and teachable, and it holds itself to the same rule: it never shows proof it does not have.

## What "Working" Looks Like

A recording of about two minutes that follows one reproducible story:

- 0:00 to 0:20. The request "Don't let students overspend." is shown and explained as an intention that cannot yet be tested.
- 0:20 to 0:40. The request is refined into a requirement and acceptance criteria, then approved. The link to an executable test is visible.
- 0:40 to 1:10. With $100 budget, $80 spent and $20 left, a $25 expense is attempted. The test runs against the seeded defect and fails, with expected and observed behavior on screen.
- 1:10 to 1:30. The documented repair is applied and the same test is rerun. It passes. The earlier failing run is still listed.
- 1:30 to 1:50. The Proof Map shows requirement, criterion, test and run, with plain language on what the pass establishes and what it does not.
- 1:50 to 2:00. At least one agreed behavior is shown as UNTESTED. SpecLens does not claim the whole product is correct. It shows where evidence exists and where uncertainty remains.

## The POC Boundary

In the proof of concept:

- Four connected views over one shared record: Intent Studio, Evidence Lab, Proof Map, Build Replay.
- One scenario: a student budget tracker with one seeded overspending defect.
- A rule based, offline interpreter for the demo request. No external model is needed.
- A real test executed in a separate process against the real tracker code, with results recorded as structured evidence.
- A documented repair for the one seeded defect, applied to the real code.
- Stale evidence detection when the requirement, the criterion wording or the application code changes.
- A reset that returns the demo to a known starting state.

## Later

- More scenarios and more tests per requirement.
- Importing a different small project to verify.
- Exporting the Evidence Contract as a shareable report.
- A guided lesson mode for classrooms.

## Explicitly Cut

- A general purpose coding agent or autonomous repair of arbitrary defects.
- Analysis of arbitrary repositories.
- Multi agent orchestration.
- Accounts, permissions, collaboration and any hosted infrastructure.
- Calling an external AI model in the core workflow.
- Fake integrations with code hosts or build services.
