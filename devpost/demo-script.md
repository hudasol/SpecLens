# SpecLens 2.0: Two Minute Demonstration Script

This script follows the story in `scope.md`. Everything on screen comes from a real run, so nothing needs to be faked or edited. Timings are a guide. The whole story fits in two minutes when each step is rehearsed once.

## Before recording

1. Run `npm run reset`, then `npm start`.
2. Open http://127.0.0.1:4173 in a browser at a comfortable zoom level.
3. Check that the next step bar says to write the request. If it does not, press **Reset demo** and confirm.
4. Close other tabs and notifications. The recording must stay under three minutes and be public on YouTube or Vimeo.

## Script

### 0:00 to 0:20. The ambiguity

Open Intent Studio. Press **Use the example request**.

Say: "I asked an AI assistant: Don't let students overspend. That is an intention. It is not yet something anyone can test. What counts as overspending? Against what limit? What should happen to the expense?"

Press **Propose a requirement** and point at the list of what is unclear and the label "not yet agreed".

### 0:20 to 0:40. The agreement

Scroll to the proposed requirement and its two acceptance criteria. Read AC-001 aloud.

Say: "I read the requirement, and I agree to it myself. SpecLens does not treat it as agreed until I say so."

Press **Approve version 1**. Point at the approved version and at the link between AC-001 and TEST-001. Point out that AC-002 has no test.

### 0:40 to 1:10. The failure

Open Evidence Lab. Point at the scenario: budget $100.00, spent $80.00, remaining $20.00, attempted expense $25.00.

Press **Run TEST-001**.

Say: "This is a real test running in a separate process against the real tracker code. It fails. The expense was accepted, the balance is now minus $5.00 and the history gained an entry."

Point at the three violated checks, each with an expected and an observed value.

### 1:10 to 1:30. The correction

Press **Apply REPAIR-001** and point at the one line added. Point at the earlier FAIL, now labelled historical because the build changed.

Press **Run TEST-001** again.

Say: "The same test, the same scenario. Now the expense is rejected, the balance is still $20.00 and the history is unchanged."

Point at the PASS, and at RUN-0001 still listed as a FAIL on record.

### 1:30 to 1:50. The proof

Open Proof Map. Point along the chain for AC-001: request, requirement, criterion, test, run, explanation. Select the last box.

Say: "A pass means this one scenario behaved correctly on this build. It does not mean the whole tracker is correct."

Point at the lines that say what the run does not show.

### 1:50 to 2:00. The uncertainty

Point at the AC-002 chain, marked UNTESTED.

Say: "SpecLens does not claim the whole product is correct. It shows which agreed requirements have evidence, and where uncertainty remains."

## If something goes wrong

- If a run is not what you expected, do not retake silently. Press **Reset demo** and start again. A fresh reset always reproduces the same story.
- If the port is busy, set `PORT` to another number before `npm start` and use that address.
- Build Replay is not in the two minute story. Open it afterwards if there is time, to show that the timeline lists only recorded events.
