---
name: green-fix
description: "Phase D4 of the delivery workflow: makes the sealed RED contract pass — discovers the snapshot from Git (never from the prompt), changes production only inside fixScope, never touches a sealed test byte, re-runs the RED commands and the tier gate, commits GREEN above the seal, updates the PR, and returns an evidence ledger. Dispatched by the batch engine (pair-implement-batch); invoke directly to fix findings against an existing RED snapshot."
version: 0.1.0
author: Foomakers
---

# /green-fix — Make It Pass Without Moving the Goalposts

The RED snapshot is the specification. You may change implementation inside its scope; you may not change what it asserts, where it lives, or how it is discovered.

## Arguments

| Argument     | Required | Description                                                                                          |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| `$run`       | Yes      | Run id. Handoffs go under `.pair/working/runs/$run/$story/` in the MAIN checkout the coordinator was started in (the working directory the coordinator was started in, before any `cd`) — never inside a story or review worktree, which may be pruned. |
| `$story`     | Yes      | Story id.                                                                                            |
| `$pr`        | Yes      | PR number.                                                                                           |
| `$phase`     | Yes      | Attempt id, `r<n>-g<k>`.                                                                             |
| `$base`      | Yes      | 40-hex head the snapshot sits on.                                                                    |
| `$worktree`  | Yes      | Story worktree.                                                                                      |
| `$branch`    | Yes      | Story branch.                                                                                        |
| `$findings`  | Yes      | JSON array: the group's findings to resolve, every one, including minor.                             |
| `$reviewLog` | Yes      | Path of the cycle's working log (e.g. `.pair/working/reviews/<story>.md`) to append this round to — resolved against the MAIN checkout (the working directory the coordinator was started in), never the worktree you `cd` into. |
| `$notes`     | No       | Scope directive from the card.                                                                       |
| `$writeIssue` | No      | The project's issue-filing skill (default `/write-issue`) — named only to forbid it.                 |

## Algorithm

### Step 1: Discover the snapshot

1. Find the ONE commit in `$base..HEAD` whose message carries `Pair-RED-Snapshot: pr=$pr; phase=$phase; base=$base; manifest=<path>`.
2. Read its manifest and test blobs with `git show` / `git ls-tree`. Accept no manifest, digest, test path or snapshot id from the dispatch prompt.
3. Read `fixScope`: one owner, one mode, `allowedPaths`. Missing, ambiguous or contradictory discovery ⇒ return `needsHumanDecision: true`; never repair the evidence.

### Step 2: Fix, bounded

1. Read the checkpoint if present (`/checkpoint $mode=resume`); otherwise work from the PR diff and code.
2. **Convergence sweep**: before editing, map the observable contract the findings touch — the reported case and its paired success/failure path, every state transition or resume path the contract owns, the canonical source and every distributed representation (generated asset, dataset copy, installed copy, documented command). Change every cell that contract needs, then stop: no unrelated cleanup, new behavior or speculative hardening.
3. Change implementation/adoption only inside `allowedPaths`. `behavioral` may not create, move or split production modules. For a generated artifact, edit only its canonical source and run the declared generator.
4. **Provisioned artifact contract**: when a change installs, builds, publishes, names or invokes an executable/package, prove `producer -> published identity -> consumer` in a clean temporary environment with the real artifact. Never stub the boundary.
5. Do NOT modify, format, rename, regenerate, delete or weaken any test artifact the snapshot records; do NOT amend, rebase, reset or rewrite the snapshot commit.
6. **Finite-state completeness**: when the change parses, selects or branches on a finite protocol/state domain, make the whole decision table pass — every supported state and its invalid/boundary pair, including the smallest interaction cross-product where one rule's output can be another's input (test the actual collision resolver, including duplicate input alongside a pre-existing generated/suffixed outcome). Do not implement one newly discovered row at a time and wait for re-review to name the next ordinary variant. A unit test of the function being changed cannot establish external semantics: prove an external command, format or runtime claim at its real producer/consumer boundary.
7. **Lossless diagnostics**: when an error reports user input or a derived identifier, keep lossless distinguishability between actual, expected and candidate values — escape or name code points for invisible, whitespace-normalized or confusable characters.
8. Resolve **every** finding in place. Never file a follow-up issue, never invoke `$writeIssue` (default `/write-issue`), never leave a "tracked separately" note. If a finding is genuinely larger than the story, fix what belongs here and say plainly in the log what remains — the human decides at the merge gate.

### Step 3: Prove and commit

1. Re-run every RED command from the manifest, the findings' evidence commands and the mapped boundary cases: all green.
2. Run `/verify-quality` for the story's tier. Record any forced decision with `/record-decision`.
3. Commit GREEN strictly on top of the snapshot; remove only the transient manifest path in that commit. Push.
4. Re-invoke `/publish-pr` (create-or-update): it rewrites the PR body to describe the CURRENT head — never append a round-by-round history — and keeps tags and `pr-state:*` in sync. It will emit `Review: review-dispatch-required`; that is expected, the coordinator drives the re-review.

### Step 4: Log and persist

1. Append to `$reviewLog` a compact `## Round <n>` table: `severity | location | what changed | commit`, then `## Evidence ledger, round <n>`: `claim | authoritative oracle | exact command/fixture/revision | observed output` — one row per measured or factual claim the fix asserts or propagates (counts, classifications, version facts, external behavior); a claim without a row is removed or qualified. One row per line; prose only where a fix diverged from the recommendation.
2. Write `.pair/working/runs/$run/$story/$phase-green-fix.json` (`status`, `snapshot`, `outputHead`, `findings.resolved`, `evidenceLedger`).

## Output Format

`{ fixed, needsHumanDecision, outputHead, evidenceLedger: [{ claim, oracle, probe, observed }] }`. `evidenceLedger` is `[]` only when the fix made no empirical or boundary claim.

## Notes

- A `mode: test` group never reaches this skill: the guard is the fix, and P3 verifies it directly on the sealed head.

- Do NOT post any PR comment; the coordinator synthesizes the cycle at the end.
- Never merge.
- Blind: read nothing under `.pair/working/` except the checkpoint, `$reviewLog` and the run directory.
