---
name: pair-workflow-p3-verify
description: "Phase D5 of the delivery workflow: read-only verification of a just-fixed delta — runs the deterministic custody check (red-snapshot.mjs verify: snapshot ancestry, tree, sealed blobs byte-identical, no unlisted test change, fixScope respected), then re-runs the fixer's evidence and inspects the delta and its directly changed boundaries for regressions. A breach or a defect is terminal for the attempt. Dispatched by the batch engine (pair-implement-batch)."
version: 0.1.0
author: Foomakers
---

# /pair-workflow-p3-verify — Did GREEN Stay Inside Its Contract?

Two questions, in order: did the fix respect the sealed contract (a script answers), and is the fix correct (you answer, against evidence you re-run yourself). You never fix, comment or merge.

## Arguments

| Argument    | Required | Description                                                                          |
| ----------- | -------- | ------------------------------------------------------------------------------------ |
| `$run`      | Yes      | Run id.                                                                              |
| `$story`    | Yes      | Story id.                                                                            |
| `$pr`       | Yes      | PR number.                                                                           |
| `$phase`    | Yes      | Attempt id, `r<n>-g<k>`.                                                             |
| `$base`     | Yes      | 40-hex head the snapshot sits on.                                                    |
| `$worktree` | Yes      | A DETACHED read-only worktree pinned to `origin/$branch` (the coordinator names it). |
| `$branch`   | Yes      | Story branch.                                                                        |
| `$findings` | Yes      | JSON array: the findings the attempt claims to resolve.                              |
| `$ledger`   | Yes      | JSON: the fixer's evidence ledger — claims to reproduce, not facts.                  |
| `$floor`    | No       | Severity floor name; findings below it are reported, not blocking.                   |

## Algorithm

### Step 0: Isolation

Never switch the main checkout's branch. Inspect from a DETACHED throwaway worktree pinned to the PR's current pushed head: `git worktree remove --force $worktree 2>/dev/null; git fetch origin -q; git worktree add --detach $worktree origin/$branch; cd $worktree`. The untracked checkpoint and review log are absent there — good, stay blind to them. Remove the worktree when finished.

### Step 1: Custody (deterministic)

```bash
cd $worktree && node .claude/workflows/pair-contracts/red-snapshot.mjs verify --pr $pr --phase $phase --base $base
```

`contractBreach: true` (snapshot missing/ambiguous, parent ≠ base, unlisted file in the snapshot, a sealed blob changed or removed, an unlisted test artifact changed, a production path outside `allowedPaths`, a module added/moved under a `behavioral` scope) ⇒ return `{ verified: false, contractBreach: true, findings: <one per breach>, reviewedHead }` **immediately**. A breach is not repairable inside the attempt.

### Step 2: Evidence

1. Inspect ONLY `git diff $base...origin/$branch --name-status` and the directly changed producer/consumer boundaries.
2. Re-run every `$ledger` row's probe: `observed` must reproduce. A ledger is an input to verify, never proof by assertion.
3. Re-run the manifest's RED commands: all green.
4. Every new fixture field or table column is consumed by an expectation (trace it to the assertion). Comments and test names repeat only measured claims.
5. A newly introduced parser/state/normalizer rule has its paired order and the smallest interaction cross-product where an output can feed another rule. A derived predicate is emitted from the state transition that owns it, or proves the same decision table.

### Step 3: Report

For every defect return a finding with the concrete failure case and a recommendation ending `VERIFY: <input/state -> expected>; ORACLE: <command/fixture>; ASSERT: <observable assertion>`. `verified: true` only when zero findings at or above `$floor` remain. `reviewedHead` = `git rev-parse origin/$branch`, lower-case 40-hex.

### Step 4: Persist

Write `.pair/working/runs/$run/$story/$phase-p3-verify.json` (`status`, `verified`, `contractBreach`, `findings`, `reviewedHead`).

## Output Format

`{ verified, contractBreach, reviewedHead, findings: [{ location, severity, description, recommendation }] }`.

## Notes

- Read-only: never edit, commit, push, publish a review, post a PR comment or merge.
- Blind: do not read checkpoints, the review log or anything under `.pair/working/` outside the run directory.
