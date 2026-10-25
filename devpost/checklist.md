---
status: in progress
---

# Build Checklist

The build is cut into thin slices. Each slice leaves the project in a working, tested state and ends with its own commit.

## Slices

- [x] 1. Project skeleton, the budget tracker with its seeded defect, the documented repair, and tests for both
- [x] 2. Domain model: events, requirements, catalog, evidence rules, derived state, replay
- [ ] 3. Real test execution in an isolated process, with INCONCLUSIVE handling
- [ ] 4. Service layer: the only place that changes state, plus atomic storage and reset
- [ ] 5. Local HTTP server and JSON API
- [ ] 6. Intent Studio and the shared shell
- [ ] 7. Evidence Lab
- [ ] 8. Proof Map
- [ ] 9. Build Replay
- [ ] 10. Workflow, integration and HTTP tests; browser check at desktop and mobile widths
- [ ] 11. README, demo script, and planning documents brought in line with what was built
- [ ] 12. Final audit: secrets, branding, wording, and an honest delivery report

## Rules for every slice

- Run the tests before committing.
- Commit straight to main in small steps, and never rewrite history.
- Record what actually ran. Do not claim a check that was not performed.
