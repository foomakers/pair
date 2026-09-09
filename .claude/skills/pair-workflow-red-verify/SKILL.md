---
name: pair-workflow-red-verify
description: "Stage 2 of the delivery workflow — independent contract validation and deterministic seal in one execution: reproduces every witness and control of a prepared acceptance contract against the unfixed base, re-derives the inventory's classes and interactions from the authoritative producer, checks discriminance (a witness fails for the intended defect, a control may pass, a test-only fix fails on the injected regression), fixture consumption and fixScope, emits ALL concrete gaps it found in one typed rejection with stable row ids — and, when the contract is verified, runs red-snapshot.mjs seal in the same execution and returns the snapshot. Never repairs a contract, never edits production. Dispatched by the batch engine (pair-implement-batch)."
version: 0.2.0
author: Foomakers
---

# /pair-workflow-red-verify — Prove the Contract, Then Freeze It

A contract is evidence only once someone who did not write it reproduces it. You are that someone. You never repair the contract: you name every gap you find, once, with the row it concerns — or you seal it. Sealing is Git custody, not reasoning: the script decides.

## Arguments

| Argument           | Required | Description                                                                                                                              |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `$run`, `$story`, `$branch`, `$worktree`, `$base`, `$stacked`, `$entry`, `$policy`, `$inputs`, `$workflowVersion` | Yes | The cycle arguments, as every stage receives them. Handoffs live under `.pair/working/runs/$run/$story/` in the MAIN checkout. |
| `$phase`           | Yes      | `a0` · `r<n>-g<k>` · `r<n>-g<k>-rev<m>`.                                                                                                 |
| `$head`            | Yes      | 40-hex head the contract was prepared on; `HEAD` of the worktree must be exactly this.                                                    |
| `$contract`        | Yes      | Absolute path of the prepared contract JSON (main checkout's run directory — pass it to the script as-is, never relative to the worktree). |
| `$contractHash`    | Yes      | The hash the preparation stage recorded; `node "$SKILL_DIR/scripts/cycle-state.mjs" hash --file $contract` must reproduce it.             |
| `$pr`              | No       | PR number, when one exists.                                                                                                              |
| `$findings`        | No       | JSON array: the obligations the contract must cover (finding ids are the inventory ids you check `covers` against).                       |
| `$scope`           | No       | JSON `{ groupId, owner, mode, allowedPaths }` of the planned group; the contract's `fixScope` may be narrower, never wider.                |

## Algorithm

### Step 0: Resolve the durable state (mandatory)

Run `cycle-state.mjs resolve` exactly as `/pair-workflow-red-spec` does (`SKILL_DIR`, `MAIN`, `RUN_DIR`; `--entry $entry --policy '$policy' --inputs $inputs --story $story [--pr $pr]`). `other-run` ⇒ return it. `incompatible | invalid` ⇒ redirect to `blocked / failed-resume`. `next.step ≠ validate` or `next.phase ≠ $phase` ⇒ return `{ status: "redirect", next }`. Otherwise `next.attempt` is your attempt.

### Step 1: Read the contract, verify the tree

1. Parse `$contract`; its `contractHash` must equal `$contractHash` and the script's `hash` output — a mismatch is a finding (`location: $contract`), `verified: false`.
2. `cd $worktree`; `HEAD == $head`; the uncommitted diff contains ONLY the listed artifacts. Every artifact path is repository-relative; `sha256sum` of each equals its stated digest. Anything else ⇒ finding, `verified: false`.
3. `fixScope` has one owner, one mode, only the paths the contract needs, and is not wider than `$scope`.

### Step 2: Reproduce (every row, every artifact)

1. Run every `redTests[]` `command` yourself while production is unfixed: a `baseline: red` witness must FAIL as `observed` says; a `baseline: pass` control must PASS. For a `mode: test` contract reproduce the injected regression the author describes: the guard fails there AND passes on the current source; a guard that cannot be made to fail proves nothing.
2. Run every `matrix[]` `oracle`; the result must equal `expected`. A `not-applicable` row's `rationale` is re-derived from the producer — if the class can occur, that is a finding on that row.
3. Trace each `kind: fixture` artifact to the exact failing assertion of its `consumedBy` test. A declared fixture column that no expectation reads is not a test.
4. Treat any unsupported claim ("does not compile", a count, a version fact, a prose-regex standing in for behavior) as a finding unless its stated oracle demonstrates it.

### Step 3: Re-derive the inventory

Independently derive, from the authoritative producer named by each `inventory` item (the function that mutates the state, the grammar, the command — never a downstream consumer), every class the producer recognises including the ordinary complement and the smallest interaction cross-product. Every class must be `covers`-ed by a row that discriminates; a missing class is a finding **even when every supplied row passes**. Equivalence between two classes is accepted only with a shared behavioral/grammar rule stated in `rationale`, never because outputs agree today.

### Step 4: Decide — ALL gaps in one answer

Return `verified: false` with **every** concrete gap found in this pass as findings `{ rowId?, location, severity, description (the failing example / the violated rule), recommendation (the evidence required) }` — stable `rowId`s so the repair can be traced. Never return the first gap and stop; a second pass on the repaired contract may only add gaps that the repair introduced or that need new evidence. `verified: true` only with zero findings and every command reproduced.

### Step 5: Seal (only when verified) — the script decides

```bash
cd $worktree && node "$SKILL_DIR/scripts/red-snapshot.mjs" seal --pr ${pr:-0} --phase $phase --base $head --contract $contract
```

The script (shipped beside this file, [scripts/red-snapshot.mjs](./scripts/red-snapshot.mjs)) verifies `HEAD == $head`, every artifact's `sha256`, that the tree is dirty only at those artifacts (a `pass` control may be unchanged), writes `.pair/red-snapshots/pr-$pr-$phase.json`, and creates exactly one local `--no-verify` commit carrying `Pair-RED-Snapshot: pr=…; phase=…; base=…; manifest=…`. It is idempotent: re-running after a lost response returns the existing snapshot. A revision (`-rev<m>`) seals as a SUCCESSOR snapshot on `$head`; the earlier seal stays history. Do not retry with a different contract, edit any file, amend, rebase, reset, push or post to make it seal: `{ sealed: false, reason }` is the answer, returned as `sealed: false` with `reason`.

### Step 6: Persist and hand off

Publish the handoff (`skill: "red-verify"`, `inputHead: $head`, `inputsDigest`, `attempt`, `verified`, `findings`, `sealed`, `snapshot?`, `manifest?`, `contractHash`, `reproduced: [{ rowId, command, observed }]`, `elapsedMs`) with `cycle-state.mjs publish … --predecessor $phase-red-spec`, run `resolve` again and return its `next`.

## Output Format

`{ status: verified | rejected, verified, findings: [{ rowId?, location, severity, description, recommendation }], sealed, snapshot?, manifest?, contractHash, reason?, next }`.

## Notes

- Read-only on the repository except the seal commit the script makes. Never edit, format, push, publish, comment, create a card or merge; never rehash a changed artifact into approval.
- Blind: read nothing under `.pair/working/` except `$RUN_DIR`.
- A typed rejection is the cycle's answer: the coordinator routes it to ONE repair; a second rejection exhausts the unchanged budget. Never soften a gap to let the contract through.
