---
name: review-phase
description: "Stage 4 of the delivery workflow — independent final verification of one exact PR head: the deterministic custody check first (red-snapshot.mjs verify / verify-chain: snapshot ancestry, sealed blobs byte-identical, no unlisted test change, fixScope respected, revisions as successors), then the fixer's evidence re-run, the approved witnesses and controls, every prior blocking finding with an explicit transition, the source delta and its directly affected consumers, cross-group interactions, the adopted risk-tier review passes (general via /review, plus security / boundary / architecture lenses as the tier rises) — unioned into one finding set with stable ids, one verdict and the head it reviewed. Publishes the one first review or the one synthesis idempotently (pr-comment.mjs upsert by marker) and states readiness only when the remote head equals the verified head. Read-only on code; never fixes, never merges. Dispatched by the batch engine (pair-implement-batch)."
version: 0.2.0
author: Foomakers
---

# /review-phase — One Head, One Verdict, From Someone Who Did Not Write It

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
| `$attempt`          | Yes      | The cycle state's attempt number for THIS review of `$phase` (`1` for the first pass; `2+` after a GREEN retry or for a later reviewer of the same pass). It names the handoff file — never derive it from `$reviewer`. |
| `$reviewer`, `$reviewers` | Yes | Your index among the tier's independent reviewers and their count (`pipeline.reviewers`). `$reviewer > 1`: run your passes blind FIRST, then union with the prior reviewer's handoff. |
| `$reviewSkill`      | No       | The project's review process skill for the general pass (default `/review`).                                                            |
| `$writeIssue`       | No       | The project's issue-filing skill (default `/write-issue`) — named only to forbid it.                                                    |
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
cd $worktree && node "$SKILL_DIR/scripts/red-snapshot.mjs" verify-chain --pr $pr --base <cycle base>   # ONE call: the chain lists every seal between the base and HEAD under EVERY identity (pr=0 initial chain, pr=$pr remediation groups); `--pr` is informational
```

`<cycle base>` is the head the cycle's FIRST seal sits on (`inputHead` of the earliest sealed `red-verify` handoff in `$RUN_DIR` — `a0`'s for a fresh story, the first group's for a PR-entry cycle). Run it ONCE: a later seal ends the previous seal's segment whatever identity it carries, so a per-identity run would report the first remediation round's commits as breaches of the `a0` segment (T-9, t9-1); a single-snapshot group with no revision may also be checked with `verify --phase`. Any breach (`snapshot-missing`, `parent-not-base`, `test-blob-changed`, `unlisted-test-changed`, `out-of-scope`, `behavioral-adds-or-moves-module`, `test-mode-production-change`, …) ⇒ `custody: { verified: false, contractBreach: true, breaches }`, no review, publish the handoff, return — a breach is terminal for the attempt and preserves the trusted snapshot.

### Step 3: Evidence (re-run, never trust)

1. Re-run every sealed witness and control command from the manifests: witnesses green, controls green. A witness that FAILS is a finding `kind: approved-test-failing` with `groupId` and `rowId` — it routes the group back to GREEN on the same seal.
2. Re-run every row of the fixers' evidence ledgers (`$RUN_DIR/*-green-fix.json`, `implement-phase.json`): `observed` must reproduce. A ledger is an input to verify, never proof by assertion. Every new fixture field or table column is consumed by an expectation (trace it).
3. `$required`: re-run its oracle on this head; if the defect is still present it is a finding (`kind: regression`).
4. Full adopted gates on THIS head: run `$reviewSkill`'s gate step (or `/verify-quality` for the tier); a test result is reusable only under an identical `test-identity` recorded in the fixers' handoffs — otherwise rerun. The final gate set is the adopted full set.

### Step 4: Review passes by tier (declared before running, each once)

Read the PR's `risk:*` label. Declare the passes, run each once, never sample a pass again hoping for a different answer:

| Tier | Passes |
| ---- | ------ |
| `risk:green` | **general** — `$reviewSkill` phases 1–4 (validation, technical review, adoption compliance, completeness) |
| `risk:yellow` | general + **security** (`/assess-security $mode=review`) + **boundary**: for every changed parser, state machine, configuration or command-output domain, a finite decision table of supported states plus their invalid/boundary pair, probed at the real producer/consumer |
| `risk:red` or untagged | yellow's set + **architecture** (`/assess-coupling $scope=diff`) + an **adversarial second general pass** that starts from the acceptance criteria and tries to break each one |

- `first`: the full PR surface. **Contract inventory**: map each changed observable contract to its authoritative producer, inputs, consumers and representations before reporting the first hole.
- `re-review`: every `$openIds` finding gets a transition — `resolved` (you verified the fix, not the claim), `open` (still present, same id, same severity unless `severityEvidence` names a NEW failure case or changed impact), `superseded` (absorbed by another finding you name). Then ONLY the delta `git diff $head...origin/$branch --name-status`, its directly changed producer/consumer boundaries and the **cross-group interactions** of the groups fixed this round (two individually green groups whose outputs feed each other are checked together). A new finding is `kind: defect` if it is in this delta or a boundary changed by it; a real defect on unchanged code that the earlier review missed still blocks under the unchanged policy, is marked `missedUpstream: true` and gets a regression row in the next preparation; a gap in a sealed contract's coverage is `kind: contract-gap` with `groupId` — it revises that group only (`groupId: "a0"` for the initial acceptance contract: the cycle prepares `a0-rev<m>`, seals it as a successor and implements again on the same branch).
- Union the passes; deduplicate by (owner, location, observable defect) keeping every rationale; on severity disagreement keep the highest evidenced severity.

Every finding is CONCRETE: `id` (`r<n>-<k>`, or `r<n>-<letter>-<k>` when `$reviewer > 1`; a prior finding keeps its id), `location` (File:Line, or the card / PR body for an `external: true` finding — a location, never acceptance), `severity` ∈ {`$severities`}, `description` = the failure case (inputs/state → wrong output), `recommendation` ending `VERIFY: …; ORACLE: …; ASSERT: …`, `kind`, `transition`, `blocking` = `!nonActionable && transition ∉ {resolved, human} && kind ≠ question && rank(severity) ≥ rank($floor)` computed from `$ranks`. `nonActionable: true` ONLY when fixing would be genuinely wrong (byte-consistent with a source of truth, an existing convention, an ALREADY-EXISTING tracked story — cite its number; do not create one — or something that resolves only after merge), always with `disposition`. An `external` finding resolves only with read-back `evidence` (the exact command and what it showed) or a `transition: human` the card supplied. **DO NOT FILE NEW ISSUES**; never invoke `$writeIssue`. **History rewrite**: `needsHumanDecision: true`, `humanDecisionKind: "history-rewrite"`.

**Scope proposals are NEVER findings (US-479 T-22, S2/S5):** something demonstrably absent from the story's baseline/adoption/supported boundary — not a violation of anything approved — is `scopeChanges[]: { id: "sc-<n>", type: "new-requirement" | "scope-extension", proposal, baselineEvidenceRefs: [the evidence it is new, not a defect], discoveredAtReviewId, status: "pending" }`. It NEVER carries `severity`, is NEVER `blocking`, NEVER enters a remediation fix plan, and is never counted as a defect. `sc-<n>` ids are assigned once, under the same lock as finding ids (max existing numeric `sc-` id + 1), and stay stable across rounds. Cite the accepted obligation a finding violates; a proposal has none — if you cannot tell which it is, keep the classification visibly unresolved rather than moving a real defect into `scopeChanges`.

### Step 5: Verdict, readiness, publication (idempotent)

1. `reviewedHead` = `git rev-parse origin/$branch` AFTER inspection, lower-case 40-hex. `readiness.remoteHead` = `git ls-remote origin refs/heads/$branch` read back at the very end, ALWAYS present as lower-case 40-hex; `readiness.ready` = no blocking finding AND `remoteHead == reviewedHead` AND the full adopted gates passed on it. A `ready: true` without that head is unproven: the coordinator refuses it and the cycle state re-verifies (T-9, t9-3).
2. `first` ⇒ post the full report as ONE PR comment in the `$template` structure with `$marker` verbatim as line 1: `node "$SKILL_DIR/scripts/pr-comment.mjs" upsert --pr $pr --marker "$marker" --body-file <report.md>` — the script reads the PR's comments back and edits an existing marker comment in place, so a restart under another invocation never posts a second first review.
3. Converged after remediation (`ready` and the cycle has a `$reviewLog` or any `*-green-fix.json`) ⇒ your own handoff already carries every finding across ALL rounds (via `priorFindings`/the union you performed) and every scope proposal — that is the durable record; do NOT `upsert` a synthesis yourself. **US-479 T-26 (S8):** the ONE final synthesis at `$synthesisMarker` is owned by the host runtime's `finalize` step (`cycle-runtime.mjs`, run by the coordinator's launch recipe after you return), which combines your persisted verdict/head/handoff with the accumulated metrics into the required six-section summary (identity/versions, quality vs delivery, cycles/reviews, cost/time, late defects + scope table, machine-readable JSON) — deterministic, zero additional model tokens, never a second judgment. Do NOT minimize or delete anything from your OWN handoff; it stays until merge.
4. Blocking findings and the coordinator's budget is exhausted (COMPLETED corrective cycles reach `policy.maxFixRounds` — a metadata-only re-review never spends it, US-479 T-21 S4), or every blocking finding is `external`, or a history rewrite ⇒ `upsert` an escalation with `<!-- pair:escalation #$story PR#$pr -->` naming the open ids and the human decision required.
4b. Zero blocking findings but one or more `scopeChanges[]` are `status: pending` (the cycle state's `awaiting-scope-decision`, US-479 T-22 S5) ⇒ `upsert` the consolidated packet with `<!-- pair:scope-decision #$story PR#$pr -->`: for each proposal, its `sc-ID`, the proposal text, the evidence that it is new scope (not a defect), the affected AC/areas, and the three permitted choices (`ignore` / `extend-current-card` / `new-card`) with the exact fenced-JSON shape `apply-scope-decisions` expects (`schemaVersion`, `scopeBaselineHash`, `decisions[]`). This is informational only — you never generate a decision; the maintainer replies and the coordinator applies it mechanically via `cycle-state.mjs apply-scope-decisions`.
5. `$reviewers > 1`: EVERY reviewer records `reviewer: $reviewer` and `partial: $reviewer < $reviewers` in the handoff (reviewer 1 included); `$reviewer > 1` unions its findings with the prior reviewer's handoff (`$prior`); only the last reviewer publishes to the PR. The handoff's `attempt` is ALWAYS `$attempt` from the dispatch (the cycle state's number), never `$reviewer` — the second review of a phase would otherwise land on an occupied filename (T-9, t9b-1). The cycle state dispatches reviewer `k+1` of the SAME phase until `$reviewers` non-partial reviews of the same head exist; a partial review can never complete the cycle (T-9, t9-2).
6. Publish the handoff (`skill: "review-phase"`, `inputHead: $head or $base`, `mode`, `tier`, `passes`, `reviewedHead`, `verdict`, `findings`, `scopeChanges`, `custody`, `readiness`, `attempt: $attempt`, `reviewer`, `partial`, `remediationBatchId?: "r<n>"` (`$phase`'s round, when `$phase` is `r<n>` with `n >= 1` — US-479 T-21 S4), `published: { firstReview, escalation, scopeDecisionPacket }` (the final synthesis is `cycle-runtime.mjs finalize`'s to publish, US-479 T-26 — not this handoff's), `gates: { command, identity, exitCode }`, `inputsDigest: $inputs`, `acHash` (any value: `publish` REPLACES it with the canonical card hash it computes itself and marks `acHashSource: publish`; only script-stamped hashes are ever compared), `reviewer`, `partial`, `elapsedMs`) with `cycle-state.mjs publish … --attempt $attempt --predecessor <a0-implement-phase | r<n>-g<k>-green-fix | r<n-1>-review-phase> --pr $pr`, run `resolve` again and return its `next`.

**US-479 S11 — regression risks.** A finding is `origin: introduced-by-remediation` only with ALL of: the approved obligation it violates (`obligationIds`), an executable `reproducerRef`, the `lastCleanReviewedHead` where that reproducer passes, the `firstFailingHead` where it fails, the `introducedByRemediationBatchId` that produced the failing head, `closureAssertions` and `affectedBoundaryRefs`. Publish it as `regressionRisk: { ..., state: 'active' }` and name the batch in `invalidatedBatchId`; `publish` stamps the `riskId` itself and refuses the claim when a proof is missing or the failing head did not come from that batch. Anything less is `origin: unknown` — an ordinary finding — and a new or changed requirement is a `scopeChanges` proposal, never a risk. You never write the active matrix: it is derived from the ledger.

To DISCHARGE a risk you must be the independent review bound to the EXACT new head: execute its closure assertions, show the cited obligation passing, confirm the batch's original findings are closed, re-test the affected boundaries, then publish the same `riskId` with `state: 'discharged'`, `dischargedHead` equal to the head you reviewed and `dischargedByReviewId`. A reintroduction reopens the risk on the same stable finding and returns to the same remediation path; it is not a new discovery. `ready`, a converged summary and any scope escalation are impossible while one risk is active.

**US-479 S12 — sample the sealed matrix, do not reinvent it.** The sealed contract already names
the transition's positive and negative rows: execute them and the changed interactions on the exact
head. You are not the first control expected to discover a fundamental illegal transition — that is
the contract's job upstream. A further variant of a root cause already contracted stays that same
finding id; a genuinely distinct defect needs its own deterministic witness, independent cause and
separate impact before it is reported as new.

## Output Format

`{ status: reviewed, verdict, reviewedHead, findings: [{ id, location, severity, description, recommendation, kind, transition, blocking, nonActionable?, disposition?, external?, evidence?, groupId?, rowId?, severityEvidence?, missedUpstream? }], scopeChanges?: [{ id, type, proposal, baselineEvidenceRefs, discoveredAtReviewId, status }], custody: { verified, contractBreach, breaches? }, readiness: { ready, remoteHead }, published: { firstReview?, escalation?, scopeDecisionPacket? }, tier, passes, needsHumanDecision?, humanDecisionKind?, partial?, reviewer?, next }`.

## Notes

- Read-only on code: never edit, commit, push, label, fix or merge. The only writes are the marker-keyed PR comments and the handoff.
- The verdict is the template's; control flow keys on `blocking` and `next`, never on a verdict string. Individual green groups never imply approval: only this stage's `ready` on the exact remote head does.
- A resumed cycle whose LAST handoff is a `recordType: decision` record (published by `cycle-state.mjs apply-scope-decisions`, never by this skill) is not yours to re-judge: `resolve`'s `next` already routes it (a targeted remediation for an approved `extend-current-card`, or `done` once every proposal is dispositioned) — you only reach that step through the normal dispatch, same as any other `next`.
- **Host runtime (US-479 T-25, S7), never yours to invoke.** The coordinator's launch recipe — NOT this skill, NOT the sandbox — runs `cycle-runtime.mjs entry` before dispatching the first phase and `observe`/`reconcile`/`finalize` around it, using the shell executor it already has. `observe` tails ONLY the journal/usage sources it is given, on a 5-second default interval, updates `metrics.json`/`metrics.md` at every observed step boundary, and stops after a durable terminal result and reconciliation (or a 30-second grace period leaves it partial, never fabricated). **US-479 B4:** the host journal carries no tokens and no timestamps, so the cost source is PRODUCED from the harness's per-agent transcripts — `usage-extract` (also run inside `observe`/`reconcile`/`finalize` when `--transcripts` is given) joins them to the journal on `agentId`, counts each provider request's fixed fields once and its final block's output, and reads no message content; `dispatch-stats` derives the four admin counters from the engine's own returned result. **US-479 F8:** the observer stops on `mark-terminal`, the host's record of the workflow's OWN returned result — the harness journal has no end-of-run record, is never modified, and the end of a run is never inferred from the agents observed so far; after `finalize` no late tick can overwrite the finalized view. A run directory that CONTINUES an older one is bound to it first, read-only, with `cycle-state.mjs migrate-acknowledge` — the lifetime metrics then fold every predecessor that persisted metrics and name every one that did not, so a new run directory is never read as a clean new PR. Every phase's own handoff publish already updates phase-level observations through `cycle-state.mjs`, so a missing provider usage source never erases durable progress — it only leaves that one dimension partial.
