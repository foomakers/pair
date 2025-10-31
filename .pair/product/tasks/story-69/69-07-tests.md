# Task: 69-07 — Tests: Unit, Integration and E2E

Parent Story: #69 — CLI Link Update & Validation Command

What
- Add unit tests for parser, path resolution, file updates, and reporting
- Add integration tests that run `pair update-link --dry-run` on sample KB projects
- Add E2E tests for scenarios: moved project, broken links, conversion modes

Where
- `packages/content-ops/test/*`, `apps/pair-cli/test/*`

How
- Use Vitest for fast unit tests and cross-platform test suites
- Provide test fixtures (sample KB repositories) under `packages/knowledge-hub/test-fixtures/`

Definition of Done
- Unit coverage >= 85% for new modules
- Integration/E2E tests validate acceptance criteria

Estimate: 2 days
Dependencies: 69-02, 69-03, 69-04, 69-06

---
