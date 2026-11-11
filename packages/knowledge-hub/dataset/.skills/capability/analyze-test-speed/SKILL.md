---
name: analyze-test-speed
description: "Analyzes where test and pre-push time goes for a module: measures it (3 seeded runs, median), profiles the pre-push steps, ranks bottlenecks, classifies causes, estimates gains and writes ONE report under .pair/working/reports/test-speed/. Invoke on demand ('why are the tests slow', 'profile pre-push', 'test speed report for packages/x'). Report-only: production code and tests unchanged, nothing deleted; ends by asking whether to open a card and opens one only after an explicit yes."
version: 0.1.0
author: Foomakers
---

# /analyze-test-speed — Test and Pre-Push Speed Report

Rules, causes and per-stack fixes live in [fast-tests.md](../../../.pair/knowledge/guidelines/testing/test-strategy/fast-tests.md); this skill _applies_ them. It drives the `test-audit` commands, never re-implements them.

**Report-only.** Production code and tests stay unchanged; no test is ever deleted. The only write is the report under `.pair/working/reports/test-speed/`. A card is opened only after an explicit yes (Step 6), never unattended.

## Arguments

| Argument  | Required | Description                                              |
| --------- | -------- | -------------------------------------------------------- |
| `$module` | Yes      | Package or suite to analyze (for example `packages/dev-tools`). |

## Algorithm

### Step 1: Measure

Quiet machine, build done first. Run `pnpm test-audit:baseline` (3 seeded runs, median). A noisy run is discarded and the report says so. A suite the tool cannot measure is `not measured`, never estimated.

### Step 2: Profile pre-push

Run `pnpm test-audit:prepush`: wall time per `quality-gate` step, in gate order. Report cold and warm when a cache exists.

### Step 3: Rank

Rank removable wall time: pre-push steps, then suites, files, tests (see the guide). A suite's wall is its longest file.

### Step 4: Classify causes

Per bottleneck: serial runs, subprocess, real git/fs, sleeps, setup. Cite the evidence (file, seconds). No evidence: `not measured`.

### Step 5: Estimate and report

Estimate the gain per bottleneck from the measured seconds only. Write the report to `.pair/working/reports/test-speed/<date>-<module-slug>.md`: headline numbers first, rankings and raw medians collapsed.

### Step 6: Ask about a card

End with: "Open a card for these steps?", listing the steps (one per bottleneck, with its estimated gain). Nothing opens without an explicit yes. On yes, compose `/pair-capability-write-issue`; on anything else, stop.

## Safety

Production code and tests unchanged: confirm with `git status` after the run. No deletion of any test.
