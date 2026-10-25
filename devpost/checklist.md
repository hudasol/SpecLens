---
status: build complete, team steps remain
---

# Build Checklist

The build is cut into thin slices. Each slice leaves the project in a working, tested state and ends with its own commit.

## Slices

- [x] 1. Project skeleton, the budget tracker with its seeded defect, the documented repair, and tests for both
- [x] 2. Domain model: events, requirements, catalog, evidence rules, derived state, replay
- [x] 3. Real test execution in an isolated process, with INCONCLUSIVE handling
- [x] 4. Service layer: the only place that changes state, plus atomic storage and reset
- [x] 5. Local HTTP server and JSON API
- [x] 6. Intent Studio and the shared shell
- [x] 7. Evidence Lab
- [x] 8. Proof Map
- [x] 9. Build Replay
- [x] 10. Workflow, integration and HTTP tests; browser check at desktop and mobile widths
- [x] 11. README, demo script, and planning documents brought in line with what was built
- [x] 12. Final audit: secrets, branding, wording, an independent review with its findings fixed, and an honest delivery report

## Rules for every slice

- Run the tests before committing.
- Commit straight to main in small steps, and never rewrite history.
- Record what actually ran. Do not claim a check that was not performed.

## What was verified, and where

- 188 automated tests pass on a fresh clone from the public repository, on Node.js 20 and on Node.js 22, on Linux.
- The browser check passes 32 of 32 at desktop and phone widths, in the build environment where Playwright and Chromium were available.
- The repository was cloned fresh, reset, started and answered on its page.
- An independent review of the repository was carried out. Its confirmed findings were fixed in later commits, each with a test where a test could show the fix.

## Still to do by the team

- Run `npm test` and `npm start` once on the Windows computer that will record the demonstration. Nothing has been run on Windows.
- Run the skill pack installer from the official instructions (`npx skills add challengepost/learn-ai-basics`) and confirm its steps. It could not be run in the build environment.
- Time the demonstration script once, record the video (under three minutes), and upload it publicly to YouTube or Vimeo.
- Write the project description on Devpost.
- Confirm the repository is public with the MIT license detected, add a short repository description if wanted, and submit before the deadline.
