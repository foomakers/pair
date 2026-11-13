# Decision: an owner-approved correction routes a successor; it never waives custody

## Date

2026-11-11

## Status

Active

## Category

Process

## Context

Story #591. A sealed contract can assert a wrong oracle. The 2026-09-18 decision forbids re-sealing to launder a breach.

## Decision

- The adopted maintainer, verified as a `User` through the bound host, may approve a bounded correction (story, PR, predecessor hash, rows, exact delta).
- The approval only routes a successor revision on the existing succession line; independent validation and the sealer's predecessor/changed-row checks stay mandatory.
- Approval never waives custody, never retires predecessor evidence, never merges or widens scope; a committed unauthorized change stays a reported breach.

## Consequences

`approve-correction` records `owner-approvals.json` in the run directory; the 2026-09-18 invariants are unchanged.
