---
name: pair-workflow-red-seal
description: "Phase D3 of the delivery workflow: freezes a verified RED contract into ONE local Git snapshot commit by running the deterministic sealer script (red-snapshot.mjs seal) — HEAD at base, artifacts hash-checked, tree dirty only at the contract, manifest written, Pair-RED-Snapshot trailer. No judgement, no prose: the script decides. Dispatched by the batch engine (pair-implement-batch)."
version: 0.1.0
author: Foomakers
---

# /pair-workflow-red-seal — One Command, One Snapshot

Sealing is Git custody, not reasoning. This skill runs the sealer script and returns its answer; it never reimplements a check the script performs.

## Arguments

| Argument    | Required | Description                                                       |
| ----------- | -------- | ----------------------------------------------------------------- |
| `$run`      | Yes      | Run id.                                                           |
| `$story`    | Yes      | Story id.                                                         |
| `$pr`       | Yes      | PR number.                                                        |
| `$phase`    | Yes      | Attempt id, `r<n>-g<k>`.                                          |
| `$base`     | Yes      | 40-hex head the snapshot must sit directly on.                    |
| `$worktree` | Yes      | Story worktree.                                                   |
| `$contract` | Yes      | Path of the verified RED contract JSON.                           |

## Algorithm

### Step 1: Run the sealer

```bash
SKILL_DIR="$(dirname "<absolute path of this SKILL.md>")"   # the directory this skill was loaded from
cd $worktree && node "$SKILL_DIR/scripts/red-snapshot.mjs" seal \
  --pr $pr --phase $phase --base $base --contract $contract
```

The script ships beside this file ([scripts/red-snapshot.mjs](./scripts/red-snapshot.mjs)); resolve it from the skill's own directory, never from a repository path.

The script verifies `HEAD == $base`, every listed artifact's `sha256`, that the working tree is dirty only at those artifacts, writes `.pair/red-snapshots/pr-$pr-$phase.json`, and creates exactly one local `--no-verify` commit whose message carries `Pair-RED-Snapshot: pr=$pr; phase=$phase; base=$base; manifest=<path>`. It is idempotent: re-running after a lost response returns the existing snapshot.

### Step 2: Return the script's JSON verbatim

`{ sealed: true, snapshot }` on exit 0; `{ sealed: false, reason, ... }` otherwise. Do not retry with a different contract, edit any file, amend, rebase, reset, push, post or merge to make it seal.

### Step 3: Persist

Write `.pair/working/runs/$run/$story/$phase-red-seal.json` (`status`, `snapshot`, `manifest`, `reason?`).

## Output Format

`{ sealed, snapshot?, manifest?, reason? }` — the script's object, unchanged.

## Notes

- Never read `.pair/working/` outside the run directory.
- A `head-not-base` or `dirty-outside-contract` refusal is information for the coordinator, not a problem to solve here.
