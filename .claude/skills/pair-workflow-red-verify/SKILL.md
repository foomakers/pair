---
name: pair-workflow-red-verify
description: "Phase D2 of the delivery workflow: independently reproduces a RED contract before it is sealed — re-runs every RED command and oracle against unfixed source, re-derives the owner domain, checks fixture consumption and fixScope — and returns verified or concrete findings. Read-only; a separate role from the author. Dispatched by the batch engine (pair-implement-batch); invoke directly to audit failing tests someone else wrote."
version: 0.1.0
author: Foomakers
---

# /pair-workflow-red-verify — Prove the Contract Before It Freezes

A RED contract is evidence only once someone who did not write it reproduces it. You are that someone. You never repair the contract: you name what is missing and stop.

## Arguments

| Argument    | Required | Description                                                                                  |
| ----------- | -------- | -------------------------------------------------------------------------------------------- |
| `$run`      | Yes      | Run id.                                                                                      |
| `$story`    | Yes      | Story id.                                                                                    |
| `$pr`       | Yes      | PR number.                                                                                   |
| `$phase`    | Yes      | Attempt id, `r<n>-g<k>`.                                                                     |
| `$base`     | Yes      | 40-hex head the attempt starts from; `HEAD` must be exactly this.                            |
| `$worktree` | Yes      | Story worktree.                                                                              |
| `$branch`   | Yes      | Story branch.                                                                                |
| `$contract` | Yes      | Path of the RED contract JSON written by `/pair-workflow-red-spec`.                                        |
| `$findings` | Yes      | JSON array: the group's findings the contract must cover.                                    |

## Algorithm

### Step 1: Read the contract, verify the tree

1. Parse `$contract`. `HEAD == $base`; the uncommitted diff contains **only** the listed artifacts.
2. Every artifact path is repository-relative; `sha256sum` of each equals its stated digest.
3. Anything else ⇒ finding, `verified: false`.

### Step 2: Reproduce

1. Run every `redTests[].command` yourself while production is unfixed: each must fail as `observed` says.
2. Run every `matrix[].oracle`; the result must equal `expected`.
3. Trace each `kind: "fixture"` artifact to the exact failing assertion its `consumedBy` test makes. A declared fixture column that no expectation reads is not a test.
4. Treat any unsupported claim ("does not compile", a count, a version fact) as a finding unless its stated oracle demonstrates it.

### Step 3: Re-derive the domain

Independently derive the owner/discriminator domain from the grammar or state transition — from the function that mutates the state, never a downstream consumer. Every form the owner recognises, including the ordinary complement and the smallest rule-interaction cross-product, must have a RED assertion or consumed fixture row. A missing row is a finding **even when every supplied row passes**; reject the map itself if it omits a recognised form.

### Step 4: Check scope

`fixScope` has one owner, one mode and only the paths that contract needs. `behavioral` may not add, move or split production modules; `structural` must carry a structural RED assertion.

### Step 5: Persist

Write `.pair/working/runs/$run/$story/$phase-red-verify.json` (`status`, `verified`, `findings`).

## Output Format

Return `{ verified, findings: [{ location, severity, description, recommendation }] }`. `verified: true` only with zero findings and every command reproduced.

## Notes

- Read-only: never edit, format, commit, push, publish, comment, create a card or merge.
- Blind: read nothing under `.pair/working/` except `.pair/working/runs/$run/$story/`.
