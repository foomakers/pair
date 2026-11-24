# Decision: Temporary CLI Integration Test Exception

## Date

2026-11-24

## Status

Active

## Category

Process Decision

## Context

PR #736 finding INC-12 identifies CLI integration tests excluded from normal CLI test runs and CI, leaving recovery, subprocess, and Git behavior without that coverage.

## Decision

The maintainer expressly accepts temporarily excluding the tests listed in `apps/pair-cli/temporarily-excluded-integration-tests.json` from all CLI test runs and CI until P0 #742 restores the retained coverage. INC-12 is accepted under this exception.

## Alternatives Considered

- Run retained integration tests in a separate CI gate now: deferred to #742 by the maintainer.
- Restore the tests immediately: deferred to #742 by the maintainer.

## Consequences

CLI test runs and CI do not exercise the excluded tests until #742. Regressions in their covered behavior may escape those gates. #742 must restore retained coverage and remove this temporary exception.

## Adoption Impact

`.pair/adoption/tech/way-of-working.md` records the current exception and its restoration trigger.
