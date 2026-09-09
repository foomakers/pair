---
name: pair-workflow-red-spec
description: "Phase D1 of the delivery workflow: authors the RED contract for one remediation group — maps the finite domain of the owner state, writes or changes ONLY tests and consumed fixtures, proves each is RED against unfixed source, and returns the typed contract (fixScope, matrix, hashed artifacts) a separate sealer commits. Never touches production source. Dispatched by the batch engine (pair-implement-batch); invoke directly to write the failing tests for a finding ('write the RED contract for finding 2 of PR #42')."
version: 0.1.0
author: Foomakers
---

# /pair-workflow-red-spec — The Failing Tests Come First, From Someone Else

Author the test-only contract a fix must satisfy, before any agent that can edit source sees the task. The fixer cannot author its own specification; you write it, a verifier reproduces it, a sealer freezes it in Git.

## Arguments

| Argument    | Required | Description                                                                                                                      |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `$run`      | Yes      | Run id. Handoffs go under `.pair/working/runs/$run/$story/` in the MAIN checkout the coordinator was started in (the working directory the coordinator was started in, before any `cd`) — never inside a story or review worktree, which may be pruned. |
| `$story`    | Yes      | Story id.                                                                                                                       |
| `$pr`       | Yes      | PR number.                                                                                                                      |
| `$phase`    | Yes      | Attempt id, `r<n>-g<k>`.                                                                                                        |
| `$base`     | Yes      | 40-hex head the attempt starts from. `HEAD` of the worktree must be exactly this.                                                |
| `$worktree` | Yes      | Story worktree. All file work happens here.                                                                                     |
| `$branch`   | Yes      | Story branch.                                                                                                                   |
| `$findings` | Yes      | JSON array: the group's findings (`location`, `severity`, `description`, `recommendation`, optional P3 evidence fields).         |
| `$scope`    | Yes      | JSON: the plan's group — `{ owner, mode, allowedPaths, oracle }`. You may narrow it, never widen it. `mode: test` = guard-strength repair: production is already correct, `allowedPaths` is `[]`, there will be no GREEN. |
| `$repair`   | No       | JSON array: the verifier's findings on a rejected contract. Present ⇒ this is the ONE bounded repair; uncommitted test edits are untrusted and must be re-proven. |

## Algorithm

### Step 1: Verify the start state

1. **Check**: `git -C $worktree rev-parse HEAD` equals `$base`; `git status --porcelain` is empty (or, with `$repair`, dirty only at test artifacts).
2. **Leftovers of an abandoned attempt**: when HEAD equals `$base` but the tree is dirty ONLY at test artifacts (test source, fixtures — never a production path), no `$repair` was passed, and no commit in `$base..HEAD` carries a `Pair-RED-Snapshot` trailer for this PR, those edits are the unsealed remains of an earlier attempt that never reached the seal (a coordinator-side rejection, a killed agent). They are not evidence and must not leak into this contract: record each path with its working-tree `sha256` under `discarded` in your handoff, then restore the tree (`git checkout -- <path>` for tracked files, `git clean -f -- <path>` for untracked test files) and proceed. Never discard a production change, and never touch a sealed snapshot's blobs.
3. **Act**: a moved head, or a dirty production path, is `status: stale` — return it and stop. Never reset, stash or rebase to make it so.

### Step 2: Map the finite domain

For every behavioral target: identify the **owner** (the function/event that mutates the state — not a nearby eligibility, laziness or convenience predicate), one **discriminator**, and the mutually exclusive rows covering every lexical/state form the owner recognises, **including the ordinary complement**. Where one row's output can be another rule's input, add the smallest interaction cross-product. Each row carries its authoritative oracle and measured expected result. A non-behavioral target still maps its factual alternatives and exact probe. Return this as `domains`.

**Carry-forward evidence**: a finding carrying `observedHead`, `oracle`, `probe`, `observed` is a previously verified P3 result. Re-run its oracle on `$base` first and make it RED even if the current reviewer did not mention it; reviewer omission never resolves a known false green.

### Step 3: Write the contract

1. Declare `fixScope` before editing: one `owner`, exactly one `mode` (`behavioral` | `structural` | `test`), exact `allowedPaths` (`[]` for `test`). A behavior repair and a refactor never share a contract — if the group needs both, return `status: split-required` with a `splitReason`. A refusal is your ANSWER: the coordinator routes it by status and never re-dispatches you with the same prompt, so say precisely what a re-plan must change.
   **`mode: test`** (guard-strength): the RED proof is that the strengthened assertion FAILS against an **injected regression** — restore the defect in a scratch copy (a fixture, a temp file, a `git stash`-free copy) and run the test there; `observed` records that failure — and PASSES against the current source. Never edit production to make a guard red.
2. Modify **only** test source, fixtures and committed oracle rows. Never production source, docs, adoption, configuration, generated assets. Never commit, push, post, label, create a card or merge.
3. Make **every mapped row** a real RED assertion or a fixture row consumed by one. Do not collapse rows because their outputs agree today.
4. Run each changed test while production is unfixed (`behavioral`/`structural`) or against the injected regression (`test`); keep it RED for the reported behavior. Never weaken an existing expectation or replace a behavior assertion with a source-string assertion.
5. A pure documentation/formatting finding may set `testExempt: true` with a concrete `exemptionRationale`; it still needs a matrix.
6. Hash every artifact: `sha256sum <file>` ⇒ `sha256:<digest>`. A `kind: "test"` entry carries its exact failing `command` and `observed` failure; a `kind: "fixture"` entry carries `consumedBy` naming a listed RED test.

### Step 4: Persist

Write the contract verbatim to `.pair/working/runs/$run/$story/$phase-red-contract.json` (in the MAIN checkout) and the handoff to `.pair/working/runs/$run/$story/$phase-red-spec.json`. Return `contractPath` as the **absolute** path of the persisted contract: the sealer and the verifier `cd` into the story worktree, where a repository-relative path would not resolve (`status`, `inputHead`, `findings.received`, `findings.covered`, `artifacts`, `discarded`).

## Output Format

Return the contract: `{ status, sourceOfTruth, fixScope: { owner, mode, allowedPaths }, domains, matrix: [{ condition, oracle, expected }], redTests: [{ file, kind, sha256, command?, observed?, consumedBy? }], testExempt, exemptionRationale?, contractPath }` with `status ∈ red | stale | split-required`; a refusal carries `splitReason` (or the stale head) so the planner can re-scope.

## HALT Conditions

- A finding names a location that does not exist at `$base` ⇒ HALT naming it.
- The group's `$scope.mode` cannot hold every finding ⇒ `split-required`, no edits.

## Notes

- Blind by design: do not read `.pair/working/` outside `.pair/working/runs/$run/$story/`, nor checkpoints, handoffs or review logs — they carry the author's framing.
- Text shape: schematic, one line per row; the concrete failure case and its evidence at full length, no narration.
