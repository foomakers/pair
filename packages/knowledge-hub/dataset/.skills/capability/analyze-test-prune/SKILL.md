---
name: analyze-test-prune
description: "Analyzes which tests of a module are prune candidates, following the #613 path: baseline, mutation, U1-U8 classes, protections, candidates per module and file, removal waves; writes ONE report under .pair/working/reports/test-prune/. Invoke on demand ('which tests can we remove', 'prune report for packages/x', 'redundant tests'). Report-only: production code and tests unchanged, candidates never deleted, mutation only in a clean disposable worktree; ends by asking whether to open a card and opens one only after an explicit yes."
version: 0.1.0
author: Foomakers
---

# /analyze-test-prune — Test Prune Candidates Report

Classes (U1–U8), protections and cleanup order live in [behavior-first-tests.md](../../../.pair/knowledge/guidelines/testing/test-strategy/behavior-first-tests.md); this skill _applies_ them. It drives the `test-audit` commands, never re-implements them.

**Report-only.** Production code and tests stay unchanged; candidates are never deleted. The only write is the report under `.pair/working/reports/test-prune/`. A card is opened only after an explicit yes (Step 7), never unattended.

## Arguments

| Argument  | Required | Description                                           |
| --------- | -------- | ----------------------------------------------------- |
| `$module` | Yes      | Module to analyze (for example `packages/content-ops`). |

## Algorithm

### Step 1: Baseline

Run `pnpm test-audit:baseline`: counts, median duration per module. It rewrites the tracked `test-audit/baseline.json`: read the numbers, then restore it with `git checkout -- test-audit/baseline.json`. Noisy run: discard and say so.

### Step 2: Worktree for mutation

Mutation mutates in place and restores with `git checkout` and `git clean`. Run it ONLY in a clean, disposable worktree (`git worktree add`), never in the working checkout. After the run assert `git status` is clean there (and in the working checkout, with `test-audit/baseline.json` restored, Step 1); the worktree is then discarded.

### Step 3: Mutation

In that worktree run `pnpm test-audit:redundancy --modules <module>`. A long run is sliced (`--mutate`, `--incremental`) and the maintainer runs it by hand; the report then lists what is `not measured`.

### Step 4: Classify

Per test apply U1–U8. A class without a computed signal is `not measured` and never justifies removal. Similarity, or a missing unique kill alone, never makes a candidate.

### Step 5: Protections

Mark protected tests: regression (issue reference), contract, security, accessibility. They are reported, never candidates.

### Step 6: Candidates and waves

List candidates per module and file with class and signal, grouped into waves in class order (U2, U3, U8, U5, U1, U4, U7; U6 is quarantined). Write `.pair/working/reports/test-prune/<date>-<module-slug>.md`: counts first, rows collapsed.

### Step 7: Ask about a card

End with: "Open a card for these steps?", listing the waves. Nothing opens without an explicit yes. On yes, compose `/pair-capability-write-issue`; on anything else, stop.

## Safety

Production code and tests unchanged; candidates never deleted; mutation only in the disposable worktree with a clean diff after.
