---
'@pair/knowledge-hub': patch
---

Delivery cycle fixes:

- Every remediation group now receives its own findings, including groups after the first.
- red-spec refuses to publish a contract whose test artifacts fail the project's format check.
- red-verify lists every gap in a single rejection.
- implement-phase moves the card to `In Progress` and lists acceptance criteria that need live external checks as `external — pending live verification`.
- A review that is blocked only by external findings can always be answered with `decide`.
- Running a bare `eslint` inside a package now finds the shared config.
