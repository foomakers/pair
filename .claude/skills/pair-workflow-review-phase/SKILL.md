---
name: pair-workflow-review-phase
description: "Phase C of the delivery workflow: one independent, blind review of one exact PR head — a declared set of passes chosen by the PR's risk tier (general via /pair-process-review, plus security / boundary / architecture lenses as the tier rises), unioned and deduplicated to one finding set with the template's vocabulary and a verdict. Three modes: first (posts the report with a hidden marker), re-review (fix delta only, silent), fresh (full pass, silent). Read-only on code; never fixes, never merges. Dispatched by the batch engine (pair-implement-batch)."
version: 0.1.0
author: Foomakers
---

# /pair-workflow-review-phase — One Head, One Finding Set, From Someone Who Did Not Write It

Judge the change on its own merits, adversarially, from three inputs only: the story (acceptance criteria), the PR (diff + description) and the code. Nothing the author wrote for themselves reaches you.

## Arguments

| Argument         | Required | Description                                                                                                                            |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `$run`           | Yes      | Run id; the handoff goes under `.pair/working/runs/$run/$story/`.                                                                        |
| `$story`         | Yes      | Story id.                                                                                                                              |
| `$pr`            | Yes      | PR number.                                                                                                                             |
| `$phase`         | Yes      | Round id, `r<n>`.                                                                                                                      |
| `$base`          | Yes      | The diff base for THIS pass: the branch base on a first/fresh review, the previous `reviewedHead` on a re-review.                        |
| `$branch`        | Yes      | Story branch. The head under review is `origin/$branch`.                                                                               |
| `$worktree`      | Yes      | A DETACHED throwaway worktree path to inspect from; the coordinator names it.                                                           |
| `$mode`          | Yes      | `first` — the cycle's first review, POSTED with `$marker`. `re-review` — fix delta only, silent. `fresh` — full pass on a resumed cycle, silent. |
| `$marker`        | Yes      | The exact hidden HTML-comment marker a `first` review must place as line 1 of its PR comment.                                           |
| `$template`      | Yes      | Name of the code-review template whose vocabulary and structure the report follows.                                                    |
| `$severities`    | Yes      | Comma-separated severity vocabulary (from the template contract).                                                                      |
| `$verdicts`      | Yes      | Comma-separated verdict vocabulary (from the template contract).                                                                       |
| `$priorFindings` | No       | JSON array: the previous round's actionable findings. Required with `$mode=re-review`.                                                 |
| `$priorHead`     | No       | 40-hex head the previous review covered. Required with `$mode=re-review`.                                                              |
| `$reviewSkill`   | No       | The project's review process skill for the general pass (default `/pair-process-review`). An adopter who names it differently passes it here.        |
| `$writeIssue`    | No       | The project's issue-filing skill (default `/pair-capability-write-issue`) — named only to forbid it.                                                    |

## Algorithm

### Step 0: Isolation and pacing

1. Never switch the main checkout's branch. `git worktree remove --force $worktree 2>/dev/null; git fetch origin -q; git worktree add --detach $worktree origin/$branch; cd $worktree`. Remove it when done.
2. **PACING (mandatory)**: a supervisor kills any agent that goes 180 seconds without emitting a TEXT MESSAGE. Tool calls do NOT count as progress. After EVERY file you inspect, write ONE SHORT LINE saying what you found or that it is clean. Never read two files in a row without speaking in between; never go into a long silent analysis pass. Start by listing the changed files (`git diff $base...origin/$branch --name-only`), say aloud the order you will take them, then go file by file. Brevity is fine; silence is fatal.
3. **Blind (mandatory)**: do NOT read `.pair/working/` (checkpoints, handoffs, review logs) except `.pair/working/runs/$run/$story/` to write your own handoff. They are the author's private context. If you need to know *why* something was done it must be in the PR description or an ADR; if it is not, that is a finding.

### Step 1: Declare the review set from the risk tier

Read the PR's `risk:*` label (`gh pr view $pr --json labels`). Declare the passes BEFORE running any; run each declared pass once; never sample a pass again hoping for a different answer.

| Tier | Passes |
| ---- | ------ |
| `risk:green` | **general** — `$reviewSkill` (default `/pair-process-review`) phases 1–4 (validation, technical review, adoption compliance, completeness) |
| `risk:yellow` | general + **security** (`/pair-capability-assess-security $mode=review`) + **boundary**: for every changed parser, state machine, configuration or command-output domain, a finite decision table of supported states plus their invalid/boundary pair, probed at the real producer/consumer |
| `risk:red` or untagged | yellow's set + **architecture** (`/pair-capability-assess-coupling $scope=diff`) + an **adversarial second general pass** that starts from the acceptance criteria and tries to break each one |

Union the findings; deduplicate by (owner, location, observable defect) keeping every rationale; on severity disagreement keep the highest evidenced severity.

### Step 2: Review

1. **Contract inventory (first/fresh)**: map each changed observable contract to its authoritative producer, inputs, consumers and representations before reporting the first hole. A `re-review` inventories only the fix delta and its directly changed boundaries.
2. Every finding is CONCRETE: `location` (File:Line), `severity` ∈ {`$severities`}, `description` = the failure case (inputs/state → wrong output), never a retelling of the diff; `recommendation` = the change in one or two lines, ending `VERIFY: <input/state -> expected>; ORACLE: <exact command, fixture or authoritative source>; ASSERT: <the observable assertion that consumes it>`. When a changed rule can feed another rule, name the paired direction and the minimal interaction cross-product; a declared fixture column that no expectation reads is not a test.
3. **Empirical evidence ledger**: a measured or factual claim (count, classification, version, external behavior) is asserted only with its authoritative oracle, exact command/fixture/revision and observed output. **Authoritative boundary proof**: when a row depends on an external command, format or runtime, probe the real producer/consumer; a unit test of the changed function cannot establish external semantics. **Lossless diagnostics**: an error that reports user input keeps actual, expected and candidate values distinguishable.
4. Report EVERY finding regardless of severity, including minor and questions. Verdict ∈ {`$verdicts`}.
5. **DO NOT FILE NEW ISSUES.** This is a hard rule and it overrides any habit of deferring work to a follow-up card: a debt found in this diff is resolved IN PLACE, in this same PR, within this story's scope. Never invoke `$writeIssue` (default `/pair-capability-write-issue`), never write `Deferred to #<new>`, never recommend "track this separately" — a finding parked in a fresh card is a finding nobody fixes. Set `nonActionable: true` ONLY when fixing would be genuinely WRONG (byte-consistent with a source of truth, an existing convention, an ALREADY-EXISTING tracked story — cite its number; do not create one — or something that resolves only after merge) and ALWAYS set `disposition` with the concrete reason. Being outside the story's originally stated scope is NOT a reason: fix it here. A finding so large it would swamp the story: say so in `description` and leave it ACTIONABLE — the human decides at the merge gate whether to accept the bigger PR or carve it out; that decision is not yours to pre-empt by filing a card.
6. **History rewrite**: if an actionable finding can only be fixed by rewriting, amending or rebasing existing Git history, set `needsHumanDecision: true` and `humanDecisionKind: "history-rewrite"`; still report every other finding.
7. **TEXT SHAPE (mandatory)**: write schematically — tables and one-line bullets over paragraphs; never restate what the diff shows, no preamble, no praise. KEEP AT FULL LENGTH the two things a reader cannot reconstruct: the CONCRETE FAILURE CASE (specific inputs/state → the wrong output) and the EVIDENCE it is real (what you ran, what it printed). Cut narration, never evidence.

### Step 3: Mode

- `first`: POST the full report as a PR comment on `#$pr` in the `$template` structure, with `$marker` VERBATIM as the first line of the comment body — an HTML comment, invisible in rendered markdown, that lets a later resume detect this review by an exact substring match. Then return.
- `re-review`: do NOT post any PR comment. Verify each of `$priorFindings` is genuinely resolved, not merely acknowledged. Inspect ONLY the fix delta `git diff $priorHead...origin/$branch --name-status` and its directly changed producer/consumer boundaries; do NOT re-audit the unchanged surface. A new finding is actionable only if it is in this delta or a boundary changed by it; otherwise report it as a Question.
- `fresh`: a resumed in-flight cycle with no prior findings in this run — a full independent pass, and do NOT post any PR comment.

### Step 4: Return and persist

`reviewedHead` = `git rev-parse origin/$branch` after inspection, lower-case 40-hex. Write `.pair/working/runs/$run/$story/$phase-review-phase.json` (`mode`, `tier`, `passes`, `reviewedHead`, `verdict`, `findings`).

## Output Format

`{ verdict, reviewedHead, findings: [{ location, severity, description, recommendation, nonActionable?, disposition? }], needsHumanDecision?, humanDecisionKind?, passes: [string] }`.

## Notes

- Read-only on code: never edit, commit, push, label, fix or merge. The only write is the `first`-mode comment and the handoff.
- The verdict is the template's; control flow downstream keys on `nonActionable` and the actionable count, never on a verdict string.
