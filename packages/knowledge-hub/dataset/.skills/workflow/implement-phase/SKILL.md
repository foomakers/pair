---
name: implement-phase
description: "Stage 3 (initial) of the delivery workflow — implementation of one refined story inside its persistent worktree: on a fresh card above the base, writing the story's tests and code together test-first (no up-front contract) and fixing what an informal, unrecorded self-review against the AC and the review rules finds; on a run already carrying a sealed `a0` contract, strictly above its RED snapshot, never touching a sealed test byte — following the project's implement process, verifying the tier-resolved quality gate, recording decisions, writing the checkpoint, and then publishing exactly one review-ready PR through the project's publish-pr skill in the same execution. Resolves the durable cycle state first and redirects when another step is due. Never reviews, never merges. Dispatched by the batch engine (pair-implement-batch)."
version: 0.2.0
author: Foomakers
---

# /implement-phase — Build the Story Test-First, Publish Its One PR

Turn one refined story into verified commits, then project them onto exactly one pull request. Two entries, one stage:

- **Fresh card** (no `$snapshot`, no `$contract` — ADR-024 amendment 2026-09-23, US-506): there is no up-front acceptance contract. You work above the base and write the story's tests and code **together, test-first, as practice** — one AC at a time, the test that proves it first, then the code that makes it pass. Independence moves to the final verifier, who names per AC the test that proves it.
- **Sealed `a0`** (`$snapshot` + `$contract` given — a run started before that amendment, or an `a0-rev<m>` revision on it): the contract is the specification. You may change implementation inside its scope; you may not change what it asserts.

The review and the fixes are other stages with other actors.

## Arguments

| Argument           | Required | Description                                                                                                                              |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `$run`, `$story`, `$branch`, `$worktree`, `$base`, `$stacked`, `$entry`, `$policy`, `$inputs`, `$workflowVersion` | Yes | The cycle arguments, as every stage receives them. Handoffs live under `.pair/working/runs/$run/$story/` in the MAIN checkout. |
| `$phase`           | Yes      | `a0`, or `a0-rev<m>` when the final verifier found a genuine gap in a SEALED initial acceptance contract and the revised contract was sealed as a successor snapshot — implement again on the same branch, above that seal. |
| `$attempt`         | Yes      | `1` on the first implementation; `2` when the previous attempt published with a RED gate — same base (or same seal), fix the gate, never bypass it. |
| `$head`            | Sealed `a0` only | 40-hex head the contract was prepared on; the snapshot sits directly on it. Absent on a fresh card: `inputHead` is the worktree's HEAD after Step 1. |
| `$snapshot`        | Sealed `a0` only | 40-hex sha of the sealed RED snapshot commit — you re-discover it from Git, you never trust the prompt for its content. Absent ⇒ fresh card. |
| `$contract`        | Sealed `a0` only | Absolute path of the sealed acceptance contract (main checkout's run directory). Absent ⇒ fresh card.                                    |
| `$title`           | Yes      | Story title.                                                                                                                             |
| `$implementSkill`  | Yes      | The project's implement process skill (default `/implement`).                                                                            |
| `$verifyQuality`   | Yes      | The tier-resolved quality-gate skill (default `/verify-quality`).                                                                        |
| `$recordDecision`  | Yes      | The decision-recording skill (default `/record-decision`).                                                                               |
| `$checkpoint`      | Yes      | The checkpoint skill (default `/checkpoint`).                                                                                            |
| `$publishPr`       | Yes      | The project's PR-publishing skill (default `/publish-pr`).                                                                               |
| `$notes`           | No       | Scope directive from the card; it overrides the issue body where they conflict.                                                          |

## Algorithm

### Step 0: Resolve the durable state (mandatory)

```bash
SKILL_DIR="$(dirname "<absolute path of this SKILL.md>")"
MAIN="$(pwd)"                                   # the main checkout — you have not cd'd yet
RUN_DIR="$MAIN/.pair/working/runs/$run/$story"
node "$SKILL_DIR/scripts/cycle-state.mjs" resolve --dir "$RUN_DIR" --workflowVersion $workflowVersion \
  --policy '$policy' --entry $entry --story $story --inputs $inputs --runsRoot "$MAIN/.pair/working/runs" 
```

- `status: other-run` ⇒ return `{ status: "other-run", runId }`. `incompatible | invalid` ⇒ return `{ status: "redirect", next: { step: "blocked", reason: "failed-resume", detail: <reason> } }`.
- `next.step` is not `implement` ⇒ return `{ status: "redirect", next }` verbatim. Spend no judgment. When `next` names THIS dispatch (`implement`, `$phase`) you ARE the step: continue, never return a redirect to yourself — with one exception: `next` names this dispatch but carries a `contract` while the dispatch has no `$snapshot` (the coordinator's contract-less first guess on a run whose `a0` is already sealed, US-506) ⇒ return `{ status: "redirect", next }` verbatim, so the coordinator re-dispatches this step WITH the seal. Never take the fresh-card branch on a sealed run.
- Otherwise continue; `next.attempt` is your attempt number.
- A prior attempt may already have published a PR: `next` then says `verify`, and you return that — never a second PR.

### Step 1: Isolation and the contract (mandatory)

**Fresh card** (`$snapshot` and `$contract` absent): `next` from Step 0 carries no `contract` either, and `$RUN_DIR` holds no sealed `red-verify` handoff — if it does, the dispatch is inconsistent: return `status: failed`, `reason: seal-present-but-not-dispatched`. Create or reuse the story worktree (`git worktree add $worktree -B $branch $base` on first setup, `git worktree add $worktree $branch` if the branch has commits, plain `cd` if the path exists); `inputHead` = `git -C $worktree rev-parse HEAD`. Never modify the main checkout's tree or switch its branch. Items 2 and 3 below do not apply; continue at Step 2.

**Sealed `a0`:**

1. Do ALL git and file work inside `$worktree`; never modify the main checkout's tree or switch its branch. `git -C $worktree rev-parse HEAD` must be `$snapshot` (or a descendant of it on this branch); otherwise return `status: failed` with `reason: head-not-snapshot` — never reset, stash or rebase.
2. Discover the contract from Git: the commit `$snapshot` carries `Pair-RED-Snapshot: pr=0; phase=$phase; base=$head; manifest=<path>` (`pr=0`: the initial chain is sealed before the PR exists and keeps that identity for its revisions); read the manifest and the sealed test blobs with `git show` / `git ls-tree`. Accept no digest or test path from the prompt. Missing, ambiguous or contradictory discovery ⇒ `status: failed`, `reason: snapshot-not-found`.
3. With `$stacked=true`: `$base` is another story's branch — its commits are already in your history and must NOT be reverted, duplicated or re-implemented.

### Step 2: Implement, test-first

1. Follow `$implementSkill` as the process of record — its task cycle, its TDD discipline, the task/commit templates. `$notes`, when present, is a SCOPE DIRECTIVE that overrides the issue body where they conflict.
   - **Fresh card**: TDD as practice — tests and code evolve together, task by task, in the card's task order. For every acceptance criterion there is a test that would fail without the behavior it claims (run it before the code when you can; a bug-fix task gets its reproducing test first, always). No proof of test-first is recorded or required: what the verifier judges is the tests that exist at the head, per AC.
   - **Sealed `a0`**: the sealed acceptance tests are the story's RED: make every `baseline: red` witness pass and keep every `baseline: pass` control passing; item 2 below applies.
2. (Sealed `a0` only.) Do NOT modify, format, rename, regenerate, delete or weaken any artifact the snapshot records; do NOT amend, rebase, reset or rewrite the snapshot commit. A test the contract does not cover that you need for your own task cycle may be added (it is listed in your handoff); a sealed one is untouchable — a gap in the contract is reported as `contractGaps` for the final verifier, never patched around.
3. **Finite-state completeness** (mandatory when the change parses, selects, snapshots or branches on a finite protocol/state domain): make the whole decision table pass — every supported state and its invalid/boundary pair, including the smallest interaction cross-product. Do not implement one newly discovered row at a time and wait for review to name the next ordinary variant.
4. **Empirical evidence**: before asserting a measured or factual claim in source comments, test names, ADR/ADL, PR body or a diagnostic, record claim | authoritative oracle | exact command/fixture/revision | observed output; absent evidence, remove or qualify the claim. **Authoritative boundary proof**: an external command, format or runtime claim is proven at its real producer/consumer in an isolated probe. **Lossless diagnostics**: an error that reports user input keeps actual, expected and candidate values distinguishable.
5. Commit only the files you changed — stage explicit paths, never `git add -A`. Commit after every task: an uncommitted worktree loses everything if the supervisor kills the agent. Never run a single command that can stay silent for more than ~2 minutes (a cold full-repo gate qualifies): scope it, narrate between steps.
6. Run the tests you select by the changed producers and their consumers during iterations; record for each run `command`, `identity` (`node "$SKILL_DIR/scripts/cycle-state.mjs" test-identity --cwd $worktree --command "<cmd>"`) and `exitCode` — a result is reusable in a later step ONLY under the same identity.

### Step 3: Self-review, verify and record

0. **Informal self-review — fix, never record** (both entries, before the gates): re-read the card's acceptance criteria and the review rules your project's review would apply (`$implementSkill`'s quality standards, the code-review template's severities), walk your own diff against them, and FIX what you find — a missing test for an AC, a weak assertion, an edge case the AC names, a gate that would go red. Deliver only an artifact that holds up with its gates green. **Nothing of this self-review is recorded anywhere** — not in the handoff (`publish` refuses any `selfReview*` field: `self-review-not-recordable`), not in the PR body, not in a commit message, not in the checkpoint — so the independent verifier judges the result without your conclusions in front of it.
1. (Sealed `a0` only.) Remove the transient seal manifest (`.pair/red-snapshots/pr-*-a0*.json` — the initial chain is sealed under `pr=0`, it predates the PR) in your first commit above the snapshot: it is the seal's record and lives in Git history; the custody check expects it gone, and a manifest left in the tree fails the repository's format gate (canary run 11).
2. Verify the gates with `$verifyQuality`: it resolves the story's `risk:*` tier and runs exactly the checks CI would run for that tier, plus the repository's own pre-push gate when one exists. Sealed `a0`: re-run every sealed witness command from the manifest — all green. A red gate is `gatesPassed: false` and `status: ok` only if the PR was still published; never bypass a hook (`--no-verify` on a push is forbidden — it hides exactly the gate this stage must prove) and never report green what you did not run.
3. Record any architectural or project decision with `$recordDecision`, never only in a commit message; on the sealed `a0` path the acceptance contract's `fixScope.allowedPaths` covers the story's implementation surface and `.pair/adoption/decision-log/` for that reason — a decision that does not fit is reported under `contractGaps`, never smuggled into the PR body.

### Step 4: Checkpoint, publish the PR, persist

1. Write the story checkpoint via `$checkpoint $mode=write`, then push the branch.
2. Publish the PR by invoking `$publishPr`. Do NOT hand-roll the PR: that skill owns the whole sequence — the tier-resolved gate, the PR body composed from `pr-template.md` with only the pertinent conditional sections, the story's classification tags, ready-for-review, the `pr-state:*` label, the PR-URL back-link on the story, the board state. If a PR already exists for the branch it is UPDATED, never duplicated. **One expected signal**: it emits `Review: review-dispatch-required` instead of nesting a review — correct; the coordinator dispatches the final verifier. Never dispatch or run a review yourself.
3. **Text shape** of the PR body: schematic, one decision per line, no narration of the diff; everything a blind reviewer needs (rationale, decisions, ADR links) goes there — the reviewer cannot see the checkpoint.
4. Read back `prNumber`, `url` and the pushed head (`git rev-parse origin/$branch`, 40-hex). Publish the handoff (`skill: "implement-phase"`, `inputHead` (`$head` on the sealed path, the Step 1 HEAD on a fresh card), `snapshot` (sealed path only), `status: ok`, `gatesPassed`, `prNumber`, `url`, `outputHead`, `checkpointPath`, `tasks`, `testRuns: [{ command, identity, exitCode }]`, `addedTests`, `contractGaps` (sealed path only), `elapsedMs` — and NO self-review field) with `cycle-state.mjs publish … --workflowVersion $workflowVersion --attempt $attempt --pr <prNumber>`, plus `--predecessor a0-red-verify` on the sealed path only (a fresh card has no predecessor: `a0-implement-phase` is its first handoff) (the PR just created or updated — the envelope carries it even when the dispatch had none), run `resolve` again and return its `next` **verbatim** — copy the whole object the script printed; never retype, summarize or drop a field it carries because another field in your answer already seems to say the same thing (e.g. `contract`, next to a `contractHash` you also state). The orchestrator checks the object's shape, not your restatement of it; a hand-reconstructed `next` missing one field is refused as unusable.

**US-479 S12 — no production work without the complete seal (sealed `a0` path).** When the dispatch
names a contract, start only from a sealed contract whose applicable matrix rows are present and validated: if the seal is missing, partial, or its rows
were reduced after validation, stop and return the typed refusal instead of coding. You may never
edit, weaken or drop a sealed row — including a regression guard — to make your change pass.

## Output Format

`{ status: ok | failed, gatesPassed, branch, checkpointPath, prNumber, url, outputHead, summary, reason?, next }`. `gatesPassed: false` with `status: ok` means published but red: the cycle state routes ONE retry on the same base or seal (`$attempt=2`), then `failed-implement`.

## Notes

- Do NOT review. Do NOT merge. Never open a second PR for the same story.
- Read nothing under `.pair/working/` except the checkpoint and `$RUN_DIR`.
- Your handoff publish is observed by the host runtime (`cycle-runtime.mjs`, US-479 T-25) as a phase-level progress point, through `cycle-state.mjs` — never something you invoke yourself.
