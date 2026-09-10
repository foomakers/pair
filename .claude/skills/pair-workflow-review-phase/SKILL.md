---
name: pair-workflow-review-phase
description: "Stage 4 of the delivery workflow — independent final verification of one exact PR head: the deterministic custody check first (red-snapshot.mjs verify / verify-chain: snapshot ancestry, sealed blobs byte-identical, no unlisted test change, fixScope respected, revisions as successors), then the fixer's evidence re-run, the approved witnesses and controls, every prior blocking finding with an explicit transition, the source delta and its directly affected consumers, cross-group interactions, the adopted risk-tier review passes (general via /pair-process-review, plus security / boundary / architecture lenses as the tier rises) — unioned into one finding set with stable ids, one verdict and the head it reviewed. Publishes the one first review or the one synthesis idempotently (pr-comment.mjs upsert by marker) and states readiness only when the remote head equals the verified head. Read-only on code; never fixes, never merges. Dispatched by the batch engine (pair-implement-batch)."
version: 0.2.0
author: Foomakers
---

# /pair-workflow-review-phase — One Head, One Verdict, From Someone Who Did Not Write It

Judge the whole result on its own merits, adversarially, from the story (acceptance criteria), the PR (diff + description), the code and the cycle's evidence (contracts, seals, ledgers — claims to reproduce, never author context to trust). Custody first, a script decides; then evidence you re-run yourself; then the review passes the tier requires. Nothing the author wrote for themselves reaches you.

## Arguments

| Argument            | Required | Description                                                                                                                             |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `$run`, `$story`, `$pr`, `$branch`, `$worktree`, `$base`, `$stacked`, `$entry`, `$policy`, `$inputs`, `$workflowVersion` | Yes | The cycle arguments. `$worktree` here is a DETACHED throwaway path (`<worktreeRoot>/<story>-review`). Handoffs live under `.pair/working/runs/$run/$story/` in the MAIN checkout. |
| `$phase`            | Yes      | `r<n>`.                                                                                                                                 |
| `$mode`             | Yes      | `first` — the cycle's first review, POSTED with `$marker`. `re-review` — prior findings + the delta since `$head`, silent unless converging. |
| `$head`             | Yes      | The diff base for THIS pass: the head the implementation was published on (`first`), the previous `reviewedHead` (`re-review`). Empty only on a resumed PR whose cycle has no evidence yet — then the diff base is the story's `$base`. |
| `$marker`           | Yes      | `<!-- pair:first-review #<story> PR#<n> -->` — line 1 of the first-review comment, matched verbatim by every later resume.               |
| `$synthesisMarker`  | Yes      | `<!-- pair:synthesis #<story> PR#<n> -->` — line 1 of the ONE remediation synthesis, edited in place on every convergence.               |
| `$reviewLog`        | Yes      | The cycle's working log in the MAIN checkout (`.pair/working/reviews/<story>.md`) — rounds appended by the fixers; you read it to synthesize. |
| `$template`         | Yes      | Name of the code-review template whose vocabulary and structure the report follows.                                                    |
| `$severities`, `$verdicts` | Yes | Comma-separated vocabularies from the template contract.                                                                              |
| `$floor`, `$ranks`  | Yes      | The severity floor name (may be absent) and the JSON rank map — the script computes `blocking` from them; the coordinator re-checks it.  |
| `$reviewer`, `$reviewers` | Yes | Your index among the tier's independent reviewers and their count (`pipeline.reviewers`). `$reviewer > 1`: run your passes blind FIRST, then union with the prior reviewer's handoff. |
| `$reviewSkill`      | No       | The project's review process skill for the general pass (default `/pair-process-review`).                                                            |
| `$writeIssue`       | No       | The project's issue-filing skill (default `/pair-capability-write-issue`) — named only to forbid it.                                                    |
| `$prior`            | re-review | Name of the previous review handoff (`r<n-1>-review-phase`) in `$RUN_DIR`; `$openIds` the ids it left open — every one needs a transition. |
| `$headMoved`, `$inputsChanged` | No | `true` when the remote head moved after the last verification / when the effective inputs changed: re-validate every prior finding plus the delta; never a fresh full pass. |
| `$required`         | No       | JSON: verified prior evidence a card carries in (`observedHead`, oracle, probe, observed) — re-prove it on this exact head.               |

## Algorithm

### Step 0: Resolve the durable state (mandatory)

```bash
SKILL_DIR="$(dirname "<absolute path of this SKILL.md>")"
MAIN="$(pwd)"                                   # the main checkout — you have not cd'd yet
RUN_DIR="$MAIN/.pair/working/runs/$run/$story"
node "$SKILL_DIR/scripts/cycle-state.mjs" resolve --dir "$RUN_DIR" --workflowVersion $workflowVersion \
  --policy '$policy' --entry $entry --story $story --inputs $inputs --runsRoot "$MAIN/.pair/working/runs" --pr $pr --head "$(git ls-remote origin refs/heads/$branch | cut -c1-40)"
```

- `status: other-run` ⇒ return `{ status: "other-run", runId }`. `incompatible | invalid` ⇒ return `{ status: "redirect", next: { step: "blocked", reason: "failed-resume", detail: <reason> } }`.
- `next.step` is not `verify`, or `next.phase` is not `$phase` ⇒ return `{ status: "redirect", next }` verbatim. Spend no judgment. When `next` names THIS dispatch (`verify`, `$phase`) — `inputsChanged` or `headMoved` included — you ARE the step: continue, never return a redirect to yourself.
- Otherwise continue; `next.attempt` is your attempt number.
- `next.step: done` on a completed cycle whose remote head still equals its `reviewedHead` is returned as a redirect too: a cheap identity check, no judgment, no publication.

### Step 1: Isolation and pacing

1. Never switch the main checkout's branch. `git worktree remove --force $worktree 2>/dev/null; git fetch origin -q; git worktree add --detach $worktree origin/$branch; cd $worktree`. Remove it when done — every handoff you write goes to `$RUN_DIR` in the main checkout, never here.
2. **PACING (mandatory)**: a supervisor kills any agent that goes 180 seconds without a TEXT message. After EVERY file you inspect, write ONE SHORT LINE. List the changed files first (`git diff $head...origin/$branch --name-only`), say the order, go file by file.
3. **Blind (mandatory)**: do NOT read `.pair/working/` except `$RUN_DIR` (contracts, seals, handoffs, prior reviews — cycle evidence) and `$reviewLog` (to synthesize). Checkpoints are the author's private context.

### Step 2: Custody (deterministic — the script decides)

```bash
SKILL_DIR="$(dirname "<absolute path of this SKILL.md>")"
cd $worktree && node "$SKILL_DIR/scripts/red-snapshot.mjs" verify-chain --pr $SEAL_PR --base <round base>   # SEAL_PR: 0 for the initial chain (a0 and its a0-rev<m> successors are sealed before the PR exists), $pr for a remediation round
```

`<round base>` is the head the round's first seal sits on (`inputHead` of the round's first `red-verify` handoff; `a0`'s for a fresh story). Run it once per round that has a seal in `$RUN_DIR`; a single-snapshot group with no revision may also be checked with `verify --phase`. Any breach (`snapshot-missing`, `parent-not-base`, `test-blob-changed`, `unlisted-test-changed`, `out-of-scope`, `behavioral-adds-or-moves-module`, `test-mode-production-change`, …) ⇒ `custody: { verified: false, contractBreach: true, breaches }`, no review, publish the handoff, return — a breach is terminal for the attempt and preserves the trusted snapshot.

### Step 3: Evidence (re-run, never trust)

1. Re-run every sealed witness and control command from the manifests: witnesses green, controls green. A witness that FAILS is a finding `kind: approved-test-failing` with `groupId` and `rowId` — it routes the group back to GREEN on the same seal.
2. Re-run every row of the fixers' evidence ledgers (`$RUN_DIR/*-green-fix.json`, `implement-phase.json`): `observed` must reproduce. A ledger is an input to verify, never proof by assertion. Every new fixture field or table column is consumed by an expectation (trace it).
3. `$required`: re-run its oracle on this head; if the defect is still present it is a finding (`kind: regression`).
4. Full adopted gates on THIS head: run `$reviewSkill`'s gate step (or `/pair-capability-verify-quality` for the tier); a test result is reusable only under an identical `test-identity` recorded in the fixers' handoffs — otherwise rerun. The final gate set is the adopted full set.

### Step 4: Review passes by tier (declared before running, each once)

Read the PR's `risk:*` label. Declare the passes, run each once, never sample a pass again hoping for a different answer:

| Tier | Passes |
| ---- | ------ |
| `risk:green` | **general** — `$reviewSkill` phases 1–4 (validation, technical review, adoption compliance, completeness) |
| `risk:yellow` | general + **security** (`/pair-capability-assess-security $mode=review`) + **boundary**: for every changed parser, state machine, configuration or command-output domain, a finite decision table of supported states plus their invalid/boundary pair, probed at the real producer/consumer |
| `risk:red` or untagged | yellow's set + **architecture** (`/pair-capability-assess-coupling $scope=diff`) + an **adversarial second general pass** that starts from the acceptance criteria and tries to break each one |

- `first`: the full PR surface. **Contract inventory**: map each changed observable contract to its authoritative producer, inputs, consumers and representations before reporting the first hole.
- `re-review`: every `$openIds` finding gets a transition — `resolved` (you verified the fix, not the claim), `open` (still present, same id, same severity unless `severityEvidence` names a NEW failure case or changed impact), `superseded` (absorbed by another finding you name). Then ONLY the delta `git diff $head...origin/$branch --name-status`, its directly changed producer/consumer boundaries and the **cross-group interactions** of the groups fixed this round (two individually green groups whose outputs feed each other are checked together). A new finding is `kind: defect` if it is in this delta or a boundary changed by it; a real defect on unchanged code that the earlier review missed still blocks under the unchanged policy, is marked `missedUpstream: true` and gets a regression row in the next preparation; a gap in a sealed contract's coverage is `kind: contract-gap` with `groupId` — it revises that group only (`groupId: "a0"` for the initial acceptance contract: the cycle prepares `a0-rev<m>`, seals it as a successor and implements again on the same branch).
- Union the passes; deduplicate by (owner, location, observable defect) keeping every rationale; on severity disagreement keep the highest evidenced severity.

Every finding is CONCRETE: `id` (`r<n>-<k>`, or `r<n>-<letter>-<k>` when `$reviewer > 1`; a prior finding keeps its id), `location` (File:Line, or the card / PR body for an `external: true` finding — a location, never acceptance), `severity` ∈ {`$severities`}, `description` = the failure case (inputs/state → wrong output), `recommendation` ending `VERIFY: …; ORACLE: …; ASSERT: …`, `kind`, `transition`, `blocking` = `!nonActionable && transition ∉ {resolved, human} && kind ≠ question && rank(severity) ≥ rank($floor)` computed from `$ranks`. `nonActionable: true` ONLY when fixing would be genuinely wrong (byte-consistent with a source of truth, an existing convention, an ALREADY-EXISTING tracked story — cite its number; do not create one — or something that resolves only after merge), always with `disposition`. An `external` finding resolves only with read-back `evidence` (the exact command and what it showed) or a `transition: human` the card supplied. **DO NOT FILE NEW ISSUES**; never invoke `$writeIssue`. **History rewrite**: `needsHumanDecision: true`, `humanDecisionKind: "history-rewrite"`.

### Step 5: Verdict, readiness, publication (idempotent)

1. `reviewedHead` = `git rev-parse origin/$branch` AFTER inspection, lower-case 40-hex. `readiness.remoteHead` = `git ls-remote origin refs/heads/$branch` read back at the very end; `readiness.ready` = no blocking finding AND `remoteHead == reviewedHead` AND the full adopted gates passed on it.
2. `first` ⇒ post the full report as ONE PR comment in the `$template` structure with `$marker` verbatim as line 1: `node "$SKILL_DIR/scripts/pr-comment.mjs" upsert --pr $pr --marker "$marker" --body-file <report.md>` — the script reads the PR's comments back and edits an existing marker comment in place, so a restart under another invocation never posts a second first review.
3. Converged after remediation (`ready` and the cycle has a `$reviewLog` or any `*-green-fix.json`) ⇒ render the ONE synthesis — every finding across ALL rounds of the cycle as one table `id | round | severity | location | transition | commit`, then the carried findings with dispositions, then the verdict line — and `upsert` it with `$synthesisMarker`. Do NOT minimize or delete anything; the log stays until merge.
4. Blocking findings and the coordinator's budget is exhausted for this round (`round >= policy.maxFixRounds`), or every blocking finding is `external`, or a history rewrite ⇒ `upsert` an escalation with `<!-- pair:escalation #$story PR#$pr -->` naming the open ids and the human decision required.
5. `$reviewer > 1`: publish your handoff with `attempt: $reviewer`, `partial: $reviewer < $reviewers`, findings unioned with the prior reviewer's; only the last reviewer publishes to the PR.
6. Publish the handoff (`skill: "review-phase"`, `inputHead: $head or $base`, `mode`, `tier`, `passes`, `reviewedHead`, `verdict`, `findings`, `custody`, `readiness`, `published: { firstReview, synthesis, escalation }`, `gates: { command, identity, exitCode }`, `inputsDigest: $inputs`, `acHash` (the `cycle-state.mjs ac-hash --story $story` value — never a summary), `reviewer`, `partial`, `elapsedMs`) with `cycle-state.mjs publish … --predecessor <a0-implement-phase | r<n>-g<k>-green-fix | r<n-1>-review-phase>`, run `resolve` again and return its `next`.

## Output Format

`{ status: reviewed, verdict, reviewedHead, findings: [{ id, location, severity, description, recommendation, kind, transition, blocking, nonActionable?, disposition?, external?, evidence?, groupId?, rowId?, severityEvidence?, missedUpstream? }], custody: { verified, contractBreach, breaches? }, readiness: { ready, remoteHead }, published: { firstReview?, synthesis?, escalation? }, tier, passes, needsHumanDecision?, humanDecisionKind?, partial?, reviewer?, next }`.

## Notes

- Read-only on code: never edit, commit, push, label, fix or merge. The only writes are the marker-keyed PR comments and the handoff.
- The verdict is the template's; control flow keys on `blocking` and `next`, never on a verdict string. Individual green groups never imply approval: only this stage's `ready` on the exact remote head does.
