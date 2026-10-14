# ADR-024: Delivery phases are skills; the batch workflow only coordinates

## Status

Accepted

## Date

2026-09-08

## Context

- `pair-implement-batch.js` had grown to 2,200 lines: every phase of the review ↔ fix loop (RED authoring, verification, sealing, GREEN, P3) was a multi-kilobyte free-form prompt inside the workflow, rules, shell commands and severity logic included. A delivery-behaviour change was a patch to a workflow then driving product PRs; the eleven decision-log entries produced that way were withdrawn on 2026-09-08 as iterative rules of an unfinished experiment.
- Git custody (rebase detection, `custodyReset`, `historyDecision`, `supersedes`) had become a second engine inside the first, repairing in place a situation the design can simply refuse.
- Deterministic work — hashing test artifacts, committing the RED snapshot, proving snapshot ancestry and blob identity — was delegated to LLM agents, re-derived by inference on every run.
- The Workflow sandbox has no filesystem: the coordinator sees only what an agent returns. A design claiming the coordinator "validates persisted digests" overstates it.
- `.pair/working/reports/delivery-workflow-to-be.md` (2026-09-08) proposed the target architecture; this record adopts its direction with the corrections below and settles what its §14 left open for the phases touched here (storage authority, RED repair budget, snapshot persistence).

## Options Considered

### Option 1: Keep the monolithic workflow, tidy the prompts

- **Pros**: no new skills, no taxonomy change.
- **Cons**: policy stays in a file not versionable or testable per phase; every rule change is a workflow patch; agent count and prompt size keep growing.

### Option 2: Big-bang replacement per the TO BE document (freeze, 11 new skills, registers, projector, canary, then cut-over)

- **Pros**: clean end state.
- **Cons**: months without delivered value; forbids reusing `pair-process-implement` / `publish-pr` / `process-review`, so it reaches the shipped product; adds `FindingRegister`, `TechnicalContextRegister` and a projector agent per boundary without evidence of need; ignores agent cost; assumes coordinator-side validation the sandbox cannot perform.

### Option 3: Strangler — same coordinator, phases replaced one at a time by versioned skills, deterministic Git work in scripts (chosen)

- **Pros**: each commit leaves the engine usable and tests green; TO BE reached incrementally; product skills untouched until measured necessary.
- **Cons**: for a while the file mixes skill invocations (fase D) with inline prompts (fases A–C).

## Decision

1. **Phase skills.** The delivery loop is eleven skills in a new `workflow/` category, installed as `pair-workflow-*`: `contract-phase` (0), `implement-phase` (A), `pr-phase` (B), `review-phase` (C — review set declared from the PR's risk tier, union of passes, `first` / `re-review` / `fresh` modes), `cycle-comments` (PR-comment policy: `probe` / `flush` / `synthesize`), `remediation-plan` (D0), `red-spec` (D1, the finite domain map is a step of it), `red-verify` (D2), `red-seal` (D3), `green-fix` (D4), `p3-verify` (D5). Each declares its arguments, single mutation boundary and handoff; the workflow names the skill and passes typed arguments (`$run $story $pr $phase $base $worktree $branch` plus phase-specific JSON). A workflow source scan must find no phase rule spelled inline (asserted in `pair-implement-batch.test.mjs`).
2. **Deterministic custody in a script.** `red-snapshot.mjs` — shipped INSIDE the skills that run it (`red-seal/scripts/`, byte-identical in `p3-verify/scripts/`, test-guarded), so a skill is portable as one folder on every harness — owns `seal` (HEAD at base, artifacts hash-checked, tree dirty only at the contract, one local `--no-verify` commit with the `Pair-RED-Snapshot` trailer, idempotent) and `verify` (one snapshot by trailer, parent == base, tree == manifest + artifacts, sealed blobs byte-identical at HEAD, no unlisted test change, production changes inside `fixScope.allowedPaths`, no module added or moved under a `behavioral` scope). Tested against throwaway repositories; the sealer and P3 agents run it and return its answer.
3. **Rebase is never repaired.** No custody probe, card-level reset or SHA-scoped waiver. An in-flight attempt whose base moved fails closed where measured; a resumed run starts a fresh review on the current head; older snapshots are historical evidence. A history-only finding stays a typed human escalation (`humanDecisionKind: history-rewrite`) taken before RED/seal/GREEN.
4. **One frozen plan per round.** D0 groups the round's actionable findings by canonical owner, one mode (`behavioral` | `structural`) and exact allowed paths; every finding index appears in exactly one group; groups run sequentially in dependency order, each on the previous group's verified head. A plan that drops, duplicates or invents an index is `failed-plan`.
5. **Handoffs.** Each phase writes one JSON under `.pair/working/runs/<runId>/<story>/<phase>-<skill>.json` (`runId` is a batch argument, default `story-<id>`). The next phase reads it; the coordinator validates only the typed value the agent returned. No finding register, technical-context register or projector agent: one file per phase is the storage authority until a measured need says otherwise.
6. **RED repair budget = 1**; a second rejection is `failed-red-contract`. P3 stays terminal for the attempt: a breach or a defect is `failed-preflight` and the next run starts a fresh RED contract.
7. **Agent budget is an acceptance criterion.** A fresh story with one fix round dispatches: implement, PR, probe, review, plan, red-spec, red-verify, red-seal (sonnet), green-fix, p3-verify, re-review, synthesis — twelve, mapper folded into RED, custody probe gone. Adding an agent requires stating what it removes.

## Amendment 2026-09-09 — what the first canary taught

First end-to-end run (story #321, PR #481, `runId: canary-479`): fases 0/A/B/C and the planner worked; the RED author refused a group `split-required` because the finding was a **guard-strength** defect (a positional-blind assertion) on already-correct production — no RED against unfixed production exists. Rules added:

1. **A third group mode, `test`** (`allowedPaths: []`) for a defect in a test artifact. RED is proven against an **injected regression** (fails on the restored defect, passes on current source); sealed as usual; no GREEN; P3 verifies the sealed blobs, the suite on the same head, and no production change (`test-mode-production-change` is a breach).
2. **A typed refusal is an answer, not a dead agent.** RED author `stale`/`split-required` and planner `stale` route by status (`failed-fix`, `failed-red-contract`, `splitReason` carried), never re-dispatched with the identical prompt.
3. **Handoffs live in the main checkout**: `.pair/working/runs/<run>/<story>/` resolves from the coordinator's starting working directory (before any `cd`), never a story or review worktree — the review's detached worktree is removed at the end and took its handoff with it.
4. **The RED contract path is absolute** (contract in the main checkout, sealer/verifier `cd` into the story worktree): the author returns an absolute `contractPath` (validated: under `/.pair/working/runs/`, no `..`, no shell syntax), handed on verbatim. Canary run 3 (#482, PR #483) had three of four groups' first `red` rejected for being absolute; the relative retry did not resolve from the worktree and cost one failed seal.
5. **Unsealed leftovers are discarded, not inherited.** After a RED attempt ending before the seal (coordinator rejection, killed agent), the next author, finding HEAD at base, tree dirty only at test artifacts and no snapshot for the PR, records those paths/hashes as `discarded` in its handoff and restores the tree. A dirty production path or moved head stays `stale`. Canary run 4 (#482) refused `stale` on such a leftover from run 3.
6. **The working log lives with the handoffs; a resume keeps its `runId`.** GREEN appends the cycle log under the main checkout's `.pair/working/reviews/`, where probe, flush and synthesis read it (canary run 5: log in the main checkout, probe looking in the worktree, so no resume was ever a continuation). The RED author treats the verifier's earlier rejection for its phase as mandatory rows; a `fresh` review re-validates the previous findings before hunting new ones.
7. **An out-of-repository finding is carried, never grouped.** A defect on the story card or PR body goes in the planner's `carried` with a disposition; the engine accepts it (`Outside the repository — …`) for the merge gate; an all-carried plan converges with them on record. Canary run 7 (#482) put one in a `structural` group with no paths and the plan was rejected.

## Amendment 2026-09-09 (b) — Revision: four judgment stages, incremental resume, upstream contract

For T-10 of #479. Live canaries 1–10 on #482 / PR #483 (cost of runs 1–8 in the baseline table below; run 9 `failed-preflight` on a real gate red; run 10 stopped by the maintainer after contract + probe) showed duplicate discovery on unchanged heads, RED contracts rebuilt on every resume, and invalid automatic dispositions. This revision **replaces** Decision §1, §3, §4, §6, §7 and amendments (a) §3–§7; §2 (custody in a script), §5 (handoffs are the storage authority, no register/projector), RED repair budget 1 and rebase-never-repaired stay in force. Previous text kept above as history.

### Replaced rules

| Superseded rule | Rule in force | Owner |
| --- | --- | --- |
| Resume starts a `fresh` full review; findings unioned with a new sample | A compatible same-input resume (same repository/PR, head, effective AC/policy/consumer inputs) runs only the **first incomplete or invalidated step**. Changed inputs re-validate prior findings plus the delta and its directly affected boundaries; an unrelated card edit invalidates nothing. | coordinator + `cycle-state.mjs resolve` |
| Planner after review; domain map re-derived on every RED retry | **One preparation stage** owns inventory (AC/finding → producer/grammar → inputs/representations → consumers → equivalence classes/interactions → executable evidence), grouping by owner/dependency and the executable contract, in `initial` (fresh story, before any production edit) and `remediation` modes. Every repair sees the verifier's prior rejection. | `red-spec` |
| Every row must be RED against current production | **Witnesses** must discriminate; already-correct **controls** may pass (`baseline: pass`); a `test`-mode row proves sensitivity on an isolated injected regression. Prose-regex presence proves nothing. | `red-spec`, `red-verify`, `red-snapshot.mjs` |
| P3 defect terminal; next invocation rebuilds RED | An approved test failing on production returns to **implementation on the same sealed contract**; a genuine contract gap revises **only the affected obligations** (stable row IDs, changed rows re-approved, sealed as a successor snapshot); a custody breach stops the attempt, preserving the trusted snapshot. Exhausted budgets are an unresolved failure. | coordinator, `green-fix`, `red-verify`, `review-phase` |
| Unsealed leftovers discarded wholesale by path shape | Attempt-owned artifacts (in the attempt's own handoff/contract) are reconciled; **unknown edits are preserved and reported** (`status: dirty`), never destroyed. | `red-spec`, `cycle-state.mjs` |
| An out-of-repository finding is `carried` and accepted | Explicit location and disposition (`external`); correction needs read-back evidence or an explicit human decision as input; an unresolved external blocker keeps the PR **not ready** (`escalate`). | `review-phase`, coordinator |
| Separate planner / probe / seal / P3 / re-review / publication dispatches; fixed 11 skills / 13 agents | **Four logical judgment stages**: preparation → independent contract validation (+ deterministic seal) → implementation → independent final verification (custody + evidence + review + tier passes + idempotent publication). Probe, seal, hash, state and comment publication are **scripts inside those stages**. The tier's reviewer count = that many independent final verifiers (`pipeline.reviewers`, KB default 1), cost reported. | coordinator |
| A fresh invocation discards previous runtime assumptions | Every handoff pins `workflowVersion`, `schemaVersion`, repository/PR identity, exact 40-hex heads and the effective-inputs digest; an incompatible version or moved history is `incompatible` / `failed-resume` — explicit revalidation, never silent reuse or overwrite of prior approval. | `cycle-state.mjs`, coordinator |

### Stage owners and retired dispatches

| Stage | Skill (installed as `pair-workflow-*`) | Agent | Folded in |
| --- | --- | --- | --- |
| 0 template contract (per batch, cache-by-hash) | `contract-phase` | `pair-contract-generator` | — |
| 1 preparation | `red-spec` | `pair-fix-test-author` | `remediation-plan` (grouping), domain map |
| 2 independent validation + seal | `red-verify` | `pair-red-contract-verifier` | `red-seal` (script `red-snapshot.mjs seal`) |
| 3 implementation | `implement-phase` (initial GREEN + PR publish) · `green-fix` (remediation GREEN) | `pair-implementer` | `pr-phase`; escalation flush as a script |
| 4 final verification | `review-phase` | `pair-reviewer` | `p3-verify` (script `red-snapshot.mjs verify`), re-review, `cycle-comments` probe / synthesize (script `pr-comment.mjs upsert`) |

Retired and **rejected at parse time** with a migration message, no shim: `pipeline.skills.remediationPlan | redSeal | p3Verify | cycleComments | prPhase`, `models.planner | seal | preflight | pr`. Consumers inventoried 2026-09-09: `pair-loop.js` passes cards only; the `#451` pair-cli execution adapter on `main` reads no engine key; `#441` (Codex orchestration) is an unmerged worktree and validates against this contract when it lands.

### Contract modes and typed reasons

- **Template contract** (`contract-phase`, `*.contract.json`) fixes the review vocabulary; **acceptance contract** (`<phase>-red-contract.json`, sealed) the executable obligations. A template-contract cache hit never skips acceptance validation.
- Caller-visible statuses: `ready-for-merge` | `escalate` | `failed-preparation` | `failed-contract` | `failed-seal` | `failed-implement` | `failed-fix` | `failed-verify` | `failed-custody` | `failed-resume` | `incompatible`. Only `ready-for-merge` advances, only with a 40-hex `reviewedHead` equal to the remote head at publication.
- Finding IDs are assigned once by the emitting verifier (`r<round>[-<reviewer>]-<n>`), persisting across rounds and runs with an explicit transition (`open | resolved | superseded | human`); a severity change needs `severityEvidence` (new failure case or changed impact). A newly evidenced defect on old code blocks under the unchanged policy, is marked `missedUpstream` and gets a regression row.

- **Scope inheritance (3.0.8, canary run 11)**: a `repair` or `revision` (`<phase>-rev<m>`) inherits the revised contract's `fixScope` (same `mode`, every `allowedPaths` entry) and may only add paths. The sealer reads the predecessor snapshot's manifest from Git and refuses `fixScope-narrowed` (`predecessor-snapshot-missing` when none); `verify-chain` reports a forged narrowing successor as `successor-narrows-scope`. Cause: a0-rev2 shrank a0 to one production file, leaving no home for the decision log or convention page.
- **Envelope carries the PR (3.0.8)**: `cycle-state.mjs publish --pr <n>` stamps the bound PR into every handoff; a PR contradicting the draft or an earlier handoff is `pr-mismatch`. A resumed coordinator reads the PR from the envelope, not only `next.pr`.

- **T-9 closure (3.0.9)**: chain custody lists every seal between cycle base and HEAD under EVERY identity (`pr=0` initial chain, `pr=<n>` groups), one `verify-chain` per cycle, a later seal ending the previous segment (t9-1); the transition authority honours the tier's `reviewers` count (reviewer `k+1` of the same phase until enough non-partial reviews of one head; a partial review never completes a cycle) (t9-2); readiness only by a 40-hex `remoteHead` equal to the reviewed head, in coordinator and cycle state (t9-3); approved-test-failing findings across groups return to GREEN group by group on their own seals (t9-4); a validate/implement/green `next` without a usable contract is typed `failed-resume` (t9-5); the fix-round budget is outside the effective-inputs digest — a human extending it after `escalate` resumes at the revision (3.0.9). Canary run 12 added: a repair/revision RESULT is a delta whose rows may cover base obligations the delta inventory does not repeat (a refusal had burned a retry); `behavioral` forbids creating code MODULES only — a new decision-log entry in an allowed path is legal (the implementer had reverted its ADL). Known cost: the digest change invalidates pre-3.0.9 review evidence once (one migration re-review).
- **T-9 re-review (3.0.10)**: the review handoff's `attempt` is the cycle state's (`$attempt` in the dispatch, `--attempt` on publish), never the reviewer index, so a post-GREEN-retry second review and reviewer 2 of a re-reviewed phase get their own filenames (t9b-1); the behavioral module guard exempts ONLY documentation and decision evidence (`.md/.mdx/.txt`, `.pair/adoption/`, `.pair/knowledge/`, `docs/`) — a new CI workflow, Terraform, migration, Dockerfile or JSON config stays a breach (t9b-2); the custody chain lists first-parent history only, so a foreign PR's merged seal is never a segment boundary (t9b-3); a preparation result's delta rule follows the dispatched mode (t9b-4).
- **Finding history across cycles (3.0.11, canary v4)**: ids are stable across rounds AND cycles, so a PR-entry cycle's first review may carry earlier findings as resolved/superseded history (non-blocking, read-back evidence) without being refused as invented closures. Known gap: a stage publishes its handoff before the coordinator judges it, so a coordinator refusal (`failed-*`) is not written back into durable state and a resume continues from the handoff.
- **Card hash stamped by the script (3.0.12, canary v4 run 15)**: `publish` computes the canonical card hash itself (`gh issue view`), replacing the agent's, marking `acHashSource: publish`; `resolve` compares only script-stamped hashes. Two agents hashing two ways had ping-ponged prepare ↔ verify until the three-redirect guard stopped the run.
- **External refusals are retryable (3.0.13, canary v4 run 17)**: a preparation refused `dirty` or `stale` (cause outside the cycle: worktree, head) is re-dispatched as the next attempt once a human clears it; a second identical refusal is terminal. `unprovable` and `split-required` stay terminal at once.

### Baseline frozen before optimizing

| Item | Value |
| --- | --- |
| Baseline coordinator | `pair-implement-batch.js` `WORKFLOW_VERSION 2.0.0` at `8b8b2607` |
| Baseline model policy | implementer/reviewer/RED/verifier opus; PR sonnet; seal sonnet; contract haiku; floor default `Minor` (canary runs 7–10 used `Major`) |
| Canary identities | story #482, PR #483, worktree `../pair-worktrees/482` at `c2e55274` (GREEN of run 9), `runId canary-479-run5`; #321 / PR #481 = refusal history only |
| Measured cost, runs 1–8 | 81 agents, 5.24M subagent tokens, 446 min — diagnostic context, not a like-for-like baseline |
| Requirement map | AC-01..16 → TC-01..17 as tabled on #479; every replaced rule above is a TC-05/06/09/10/11/12/13/14 case |

## Amendment 2026-09-10 — US-479 T-19: workflow 4.0.0, schema 3, human-only scope decisions

For T-19 of #479 (delta specification D4): version/taxonomy groundwork for the T-19–28 delta, not the behaviour those fields enable.

1. **Versions** (table below): handoff `schemaVersion 3` lives in all five installed `cycle-state.mjs` copies plus dataset sources; T-24's metrics version is pinned in the same module. A different major on either axis stays `incompatible`, as `3.x` was for `2.x`.
2. **New public statuses** `awaiting-scope-decision`, `failed-publication`, `interrupted`, `abandoned` join the documented list in `pair-implement-batch.js`; all non-ready. No caller change for AC-11 — `pair-loop.js` already halts on anything not `ready-for-merge`.
3. **Schema-3 taxonomy**, exported and validated by `cycle-state.mjs` before the atomic write: `FINDING_TRANSITIONS` (`open|resolved|superseded|human`), `RECORD_TYPES` (`decision|migration|judgment`), `SCOPE_CHANGE_TYPES` (`new-requirement|scope-extension`), `SCOPE_CHANGE_STATUSES` (`pending|ignored|extended|deferred`), optional envelope fields `scopeEpoch`, `scopeBaselineHash`, `firstReviewHead`, `remediationBatchId`. A scope proposal never carries `severity` or `nonActionable`. Unknown or ambiguous values are refused at `publish`, never reconciled later.
4. **`migrate-inspect` is read-only.** `cycle-state.mjs migrate-inspect --dir <dir>` reports `{compatibleEvidenceRefs, missingDimensions, ambiguity, next}` from schema-2 (or current) evidence without rewriting a byte; a migration acknowledgment is a NEW handoff (`recordType: migration`), never a silent upgrade.
5. **Default severity floor stays `Minor`** (`DEFAULT_SEVERITY_FLOOR`).
6. **Scope proposals are a human decision, never an automatic extension.** Superseded in part: see [2026-09-10-scope-proposals-are-a-human-decision.md](../../decision-log/2026-09-10-scope-proposals-are-a-human-decision.md). The 2026-08-12 rule (implementation/review never files a card for a **defect**; it fixes it or extends the story) is unchanged. Demonstrably **new scope** (S2: `new-requirement` / `scope-extension`, never a defect) is queued, never auto-absorbed or auto-carded, until the maintainer's explicit `ignore` / `extend-current-card` / `new-card` decision (S5).
7. **Metrics-view exception to the agent-budget rule.** Decision §8 ("agent budget is an acceptance criterion") is unaffected: `cycle-metrics.mjs` (T-24) and `cycle-runtime.mjs` (T-25) are deterministic scripts a phase runs, like `red-snapshot.mjs` and `pr-comment.mjs` — not a dispatch; the twelve-dispatch baseline does not rise.

### Baseline moved

| Item | Value |
| --- | --- |
| Coordinator | `pair-implement-batch.js` `WORKFLOW_VERSION 4.0.0` |
| Handoff schema | `cycle-state.mjs` `SCHEMA_VERSION 3` |
| Metrics view | `cycle-metrics.mjs` `METRICS_SCHEMA_VERSION 1` (module lands in T-24) |
| Prior baseline | `3.0.13` at `ab6d78de` (frozen table above), superseded by this amendment |

## Amendment 2026-09-10 (b) — US-479 T-20..T-27 closed under `4.0.0`

One commit per task on `feature/US-479-delivery-workflow-to-be` / PR #480:

- **T-20** — `cycle-verify` gaps carry `mechanismId`/`closureAssertions`/`reproducer`/`applicability`; a verifier's declared `mechanismsIdentified` must be closed in ONE answer (`publish` refuses otherwise); a repair must name every prior gap's row under `changedRows` (`repair-incomplete:<id>`, refused before the write).
- **T-21** — `cycleCounters` (attemptedCycles/completedCycles/reviewExecutions/reviewBatches/contractRevisions/preparationRepairs/implementationRetries) is a pure derived view; `maxFixRounds` bounds COMPLETED cycles, never the raw round counter, so a metadata-only re-review spends no remediation budget.
- **T-22** — scope proposals (`scopeChanges[]`) converge separately from defects: `awaiting-scope-decision` when quality converged with a proposal pending; `apply-scope-decisions` applies an authenticated maintainer decision mechanically (worked example in the batch-engine reference doc; see also the 2026-09-10 ADL).
- **T-23** — `args.entryCapsules` lets a proven-`done` story skip every dispatch, the batch-wide contract-phase call included, once its identity is re-verified; never trusted blindly.
- **T-24/25/26** — `cycle-metrics.mjs` (reducer, cohort aggregator) and `cycle-runtime.mjs` (host journal/usage observer, zero sandbox API): portable, dependency-light scripts, no new agent. The final synthesis comment is RUNTIME's to publish, read back and confirm; a review-phase handoff no longer upserts it.
- **T-27** — one composed lifecycle (initial build → defect + scope proposal → remediation → awaiting-scope-decision → authenticated extension → targeted remediation → done → confirmed summary) replayed through the real entrypoints, `pair-contracts/engine-integration.test.mjs`; full suite green at `76fa55aa`. The paid live canary (T-8) was NOT run. **Corrected 2026-09-11 (amendment g):** it did NOT cover DT-04's contradiction recovery, nor DT-19/22/30 on real usage sources (both found by the T-8 preflight); read it as "the composed lifecycle above", never "DT-01–34".

**Correction 2026-09-11 (amendment g):** T-21 cited DT-04..08, but DT-04's first clause ("conflicting sealed rows route revision in same cycle") was untested and unimplemented until (g); the recipe below named `--usage "$USAGE_PATH"` before (g) added a producer; `usage.byRole` (from the transcripts' `meta.agentType`) and the admin counters (from the engine's returned result) are not host limitations — the only real one is in (g) "Still open".

**Host launch recipe** (the coordinator's shell executor, never the Workflow sandbox, never a phase skill itself):

```bash
node <skill>/scripts/cycle-runtime.mjs entry --dir "$RUN_DIR" --repo "$REPO" --story "$STORY" --pr "$PR"
# … dispatch the phase skills as already documented …
node <skill>/scripts/cycle-runtime.mjs observe --dir "$RUN_DIR" --repository "$REPO" --story "$STORY" \
  --branch "$BRANCH" --pr "$PR" --journal "$JOURNAL_PATH" --usage "$USAGE_PATH" &
# … after the cycle reaches a terminal status …
node <skill>/scripts/cycle-runtime.mjs finalize --dir "$RUN_DIR" --repo "$REPO" --story "$STORY" \
  --branch "$BRANCH" --pr "$PR"
```

**Migration finding for #483 (read-only; no code or seal touched)**: `migrate-inspect` on `.pair/working/runs/canary-479-v4/482/` reports `{"compatibleEvidenceRefs":[],"missingDimensions":["scopeEpoch","scopeBaselineHash","findings-origin"],"ambiguity":[],"next":"migration-acknowledgment-required"}` — handoffs `schemaVersion: 2` / `workflowVersion: 3.0.10`. Resuming there needs an explicit migration acknowledgment (`recordType: migration`) first.

## Amendment 2026-09-10 (c) — targeted remediation of six T-19..T-27 findings

Six independent-review findings on the `4.0.0` metrics/entry-capsule/scope-decision surface, fixed test-first, no scope change:

1. **Entry capsule trusted as approval.** T-23's zero-dispatch shortcut let a self-consistent fabricated capsule (nonexistent run, stale head, unapproved verdict) reach `ready-for-merge` — the sandbox cannot validate one. Removed, with its contract-phase batch skip: readiness comes ONLY from the dispatched phase's own `cycle-state.mjs resolve` redirect.
2. **Observer/reducer timestamp mismatch.** `cycle-runtime.mjs` emits `observedAt` as epoch-ms (S7); `cycle-metrics.mjs`'s `Date.parse` gave `NaN` → `RangeError: Invalid time value`. One shared `toEpochMs` (number or validated ISO); invalid is `null` (explicit partial evidence), never a crash or fabricated duration. `time.incomplete`/`flaggedCount` propagate into the view.
3. **Token accounting not idempotent; coverage undercounted.** `reduceUsage`'s denominator is every OBSERVED execution; a started-but-unmeasured one is `missingExecutionIds`. `mergeObservations` dedupes deltas by `(executionId, eventId)`; the ADAPTER (`usageRecordToObservation`) keeps a raw sample's OWN `eventId` (a fixed synthesized one had collapsed every later delta onto the first). An `accountingBasis: 'inclusive-subtree'` execution's descendants are excluded from sum and denominator.
4. **Placeholder metrics presented as measured.** `execution.dispatches`/`startedWithoutResult` derive from observed `step-started`/`step-finished` events, never the handoff count; `redirects`/`engineRecoveries`/`administrativeDispatches`/`nestedDispatches` come from an optional `dispatchStats` (the recipe's WF-return counters), explicit `null` — never `0` — when absent; `usage.byRole` aggregates observations carrying a `role`; `usage.sharedOverhead` calls the previously-orphaned `allocateSharedCost` via an optional `sharedCost`; `snapshot.completeness` is `'complete'` only when every observed execution has usage AND timing has no incomplete flags (`finalizeMetrics` no longer overrides with a cruder check).
5. **Entry host output unparseable.** `buildEntryCapsule` returned `schemaVersion: null, run: null`, no `next`, and a `note` key WF's strict parser rejects. It now derives the capsule from a real `cycle-state.mjs resolve()` in the accepted shape, or `capsule: null` — fixing the producer/consumer shape only, restoring no authority (finding 1).
6. **Scope decisions marked applied without effects.** `extend-current-card` updates the card (idempotent per a stable marker) and reads back the body before `status: extended`; `new-card` verifies an existing `targetIssueUrl` via `gh issue view`, or — only when explicitly authorized with an approved title — creates the card and records the read-back URL; no success without a confirmed effect. Tested against a fake `gh` only; no real card touched.

Every other reported quantity's known/partial coverage was already exact, from the durable handoffs alone.

## Amendment 2026-09-10 (d) — four residual gaps in findings 3/4/6, closed against HEAD `99431a3c`

Verification of `99431a3c` found (c) real but incomplete on the same findings' AC:

1. **Finding 3 — dedup lost across checkpoint/resume.** The `(executionId, eventId)` ledger lived in one call's `Map`, so a resent delta after reload summed twice (100+200 → checkpoint → replay of the first → 400, not 300). `mergeObservations(raw, priorLedger)` takes and returns the ledger; `cycle-runtime.mjs`'s checkpoint persists `appliedDeltaEventIds` and reseeds it every tick — same checkpoint file, no second authority.
2. **Finding 4 — false completeness; admin counters off the real path.** An execution with usage but no result (or result without observed start) was missing from `reduceTime`'s intervals, so `time.incomplete` stayed `false` and `completeness` claimed `'complete'`. Every execution seen on either side now gets one interval, missing side `null`. `dispatchStats`/`sharedCost` reached `reduceCycleMetrics` only in direct tests; they now flow `runtimeTick` → checkpoint (a later tick/finalize omitting them keeps the last host values) → the CLI's `--dispatchStats`/`--sharedCost` JSON flags.
3. **Finding 6 — non-semantic AC readback.** `extendCard` matched id and description by independent substring `includes()`, so a description already under a DIFFERENT id passed (e.g. AC-1 replaced by text AC-2 carried → zero edit, false success; novel text → AC-1 duplicated). AC lines are now parsed by exact id (`AC-1` never `AC-10`), a targeted id replaced in place (old definition removed), a new id appended, an id carried twice refused — never guessed, never marked extended.
4. **Finding 6 — new-card not idempotent after a remote effect.** `createTargetIssue` created the issue BEFORE the handoff was durable, so a lost response, failed readback or failed enclosing `publish()` (held lock) could create a second. A durable per-(decisionRef, scope id) ledger is written BEFORE the call; `created` → reuse the URL (re-verified); unresolved `creating` → reconcile by a HIDDEN marker in the issue body, never by title (a foreign same-title issue is never adopted); a local create failure reconciles at once, since it never proves the remote call didn't land. The ledger is a plain atomic temp+rename JSON file in the run directory.

Tested against a fake `gh` boundary only; no real card was touched or created by this remediation.

## Amendment 2026-09-10 (e) — Finding 6 completed: real AC formats, and content over title alone

Verification of `ce0cf067` found (d)'s Finding 6 fixes incomplete against the ACTUAL adopted card formats and on content (not just title) matching.

**Caso A — the parser recognized only `**AC-01**: text` (colon)**, not #479's `- [ ] **AC-01 — Title.** Description.` nor the delivery template's (and #482's) numbered `N. **Given** … / **When** … / **Then** …` blocks; on #479 a requested AC-01 replacement was appended as a second, contradictory definition. Fixed: the checkbox dialect (full-token id, `AC-1` never `AC-10`; replace in place; duplicate refused) and Given/When/Then (by ordinal; a replacement must be GWT-shaped — "modifica … secondo il contratto adottato" — or is a shape-mismatch refusal). Neither dialect, or a GWT card with no block for the id, refuses instead of appending: a parser miss never proves an AC new. No universal Markdown parser.

**Caso B — new-card idempotence checked only TITLE and hidden marker**, so wrong/missing/duplicated AC content still succeeded ("confermare titolo e AC approvati, non soltanto il titolo."). One shared `verifyCreatedIssueContent` — identity (url/number), marker, title, AND every approved AC id→description pair (Caso A's parser) — is the SOLE check for fresh create+readback, `created`-ledger reuse, `creating`-ledger reconciliation and post-failure reconciliation. Divergent content is an explicit error, proposal unapplied, ledger untouched (a retry reconciles onto the SAME issue); never an automatic edit of a divergent card.

Tested against a fake `gh` only, with fixtures verbatim from #479's body and the template's GWT format; no real card touched.

## Amendment 2026-09-10 (f) — Finding 6 Caso A completed: cumulative AC dialects, and a fail-closed unrecognized card

Verification of `09df6963` found (e) had **replaced** the AC line matcher instead of extending it, and described a refusal the code did not implement.

**The colon dialect was dropped.** `AC-1: text` / `- **AC-1**: text`, called "a format no real card uses", is what a human writes, what this script emitted before `4.0.0`, and the shape of the report's own Finding 6 reproduction; (e)'s failure reopened for it, and six colon-fixture tests had been rewritten onto checkbox fixtures, so nothing went red. `parseAcCard` now recognizes dialects **cumulatively** — colon, #479's checkbox (with and without title), the template's Given/When/Then — merging AC-id dialects into one map (a duplicate id is ambiguous within or across formats). Each entry keeps its exact prefix, so a rewrite changes only the description. The colon fixtures were restored verbatim.

**An unrecognized card is refused, fail-closed and unconditional** (the code had let `dialect: 'unknown'` reach the append branch; an interim fix keyed on the id appearing in the body — a textual coincidence). Per ADL [2026-09-10-unknown-ac-card-format-fails-closed.md](../../decision-log/2026-09-10-unknown-ac-card-format-fails-closed.md), which holds the rule and its consequences: typed `unsupported-card-format` before any write (no `gh issue edit`, no `extended`, no `scopeEpoch` increment); recognized-dialect cards unchanged (`ac-id-unresolvable:<id>`, new ids still added). The DT-16 fixture now seeds an AC in a supported dialect, assertions unchanged; its unstructured body is kept as a negative test.

Tested against a fake `gh` only, through `applyScopeDecisions` with a stateful fake and persisted body; no real card touched.

## Consequences

### Benefits

- Delivery behaviour is a skill version: testable from a fixture, reviewable as prose, distributable in the dataset like every other skill.
- Git integrity is proven by code, not by an opus agent reading `git show` output.
- ~700 lines leave the workflow file across c1–c2; caller-visible statuses are enumerated and a caller must halt on anything not `ready-for-merge`.

### Trade-offs

- `models.redMapper` no longer exists (`models.planner` replaces it); `historyDecision` and `custodyReset` are unknown card keys.
- The defect history once kept as workflow-file comments is recorded once, in the appendix below; the file describes behaviour only.

## Adoption Impact

Required by the template and missing (q-10, independent pass over review 5190603055). Where the rules an agent reads live:

- **`.pair/adoption/tech/way-of-working.md` § Review Convergence** — every rule a cycle must obey is stated there, not read from this file: the negative transition matrix before implementation (amendment l), rollback as a maintainer's call with derived notes (r/s), the reintroduction transition (o), the regression-risk rewind (k) and the four judgment stages with incremental resume (b). **Rule**: an amendment here that changes what a cycle may do updates that section in the same commit, or the rule does not exist for any agent.
- **`.pair/adoption/tech/way-of-working.md` § Assignment / § Quality Gates** — the principals and tier gate the phases resolve at run time (assignee cascade for the scope-decision principal, the review tier matrix). No delivery-phase value is hard-coded in a shipped script.
- **`.pair/adoption/decision-log/`** — each delegated per-decision detail is its own ADL: human-only scope decisions and their identity, the unknown-AC-format refusal, derived rollback notes, custody never inferring a breach, the run-directory lock, the final reviewer's check/label authority and `finalize`, the card transport's accepted debt, author-blind PR-comment matching. Adding one regenerates `.pair/llms.txt`.
- **No change to `tech-stack.md`, `architecture.md` or `infrastructure.md`** — phases ship as skills + workflow assets in the existing dataset registries; no dependency, service or deployment surface added.

Beyond adoption (derived, gated by tests): the `workflow/` skill category in `packages/knowledge-hub/dataset/.pair/knowledge/skills-guide.md`, and `apps/website/content/docs/reference/batch-engine.mdx`, whose install claims the docs-staleness gate reads back from the registries.

## References

- Story #479, PR #480 — one branch, one squash-merge together with the 2026-09-08 hardening (`7b559003`).
- `.pair/working/reports/delivery-workflow-as-is.md`, `delivery-workflow-to-be.md` (2026-09-08).
- ADR-017 (automation loop), ADR-021 (fan-out realizations).

## Appendix — defects the coordinator's contract closes

Each line names the failure a rule prevents; the rule lives in the code or skill it belongs to.

| Rule | Failure it closed |
| --- | --- |
| Loud input validation (`args` must be a card list; unknown keys throw) | A bare ref list coerced to an empty batch, ran zero agents, reported success; a misspelled key (`prNumbr`) opened a second PR for a story that had one. |
| Present-but-empty is an error; `undefined`/`null` are the only spellings of absent | `base: cfg.base ?? ''` dropped the stacked-story clause; `prNumber: undefined` aborted a 20-card batch. |
| Card and pipeline values validated by CONTENT with one predicate set | `branch: 'main; gh pr merge 432 --admin'` rendered a merge command into an implement prompt; `id: '../..'` aimed a `--force` worktree remove outside the root. |
| `prNumber` must be a positive integer | `0` switched to resume mode, skipped implement and probe, reported an unbuilt story review-approved. |
| A review needs a verdict and a `reviewedHead` | Every reviewer died mid-response; `findings ?? []` read as "nothing actionable" → `ready-for-merge`. |
| Severity floor ranks by the contract's explicit `severityRanks`, never array order; prototype-free rank maps | An ascending vocabulary ranked `Blocker` below a `High` floor; `{severity: 'constructor'}` fell out of both partitions. |
| Accepted findings accumulate across rounds | Round-0 by-design and sub-floor findings vanished from the merge-gate table after a clean round 1. |
| Continuation probe keyed on the PR's existence and an exact marker, fail-open | Three pause/resume cycles posted three first reviews on one PR; a semantic reading of comment structure could silence a real one. |
| The note counts ADVANCED cards, not returned rows | An all-failed batch reported "PRs are ready-for-merge or escalated". |
| Only `ready-for-merge` advances in `pair-loop` | `seal-invalidated` and `stale-history-decision` cards were re-driven every iteration. |
| Rebase never repaired; custody by script | See Context: the second custody engine. |
| One frozen plan per round, indices into the received set | A finding could silently drop out of remediation. |

## Amendment 2026-09-11 (g) — US-479 B1/B2/B4: the three gaps the T-8 preflight found

The read-only T-8 preflight compared the engine at `65ece7dc` with #479's S3/S9/S10: three deterministic gaps, closed before any canary. No scenario launched, no seal retired, no finding waived.

### B1 — a contradiction with sealed rows routes a successor revision (S3, AC-08, DT-04)

S3: "predecessor contract hash + conflicting row IDs + authoritative counterexample produce `revisionReason=contradicts-approved-authority`. `deriveNext` chooses existing preparation `mode=revision`, same canonical cycle, exact `changedRows`." The engine instead routed to `blocked('failed-preparation')`, where canary v4 run 18b ended (correct route in its own `splitReason`).

- `contradiction` is a typed red-spec ANSWER, distinct from `split-required` (still terminal).
- Validated before the atomic write: `revisionReason`, `predecessorContractHash`, non-empty `conflictingRowIds`, `changedRows` covering them, an executable `counterexample` with no shell syntax. `revisionReason` on any other status is refused, so a 3.0.x prose `splitReason` is never promoted.
- The target resolves from the VERIFIED sealed identity behind the hash (a `red-verify` that verified and sealed it), never assumed current; an unsealed or unknown hash is `contradiction-unresolvable`.
- Route: `prepare / mode=revision` on `<succession line>-rev<m+1>`, based on the contradicted contract, carrying the exact rows and `contradictionFor` (raising phase and finding ids). The predecessor seal stays; the successor stands beside it.
- **Budget:** ONE successor revision per obligation per succession line. `publish` stamps `contradictionKey` from the sealed line + deduplicated sorted row ids (id order, raising group, successor hash irrelevant); `resolve` feeds in keys spent by every sibling run of the same story/PR, so a new `runId` buys nothing. An equivalent later contradiction is `escalate` / `budget: contradictionRevisions`. No other budget moved.

Also fixed: `envelopeErrors` validated red-spec's documented `findings: { received, covered }` against the REVIEW findings shape and refused it.

### B2 — legacy evidence is bound, not executed (S10, AC-27, DT-33)

No executable schema-2 resume is asked for; `resolve` rightly refuses one. Missing was the BINDING: nothing consumed or recorded `migrate-inspect`, so a new run directory looked like a clean PR whose lifetime totals dropped everything measured — what S10 forbids.

- `cycle-state.mjs migrate-acknowledge` writes ONE `recordType: migration` record binding the new run to the legacy run(s) it continues, transitively (v3 → v4 → v5 keeps v3), with a verified sha256 per legacy handoff, `migrate-inspect`'s finding and the path of any persisted predecessor metrics. Writes nothing into the legacy directory; idempotent (`already-acknowledged`); refuses `predecessor-evidence-changed` when a bound file moved.
- Evidence, not a judgment: a migration carrying `verdict`, `readiness`, `reviewedHead`, `findings` or `custody` is refused; it lives on a record-only phase (`m<n>`) that `deriveNext` and `cycleCounters` skip — no readiness, no review execution spent.
- Consumers: `resolve` returns `predecessorRuns` on every resume; `reduceCycleMetrics` FOLDS each bound predecessor's persisted metrics into a `lifetime` section (cycles + usage), listing predecessors without metrics in `lifetime.missingRuns` and pushing `legacy-lifetime` into `missingSources` (snapshot partial). Both renderers show it.

### B4 — the usage adapter the recipe assumed (S7, AC-20/21/25)

`observe --usage "$USAGE_PATH"` had no producer: the journal carries only `{started|result, key, agentId}` (no tokens, no timestamps); cost lives in per-agent transcripts the reducer did not read. Every T-8 token figure would have been `unknown`.

- `cycle-runtime.mjs usage-extract` joins transcripts to the journal on `agentId`: deterministic file reading, no provider API, no LLM, no message CONTENT — usage, timing, model, effort and role metadata only.
- Provider accounting, measured on run-18b transcripts: per `requestId`, input/cache fields REPEAT per `apiBlockIndex`, `output_tokens` GROWS, only the last block has non-null `stop_reason`. A request contributes fixed fields once plus its final block's output; disagreeing blocks contribute nothing and are reported, never averaged; no `stop_reason` keeps the charged cost but stays incomplete (`usage.incompleteExecutionIds`, snapshot partial).
- Records are cumulative per execution (re-read, rotation, restart rebuild the same totals). A transcript with no dispatch identity keeps its cost under an explicit `unattributed` phase, no invented parent; a journal execution with no transcript stays in `missingExecutionIds`.
- **Three clocks, never conflated:** host TICK time for journal records (coarse upper bound) and provider message timestamps COMBINE so the span only widens (earliest known start, latest known end); an end is claimed only where a terminal result was observed; neither clock is preferred for flattering.
- `dispatch-stats` derives the four admin counters from the engine's returned result (`nestedDispatches` stays `null`, absent there). `finalize` reconciles a late tail given the sources; a no-op repeat exits 0. Cache categories are rendered beside the aggregate.

**Correction 2026-09-11 (amendment h) to the bullet above:** "cache categories … never added into it" is retired — see (h) F3.

### Host launch recipe (superseding amendment (b)'s)

```bash
node <skill>/scripts/cycle-runtime.mjs entry --dir "$RUN_DIR" --repo "$REPO" --story "$STORY" --pr "$PR"
# a run directory that continues an older one is BOUND to it first, read-only:
node <skill>/scripts/cycle-state.mjs migrate-acknowledge --dir "$RUN_DIR" --legacy "$LEGACY_DIR" \
  --workflowVersion 4.0.0 --story "$STORY" --run "$RUN_ID" --head "$HEAD" --pr "$PR"
# TRANSCRIPTS is the workflow run's own directory, known once the Workflow tool returns its id:
#   ~/.claude/projects/<project slug>/<session id>/subagents/workflows/<wf id>/
node <skill>/scripts/cycle-runtime.mjs observe --dir "$RUN_DIR" --repository "$REPO" --story "$STORY" \
  --branch "$BRANCH" --pr "$PR" --runId "$RUN_ID" --journal "$TRANSCRIPTS/journal.jsonl" \
  --transcripts "$TRANSCRIPTS" --usage "$RUN_DIR/usage.jsonl" &
# after the run returns, its own result supplies the admin counters:
node <skill>/scripts/cycle-runtime.mjs dispatch-stats --result "$WF_RESULT" --story "$STORY" > "$STATS"
node <skill>/scripts/cycle-runtime.mjs finalize --dir "$RUN_DIR" --repo "$REPO" --story "$STORY" \
  --branch "$BRANCH" --pr "$PR" --runId "$RUN_ID" --journal "$TRANSCRIPTS/journal.jsonl" \
  --transcripts "$TRANSCRIPTS" --usage "$RUN_DIR/usage.jsonl" --dispatchStats "$(cat "$STATS")"
```

Paired measurement uses the same commands and `--transcripts` methodology on BOTH sides: the baseline runs its own engine from its own checkout in its own session (a phase skill is dispatched by NAME against the session's installed skills); the extractor is a host script run from this checkout on that session's transcript directory, so the baseline engine is never modified to be measured.

### Still open, honestly

- Parent/child attribution deeper than one spawn level: transcripts carry no parent link, so a nested execution's tokens count under its own identity, never attributed upward — not fabricated, not inferred.
- T-8 unchanged: no scenario run; the six paired scenarios still require the separate baseline session.

## Amendment 2026-09-11 (h) — the eight findings of the independent audit of `64e5ddd1`

An independent audit of the B1/B4/B2 candidate reproduced eight defects through the real entrypoints, closed as ONE remediation grouped by cause, before any canary. No scenario launched, no seal retired, no finding waived, no budget raised.

**F1 (B1 x B2) — a legacy seal's identity reaches the resolver.** A contradiction naming a contract sealed in a just-bound predecessor run was `contradiction-unresolvable` (reference listed, never used). `predecessorEvidence` reads the bound run's handoffs, each verified against the acknowledgment's sha256; `resolveSealedContract` searches the current cycle first, those identities second. The legacy directory stays non-executable and byte-identical; the successor continues the HISTORICAL succession line (`a0-rev3` → `a0-rev4`), carries `predecessorRunId`/`predecessorPhase` and receives `revalidate` — dimensions `migrate-inspect` reports missing are re-derived, never inherited. An unsealed hash, or a moved file, stays unresolvable and says which.

**F2 — a truncated transcript no longer deletes observed cost:** the durable state is a per-request ledger beside `usage.jsonl`, not a cumulative rebuilt from the source.

**F3 — provider accounting normalized.** For Anthropic `input_tokens` EXCLUDES cache reads and cache creation, so a request's billed total is `input_tokens + cache_read_input_tokens + cache_creation_input_tokens + output_tokens`; the adapter states `totalTokens` with the label `anthropic-exclusive-input` so an already-inclusive producer is not summed the same way. (g)'s "cache … never added into it" is retired; surviving rule: an aggregate is never counted together with its own details.

**F4 — the observer's read instant is not active time.** Journal observations carry `timeSource`; only demonstrated boundaries are measured; the read clock is reported, labelled, under `time.observation`.

**F5 — a migration record is not a judgment in the reducer either.** Migration-only is `not-evaluated`; a blocking review followed by an acknowledgment stays `not-converged`.

**F6 — the lifetime is a union by verified identity, validated and honestly incomplete.** Overlapping acknowledgments fold once; imports are validated (schema, story, PR); uncertainty propagates per dimension; `aggregateCohort` reads the lifetime, so a new run directory cannot improve a PR's cycles or cost.

**F7/F8 — the recipe is executed, not only written.** A test runs this ADR's bash block through the CLI on a fixture. The observer's stop is bound to the host's REAL terminal result (`mark-terminal --result`), never a flag invented in the journal nor the inference that all agents observed so far returned; the recipe owns the observer's PID and waits only for it; a tick after `finalize` cannot overwrite the finalized view.

### Host launch recipe (superseding amendment (g)'s)

Executable as written: `pair-contracts/recipe.test.mjs` extracts this exact block, substitutes the variables with a fixture and runs every line through the CLI, so a missing flag fails the suite instead of the canary.

```bash
node "$SKILL/scripts/cycle-runtime.mjs" entry --dir "$RUN_DIR" --repo "$REPO" --story "$STORY" --pr "$PR" --workflowVersion "$WORKFLOW_VERSION"
node "$SKILL/scripts/cycle-state.mjs" migrate-acknowledge --dir "$RUN_DIR" --legacy "$LEGACY_DIR" --workflowVersion "$WORKFLOW_VERSION" --story "$STORY" --run "$RUN_ID" --head "$HEAD" --pr "$PR"
node "$SKILL/scripts/cycle-runtime.mjs" observe --dir "$RUN_DIR" --repository "$REPO" --story "$STORY" --branch "$BRANCH" --pr "$PR" --runId "$RUN_ID" --journal "$TRANSCRIPTS/journal.jsonl" --transcripts "$TRANSCRIPTS" --usage "$RUN_DIR/usage.jsonl" --invocation "$WF_ID" --interval-ms 50 --grace-ms 2000 &
OBSERVER_PID=$!
node "$SKILL/scripts/cycle-runtime.mjs" mark-terminal --dir "$RUN_DIR" --result "$WF_RESULT" --story "$STORY" --invocation "$WF_ID"
wait "$OBSERVER_PID"
node "$SKILL/scripts/cycle-runtime.mjs" dispatch-stats --result "$WF_RESULT" --story "$STORY" --out "$STATS"
node "$SKILL/scripts/cycle-runtime.mjs" finalize --dir "$RUN_DIR" --repo "$REPO" --story "$STORY" --branch "$BRANCH" --pr "$PR" --runId "$RUN_ID" --journal "$TRANSCRIPTS/journal.jsonl" --transcripts "$TRANSCRIPTS" --usage "$RUN_DIR/usage.jsonl" --dispatchStats "$STATS"
```

- `$WF_ID` — the workflow run id the Workflow tool returns (`$TRANSCRIPTS` derives from it): the INVOCATION identity `mark-terminal` stamps and `observe` matches — see (j) F8-A.
- `$SKILL` — the installed `pair-workflow-review-phase` directory. `$TRANSCRIPTS` — the workflow run's own directory (`~/.claude/projects/<project slug>/<session id>/subagents/workflows/<wf id>/`).
- `$WF_RESULT` — the file the host wrote the workflow's result to; it, never the journal, ends the observation: the observer stops after reconciling its tail (or after the grace period, reporting partial), and the recipe waits for that ONE pid.
- The `migrate-acknowledge` line belongs only to a run directory continuing an older one. Paired measurement: as in (g).

## Amendment 2026-09-11 (i) — the five residuals of F1/F2/F4/F6/F8

Verification of `82de9dce` confirmed F3, F5, F7 closed and five only partly corrected — same ids and causes; missing was verifying the ALTERNATIVES inside approved invariants.

- **F1** — a contract's identity is a COHERENT SET of proofs. The lookup stopped at the first sealed `red-verify`, so a predecessor whose `red-spec` failed the digest check routed `prepare/revision` with no `contract` field. `contractProofs` requires the sealed verify AND the same phase's descriptor AND hash agreement; otherwise `evidence-incomplete` / `predecessor-evidence-incomplete:<run>/<phase>:<why>`, refused not routed. The route builds the descriptor from the two proofs; the coordinator independently refuses a `repair`/`revision` `next` without a complete descriptor.
- **F2** — the ledger separates the last ACCEPTED evidence from a later divergent observation. A contradicting block had dropped the request (490 → 330), deleting charged cost. The accepted value stands; the conflict is kept as `divergent` (deduplicated, never merged), the request flagged, and `usage.totalBasis: 'lower-bound'` + `usage-inconsistent` reach snapshot, lifetime and PR summary.
- **F4** — a message SPAN is not an execution DURATION (one complete message spans zero ms). `agentMs`/`activeWallMs`/`elapsedMs` come only from real execution boundaries (`timeSource: 'record'`); otherwise duration is unknown, timing coverage partial, and the span is reported as `time.messageSpan` with its own basis and a lower-bound note. No estimate, no tick clock. **With transcripts alone this engine measures cost, not duration — AC-14 cannot be argued from a span.**
- **F6** — the CURRENT run is a contributor like any other: a run with two executions and usage for one had reported a complete lifetime of 300. Its incompleteness now lands in `lifetime.partialRuns`, totals become `lower-bound`, the cohort inherits both, `costPerCompletedDelivery.lowerBound` says so. A certain ZERO needs proof nothing was dispatched (no observation, no handoff beyond migration records); otherwise zero means UNKNOWN.
- **F8** — finalization is idempotent, not a freeze. Revision = `max(persisted, checkpoint) + 1`, so a stale writer computes lower and is refused, a genuine reconciliation higher; the post-finalize guard compares a `viewFingerprint`, not a finalization's existence, so a late usage tail lands as a higher revision on the SAME comment, an unconfirmed publication is retried, and a no-op repeat exits 0.

Verified as interactions: migration → revision; transcript → checkpoint → restart → reducer; lifetime → cohort → summary; recipe → observer → terminal result → finalize. 511 workflows tests. Still no live canary, and #479 is not complete.

## Amendment 2026-09-11 (j) — F6 and F8 residuals: per-dimension coverage, invocation identity, evidence freshness, semantic fingerprint

- **F6** — lifetime coverage propagates PER DIMENSION (one verdict lost the incomplete execution's identity and passed the sum of KNOWN durations as the whole). `lifetime.usage.coverage` and `lifetime.time.coverage` are each `complete | partial | unknown`, with `partialRunsByDimension`, `lowerBoundDimensions`, per-dimension `totalBasis`; the cohort carries `lifetimeCoverageByDimension`; `costPerCompletedDelivery.lowerBound` is qualified by USAGE alone, so a partial duration never disqualifies a complete token cost. A certain zero still needs proof nothing was dispatched.
- **F8-A** — the terminal result belongs to an INVOCATION (`$WF_ID`), whose identity travels in marker AND checkpoint: `observe` accepts only its own invocation's terminal result, so a new invocation in the same run directory is never closed by an earlier one and a marker written before the first tick still closes its own (US-479 F8-A residual). A timestamp threshold either races the host's immediate marker write or accepts the previous invocation's. `--since <ISO>` stays a coarser fallback for a host with no id and filters the checkpoint's terminal too.
- **F8-B** — freshness is judged on EVIDENCE, never a revision number. `nextRevision` no longer folds in the writer's own checkpoint; `writeMetrics` refuses `stale-evidence` when the persisted view knows more about an execution than the candidate. Totals are never merged: identity, categories and request counts preserved by refusing, not averaging.
- **F8-C** — the fingerprint is the PUBLISHED semantic state minus genuinely volatile fields (revision, reduce timestamp, host read clock incl. per-observation heartbeat, terminal heartbeat, publication bookkeeping). An allow-list had mistaken real changes in unlisted fields (a host admin counter, timing coverage, lifetime evidence) for heartbeats. A true no-op returns the PERSISTED, confirmed view.

527 workflows tests; full quality gate green. No live canary, and #479 is not complete.

## Amendment 2026-09-11 (k) — US-479 T-29: the regression-risk rewind is a STATE transition, never a Git operation

D5/S11 adds one algorithm to the existing ledger and remediation loop: no fifth judgment stage, new agent, administrative round or budget.

**Terminology.** "Rewind"/"revert" in S11 mean a WORKFLOW-STATE transition from review back to the introducing batch's remediation preparation. Branch head, commits and seals stay put; the fix goes FORWARD. `lastCleanReviewedHead` is only the behavioural baseline a guard is compared against — never checked out, reset to, reverted to or rebased onto. `git revert`, `git reset`, `git rebase`, force-push, seal deletion and evidence rewriting are NOT part of it; a maintainer may authorize a Git revert separately, as its own decision.

**Qualification.** `origin: introduced-by-remediation` requires the violated approved obligation, an executable reproducer, the `lastCleanReviewedHead` where it passes, the `firstFailingHead` where it fails, the `introducedByRemediationBatchId` that produced the failing head, closure assertions and affected boundary references. `cycle-state.mjs` validates all before the atomic write and against the run's evidence (the batch exists and produced the failing head). Anything less is `origin: unknown` (an ordinary finding); a new or changed requirement stays a `scopeChanges` proposal. The script derives `riskId` from story/PR + stable finding id + introducing batch, so replay, restart and re-observation reuse it.

**One ledger, one derived matrix.** The risk lives on the finding entry as `regressionRisk { riskId, introducedByRemediationBatchId, lastCleanReviewedHead, firstFailingHead, reproducerRef, closureAssertions[], affectedBoundaryRefs[], state, dischargedByReviewId?, dischargedHead? }`. The ACTIVE matrix is a view over the latest state per risk; a handoff carrying its own aggregate is refused (`activeRegressionRisks-not-storable`) as a second, mutable authority.

**The transition.** An exact-head review proving the regression persists review, finding and risk in one atomic publish, naming `invalidatedBatchId`; `deriveNext` routes `prepare / mode=remediation` on THAT batch's phase as its next attempt, carrying every original unresolved finding and every active guard into ONE corrective contract. Then the ordinary path: preparation → red verification → green fix → independent delta review. Only an independent review bound to the exact new head discharges: it executes the closure assertions, shows the obligation passing, confirms the batch's original findings closed and re-tests the affected boundaries. A discharged risk leaves the active view, stays in append-only history; a reintroduction reopens it on the same stable finding. While any risk is active, `quality-converged`, scope escalation and `ready-for-merge` are impossible, and a scope decision can neither waive nor discharge one.

**Counters.** `invalidatedRemediations`, `regressionRepairs`, `activeRegressionRisks`, `dischargedRegressionRisks` derive from the same ledger and reach step metrics, lifetime/cohort views and the one PR summary, active and historical separated. An invalidated remediation is an ATTEMPTED batch; its round completes only once a review closes its original findings with no active risk it introduced. Every attempt, review execution, retry, token and interval still counts. `maxFixRounds` is reused as is — neither raised nor reset.

**Two pre-existing wiring gaps closed** (in T-29's commit): the coordinator never passed `$attempt` to preparation or validation (a phase's second attempt collided on the handoff name), and the GREEN step's `next` hard-coded `attempt: 1`; both follow what the phase has seen. A GREEN after a regression repair is verified as the NEXT review round; an ordinary approved-test retry keeps the round's own re-review.

## Amendment 2026-09-11 (l) — US-479 S12/AC-30: one transition authority, and the negative matrix upstream

Review of `cc221a83`: T-29's positive chain proved, its ILLEGAL transitions not contracted. Six consolidated root causes closed; no new agent, stage or budget; the rewind stays a workflow-state transition.

1. **Risk transition integrity.** `regressionTransitionErrors` is the single authority for every regression payload in `publish`, reading the PERSISTED ledger and history. A discharge requires a prior `active` entry for the same derived `riskId` (`regression-risk-transition-invalid:<riskId>:missing-active-predecessor`), a matching regression repair whose GREEN fixed and whose output head IS the reviewed head (`:missing-matching-repair`, `discharge-head-mismatch`), byte-equal immutable evidence (`:immutable-field-mismatch:<field>` over reproducer, closure assertions, boundaries, batch, both heads, cited obligations) and the batch's own obligations confirmed closed in that review (`:original-finding-not-closed:<id>`). Risk state, finding transition and blocking flag are ONE validated transition (`:finding-transition-incoherent`).
2. **Qualification authority.** An active claim is cross-bound to history: the failing head is an output the named batch produced (a `reviewedHead` is what someone looked at, not what a remediation built) and the head this review read; the baseline is a head this run reviewed with the cited obligation not open there; `originEvidence` agrees with the risk; `invalidatedBatchId` is the same batch. Inconsistent claims: `regression-qualification-invalid:<finding>:<why>`.
3. **Guard propagation.** The active set reaches red-spec, the INDEPENDENT red-verify (new `$regressionGuards` input), green-fix and the review; the verifier echoes the validated set and the coordinator enforces exact set equality before trusting the seal — `contract-incomplete:<phase>:regression-guards`.
4. **Human-decision precedence.** A mandatory human escalation (a history rewrite) is evaluated BEFORE the automatic rewind; an active risk cannot hide or consume it. A plain scope proposal has no such precedence and waits behind every quality risk.
5. **Batch/group lineage.** The repaired group is DERIVED from the group whose GREEN produced the failing head, with its own owner and allowed paths — never a hard-coded `-g1`; ambiguous provenance is `regression-lineage-ambiguous`; one canonical parser (`phaseParts`) replaces local round regexes.
6. **Scoped counters.** Completion is per batch lineage: the closing review is the non-partial one after the batch's last fix showing all its own obligations resolved and no active risk it introduced. A later unrelated dirty review can neither reopen nor erase a completed batch; `invalidatedRemediations` counts only batch identities history resolves (the no-op `|| true` filter is gone); the derived ledger is computed once per resolution and shared by next step, counters and returned matrix.

Upstream: `pair-workflow-red-spec` owns the S12 matrix for any changed persisted transition; `pair-workflow-red-verify` rejects an incomplete or inconsistent one before the seal; `implement-phase`/`green-fix` refuse production work without the complete seal and may not reduce a sealed row; `review-phase` samples the sealed matrix rather than being the first control to discover a fundamental illegal transition.

## Amendment 2026-09-11 (m) — the four variants the delta review of `7b539e69` found (V1–V4)

Variants of the same frozen root causes, not new findings.

- **V1 (F-RR-02).** `firstFailingHead` had to equal the CURRENT review's head and was not immutable, so re-observing an active risk meant rewriting origin evidence, losing the first-failure head and letting a later discharge certify a false "first failing" head. The current-head rule now applies to the FIRST observation only; afterwards `firstFailingHead` is immutable like reproducer, closure assertions, boundaries and baseline.
- **V2 (F-RR-03).** The guard set did not reach the REVIEW — the participant that executes and discharges guards. It is now dispatched with `$regressionGuards`, declared in `VERIFY_SCHEMA` and review-phase's inputs, echoed as executed, exact-set-checked: `contract-incomplete:<phase>:regression-guards`. The old fail-safe behaviour cost a whole wasted rewind — the cost S12 moves upstream.
- **V3 (F-RR-05).** Producing-group derivation excluded handoffs with a repair marker, but a repair's own GREEN is the producer when it introduced the next regression: provenance is decided by the head produced, never a label.
- **V4 (F-RR-06).** `cycleCounters` treated a missing `seq` as 0, `readHandoffs` as `+Infinity`, so on a migrated run without `seq` no cycle ever completed. ONE ordering now: `readHandoffs`' publication order.

One T-29 fixture that re-observed a risk by rewriting `firstFailingHead` to the head under review (what V1 forbids) was corrected; assertions unchanged.

## Amendment 2026-09-11 (n) — one attachment point for the guard set (R1), and one transition still unenumerated (R2)

- **R1 (F-RR-03).** V2 attached the guard set only to the post-GREEN verification; the **k-th reviewer of a multi-reviewer pass** (the one that must discharge when `policy.reviewers > 1`) and the re-review a **changed effective input** forces got no guards, reintroducing S12's wasted round. Now one rule on `deriveNext`'s result: every `prepare`, `validate`, `green` and `verify` dispatch carries the same active matrix, a branch that computed its own (the rewind) keeps it, `blocked`/`done` (decisions, not dispatches) are untouched. V2's per-branch spreads are removed.
- **R2 (F-RR-01) — OPEN, a contract decision, not implemented.** The authority enumerates `none→active`, `active→active`, `active→discharged`, but **not** the **reintroduction** `discharged→active` that review-phase's contract foresees ("a reintroduction reopens the risk on the same stable finding"): a later review could reopen a discharged `riskId` with different reproducer, closure assertions and boundaries, and the latest-wins view replaces the original evidence. Which evidence is immutable across a reintroduction (same defect ⇒ same reproducer? a new failing head in a distinct field?) is a contract question for story #479, deliberately NOT decided here; the transition stays unvalidated until then. Closed by (o).

## Amendment 2026-09-11 (o) — the reintroduction transition, decided and closed (US-479 S13/AC-31)

Decided narrower than either option (n) posed, by the evidence. `riskId` derives from story, PR, finding id and introducing batch; a discharged batch produces no further heads, so a defect observed after discharge was produced by a LATER batch. Attributing it to the original batch is already refused (`firstFailingHead-not-from-batch`); attributing it to the producing batch yields a different `riskId` — the ordinary, validated `none -> active`. Hence:

- a defect reintroduced by later work is a NEW risk with a new identity, not a reopening — the common case, no new rule;
- `discharged -> active` on an existing id is legitimate only to correct a discharge that should not have been granted (evidence unchanged, verdict wrong). A reopening is a RESTORATION of the prior entry, every field immutable — defect identity (`reproducerRef`, `closureAssertions`, `affectedBoundaryRefs`, cited `obligationIds`) and observation window (`lastCleanReviewedHead`, `firstFailingHead`, and `introducedByRemediationBatchId` through the id itself).

Implementation: the first-observation rule (`failing-head-not-current-review`) applies only with no prior entry; the immutable-field check applies to a prior entry in ANY state, cited obligations included. Positive control in the matrix: the same defect on a later batch's head takes `none -> active` with its own id.

## Amendment 2026-09-11 (p) — restoring content is not rewriting history (US-479 S13/AC-32)

green-fix's reading of `lastCleanReviewedHead` as "a behavioural baseline, **not a target to check out**" collapsed two things; the stricter half was never required:

1. **rewriting history** — `git revert`, reset, rebase, force-push — invalidates the sealed snapshot's ancestry, breaks custody and voids published reviews. Forbidden, unchanged;
2. **restoring content and rebuilding** — the group's own files as at the baseline, fix rebuilt, committed FORWARD. The branch never moves, the snapshot stays an ancestor, sealed test bytes stay identical, `verify-chain` stays green; Git cannot tell incremental from rebuilt content and custody does not depend on it.

Forbidding (2) forced each failed repair to patch a base the guard had proven bad, carrying the mistake forward. Now a group that already failed once to repair its OWN regression gets a reconstruction directive: restore exactly its `allowedPaths` content at `lastCleanReviewedHead`, rebuild carrying the batch's obligations and every active guard, commit forward. Safe, not lossy: the corrective contract IS the inventory of what must work again (only unverified work is lost); the regression travels as an executable reproducer plus closure assertions (a test, not a memory); producing group and scope derive from persisted history (S11/F-RR-05), so the surface is exact and ambiguous provenance refuses first.

Cost decides scope: the guard's own files are the surface, the group's `allowedPaths` the upper bound; a reconstruction costing a batch rebuild is a replan through the existing preparation path; a path a LATER round built on is refused (`reconstruction-overlaps-later-work`) — restoring it breaks consumers this contract does not cover, a human's trade.

## Amendment 2026-09-11 (q) — what two delta reviews changed in (l), (n), (o) and (p)

Two independent delta reviews of S11–S13 found ten and then ten findings; three of the second set were Major, each correcting an earlier amendment, superseded here:

- **Supersedes (l)#4 and (o)'s escalation wording.** Implemented as a check on one `humanDecisionKind`, so a review asking for a human WITHOUT a kind was overridden by the transition it meant to hold. Rule: ANY `needsHumanDecision: true` precedes every automatic transition; the kind only says why.
- **Supersedes (p)'s "a LATER round".** The reconstruction guard's subject is everything published after the review that proved `lastCleanReviewedHead` clean — including same-batch sibling groups, whose fixes land BEFORE the producer's and were invisible to a guard keyed on its fix. Path scopes compare by containment (`allowedPaths` holds directories and files).
- **Supersedes (m)/(n)'s budget reading.** A failing remediation completes nothing, so counting COMPLETED cycles made `maxFixRounds` unreachable in its own failure mode. It counts CONCLUDED cycles — a fix plus the review that judged it — phase-independently, since two shapes loop inside one round: the regression rewind (at the producing group's phase) and a contract gap (`<group>-rev<n>`).

Process note: the first round of fixes was written and tested by one author, each test confirming the imagined shape — all three Majors "fixed for the case I imagined". The second round had an independent agent derive witnesses from what the engine produces, before any fix — which found the contract-gap revision loop. For a defect class, the witness should not be written by whoever writes the fix.

## Amendment 2026-09-11 (r) — AC-32 stops deciding: two modes, and the maintainer picks the round

Supersedes (p) and the AC-32 half of (q). The GUARD, not the reconstruction, was the problem: establishing *who wrote these paths after which head* across contract revisions, directory scopes, sibling groups fixing in order and migrated ledgers (baseline review outside this run directory) produced four defects in three review rounds, each closed for the pictured case and open for its neighbour; and a wrong guard deletes work nobody asked it to touch. So the workflow no longer decides:

- **patch (default).** The rewind fixes forward on the current head. AC-32 not in play, no directive.
- **rollback.** A maintainer names the round (`rollbackTo`, a phase id, per card). Its head is resolved from persisted history (its last fix's output, or the head its review read); the producing group's own `allowedPaths` are restored to that content and rebuilt with the batch's obligations and every active guard. The commit goes FORWARD; no Git history operation. An unresolvable round emits no directive and a typed refusal (`rollback-round-unknown:<round>`), never a guessed head.

Ordinarily chosen after the budget escalates (three concluded corrective cycles), with the cycle's evidence in hand. No algorithmic veto: overlapping work no longer blocks it — whoever named the round owns the call, better placed than an `allowedPaths` heuristic. The fixer reports what it had to overwrite. Four defects and the ten tests encoding them left with the guard.

## Amendment 2026-09-11 (s) — correcting (q), and what the budget actually counts

The third independent review found three (q) statements unsupported:

- **"phase-independent"** — true, but the count was SKILL-dependent (keyed on `green-fix` handoffs): the initial contract's revision loop (`a0-rev<n>`) dispatches to `implement-phase`, so it spent nothing and `maxFixRounds` never fired — the third instance of the class in three rounds. Now: **a concluded corrective cycle is a newly SEALED contract judged by a non-partial review.** A `greenRetries` retry reuses the seal and spends nothing — fixing an undisclosed (q) collateral that charged it to `maxFixRounds`, a budget US-479 keeps separate from `redRepairs` and `greenRetries`. Two groups of one round share a review and spend one (T-21); the initial contract is not corrective, only its revisions count.
- **"ANY `needsHumanDecision: true` precedes every automatic transition"** — of a COMPLETE review. The check follows the custody breach check and the multi-reviewer gate, so a PARTIAL review asking for a human first dispatches the pass's next reviewer — correct, but not what (q) said.
- **Commit `3b817d2b`'s "removes entries claiming more completed cycles than attempted"** — false: `completed` came from a lifetime view, `attempted`/`spent` from the current run, so the hunk was a null mutation (reverting it broke no test). All three counts now come from one reading per view; the folded lifetime carries the same three.

Two more in the cohort fold: the comparator's last term never returned 0 (not a total order), so ties fell back to manifest position and "same set of views in, same entry out" was false; and a floor was marked only for overlapping views, not a disjoint fold containing a run whose spend was never measured — half a delivery unmeasured, reported as exact.

## Amendment 2026-09-12 (t) — superseding (r): the rollback takes a head, and it is spent once

> **Superseded in part by (u), below.** The head-taking half stands; the "spent once" half — and
> every mechanism built to implement it — was withdrawn on 2026-09-12 after four consecutive
> blocking defects. Read (u) before acting on anything in this amendment about spending.

The fourth and fifth reviews hit (r)'s paragraph from opposite sides; it still prescribed a deleted, dangerous mechanism, and (r) is what a future implementer reads as current.

**The head.** (r)'s round resolution is gone: it matched a non-revision name against its revisions and kept the last (`a0` → `a0-rev2`'s head, what (r) promised never happens) and could not resolve half the accepted alphabet. `rollbackTo` is a 40-hex head from `git log`, taken verbatim — no resolution, heuristic or guess. Validation is existence (this cycle recorded the sha); a refusal STOPS THE RUN: the state authority still derives `prepare` with the refusal as a field on the dispatch (not a dead end in `cycle-state.mjs` — what its test asserts; an earlier draft confused the layers), and the COORDINATOR ends the story `failed-preparation` on it. Typed refusals: `rollback-head-invalid:<value>`, `rollback-head-unknown:<sha>`, `rollback-scope-unknown:<phase>`; **`rollback-round-unknown:<round>` no longer exists** anywhere, nor its round-name grammar. A decision already carried out is NOT a refusal: `rollbackNote: rollback-already-honoured:<sha>`, cycle proceeds (DR5-Q1 — an unspent and a spent head had both looked like silence). See ADL 2026-09-12 `rollback-notes-are-derived-from-handoffs.md`.

**How many emissions** — (r) was silent. The fifth review (M-1: the guard asked `notes.active`, true by construction) and the sixth (DR4-01: keyed on the BATCH) are (u)'s proxies 1 and 2. Over-restoring is recoverable; silently ignoring a human decision is not.

**Rule (withdrawn by (u)):** honoured exactly once, spending keyed on the DECISION. The receiving preparation echoes the head as `reconstructedFrom` (sha validated before the write, checked by the coordinator in BOTH directions like the `validate` guard-set echo: no echo, a different head, or an echo nobody was handed stops the run). Spent when the fix DISPATCHED FROM that preparation (same phase and attempt, one coordinator unit) reported `fixed` — identity, not ordering (DR5-01: (u)'s proxy 3). A head nobody was handed is never spent; a different head is a different, owed decision; batch attribution falls back to the phase's round, so an omitted `remediationBatchId` cannot resurrect a spent directive. No consumption flag written or deleted.

Everything else in (r) stands: two modes, `patch` default, the commit FORWARD with no Git history operation, no veto on overlapping work, the fixer reports what it overwrote.

## Amendment 2026-09-12 (u) — superseding (t) in one respect: the workflow stops inferring that the rollback was carried out

Four implementations of (t)'s "once" each drew a blocking defect from the next independent review. The rule is withdrawn — a specification failure that recurs wherever the same shape is specified.

**The shape.** AC-32 asked the workflow to infer from an append-only handoff log whether a human's instruction *had been carried out* — a fact no participant writes or was asked to. Each implementation used a proxy:

1. the notes view being empty (M-1) — unreachable where evaluated, so the directive re-fired every rewind, restoring over its own rebuild;
2. "this batch has been repaired" (DR4-01) — true long before a maintainer names a head, so a first-ever decision was silently discarded;
3. "the echo, plus some later fix of the batch reported `fixed`" (DR5-01) — true when the handed repair FAILED and an ordinary one succeeded, consuming a decision with work that restored nothing;
4. "the echo, plus a fix at the same phase and attempt" — the two attempt counters derive from different populations (`byPhase('red-spec', …)`, `byPhase('green-fix', …)`) bumped by different events, so any contract repair or green retry desynchronises them permanently: re-delivery forever, or spending by a fix published before the decision.

Each round passed its own tests and a full green gate, because fixtures held the proxy's assumption by construction. A specification demanding a fact the data model does not carry has only proxies not yet falsified.

**The decision.** No spend inference. `reconstruct` is emitted on every rewind for which `policy.rollbackTo` names a head this cycle recorded; the maintainer clears `rollbackTo` when the decision is carried out. A decision's lifetime belongs to whoever made it. The workflow owes **legibility**: every delivery is reported in the run log with the head, the exact paths restored and whose job it is to end it, so a standing directive is a visible, attributable state, not an unseen misfire (silence hid three of the four rounds). AC-32's lesson, applied to its other half: (r) stopped deciding *whether* a restore was safe (four defects, three rounds); deciding *how many times* cost four more.

**What (t) keeps:** `rollbackTo` as a verbatim 40-hex head; refusals (`rollback-head-invalid`, `rollback-head-unknown`, `rollback-scope-unknown`) as a dispatch field, the coordinator ending the story `failed-preparation`; the commit FORWARD with no Git history operation; no overlap veto; the fixer's overwrite report; `rollbackNotes` as a derived view over the handoffs.

**Withdrawn:** the `reconstructedFrom` echo, its schema field, its two-sided coordinator check and `rollbackNote` — all existed only for the inference.

**Cost:** four repair rounds, four high-effort reviews, ~1,300 lines of churn, to spare the maintainer clearing a parameter they set. The simpler rule's failure mode — a forgotten `rollbackTo` re-delivers — is theirs, announced on every dispatch.

## Amendment 2026-09-13 (v) — canary v9 defects: `4.0.1`, run-scoped markers, decisions that survive a cycle, a synthesis that reaches the PR

Canary v9 (PR #481, run `canary-479-481-v9`) converged on quality (r1 APPROVED) and delivered nothing visible: no synthesis, no metrics, the previous cycle's first review overwritten, the maintainer's standing scope decision refused. Fixed on save branch `canary-479-v9-fixes-wip`, one test-first commit per defect:

- **Version.** `WORKFLOW_VERSION` `4.0.0` → `4.0.1`; `SCHEMA_VERSION` stays `3`; `compatible()` is major-only, so `4.0.0` run directories resume unchanged.
- **Markers are run-scoped.** First review, synthesis and escalation use `<!-- pair:<kind> #<story> PR#<n> run:<runId> -->`, so the next cycle on a PR never edits them (comment 5598044184 was); constant within a run, upsert-by-marker stays restart-safe. The scope-decision packet stays PR-scoped on purpose — its `sc-` ids and the maintainer's answer outlive cycles. `pr-comment.mjs` accepts the optional suffix; `cycle-runtime.mjs finalize` builds it from `--runId`.
- **A scope decision is keyed by proposal identity and discovered on the PR.** See [ADL 2026-09-13](../../decision-log/2026-09-13-scope-decision-identity-is-the-proposal-id.md): `scopeBaselineHashOf` hashes `{ id, type }`; `apply-scope-decisions` without `--decision-ref` reads the PR's comments back and applies every decision-shaped one through the unchanged authenticated path; review-phase runs it before declaring `awaiting-scope-decision`.
- **The synthesis reaches the PR without a host process.** See [ADL 2026-09-13](../../decision-log/2026-09-13-the-final-reviewer-finalizes-when-no-host-runtime-is-present.md): the host recipe above remains the recipe where a host runs it; otherwise (the Workflow sandbox cannot) the final reviewer runs `cycle-runtime.mjs finalize` after its converging publish. The coordinator's `metricsRef` is evidence (`absent` unless a reviewer reported the file written or a host runtime is present); a reviewer that owned the synthesis and could not confirm it ends the story `failed-publication`.
- **Accepted findings** are one row per stable id (latest wording wins); the phase skills' SKILL text states what `publish` requires (`findings` array for green-fix, `--workflowVersion` on every publish line, the shell-metacharacter filter on `worked` evidence).
- **Documented, unchanged:** the RED snapshot manifest path `.pair/red-snapshots/pr-<n>-<phase>.json` and phase ids (`r1-g1`, …) are reused across a PR's cycles; a later seal rewrites the path in a new commit, and the chain reads seals from Git history, not the path — a naming collision only. A run-scoped path would be a `red-snapshot.mjs` contract change, left for a separate decision.

## Amendment 2026-09-13 (w) — T-9 fourth round: the engine concludes the check it registers, and its deterministic core hardens

After review 5190603055 on `61703560`. Append-only; (v) stands. The `4.0.1` contract gains fields; none change meaning:

- **The final reviewer concludes `pair-review` and the `pr-state:*` label.** See [ADL 2026-09-13](../../decision-log/2026-09-13-the-final-reviewer-concludes-the-pair-review-check-and-the-pr-state-label.md): `review-phase` Step 5.7 runs `pr-state.mjs conclude` (the KB mapping of `pr-state.sh`) as the last non-partial reviewer; a non-decision publishes nothing. The result carries `published.reviewCheck` and `published.prState`; merge stays outside the engine.
- **The scope-decision principal is adoption's.** See [ADL 2026-09-13](../../decision-log/2026-09-13-the-scope-decision-principal-is-read-from-adoption.md): `code-host-assignee`, else `default-assignee`; `--maintainer` overrides; unresolvable is `maintainer-unresolved:*`, fail closed.
- **The run-directory lock has an owner and a staleness rule.** See [ADL 2026-09-13](../../decision-log/2026-09-13-the-run-directory-lock-has-an-owner-and-a-staleness-rule.md): a dead writer's lock is broken and reported (`brokeStaleLock`), a live one past the bound is the typed refusal `stale-lock`.
- **Custody:** `verify-chain --run-dir` derives the contract expectation from the sealed `red-verify` handoffs; `--contract-expected false` beside one is `contract-expected-refused`.
- **Metrics:** the reducer reads the host's terminal marker — `outcome.delivery` is the engine's typed status (`escalate`, `failed-*`, `interrupted`, `abandoned`), never `in-progress` for an ended run; a transport failure in `finalize` is `publication.state: failed`, local view written first, non-zero exit after.
- **Validators agree:** the coordinator's `blocking` policy exempts an active regression risk exactly as the publisher mandates; the `green` step carries the maintainer's `reconstruct` directive and the coordinator dispatches `$reconstruct` to the fixer.
- **`pr-comment.mjs`** splits `--paginate` pages string-aware.
- **Card transport is GitHub via `gh`, recorded as tech debt.** See [ADL 2026-09-13](../../decision-log/2026-09-13-tech-debt-card-transport-is-claude-code-plus-github-for-now.md): the constraint (GitHub as code host and PM tool, from Claude Code), the typed refusal an adopter elsewhere gets, the exit path (one `cardTransport` seam selected by adoption).
- **The host recipe on the workflow path.** Addendum to the 2026-09-13 finalize ADL: the sandbox has no shell, so the reviewer fallback is the path that runs; `pair run` is the host where the full recipe belongs (follow-up outside the engine).
- **Open (t9d-2):** the batch-level `pair-contract-generator` dispatch still runs on every batch; folding it into the first review dispatch (`$contractSpec`, loose schema for that one review, post-hoc vocabulary validation, floor/ranks agreement) is designed but not in `4.0.1` — it touches the vocabulary constants, the reviewer's Step 0 and four test suites — left for its own commit.
- **Supersession notes (t9d-32, t9d-33), so no retired rule stands as current:** in Decision §2 the `red-snapshot.mjs` locations `red-seal/` and `p3-verify/` are superseded by `pair-workflow-red-verify/scripts/` and `pair-workflow-review-phase/scripts/` (the install smoke test asserts the retired skills do NOT exist); in §6 `failed-red-contract` is superseded by `failed-contract` (the only spelling emitted); `pair-loop`'s halt rationale cites current non-`failed`/`escalate` statuses. The S7 surfaces the card names — a `telemetry` batch argument and `observe --publish-pr true` — were never shipped and are superseded: usage evidence enters via `cycle-runtime.mjs observe --journal/--usage/--transcripts` (T-25), publication is `finalize`'s (S8); `parseBatchArgs` keeps rejecting `telemetry` as an unknown key by design.
- **Closing (t9d-2), landed in `4.0.1`:** the template contract is resolved by the run's FIRST review dispatch (`$contractSpec`; the reviewer invokes the contract-phase skill and returns `templateContract`), never a generator-only dispatch. Vocabulary constants are recomputed at adoption; the one loose review is validated against the vocabulary it brought back (verdict ∈ options; an unknown severity keeps blocking); a caller floor the template cannot express fails the batch at adoption with the same message as before. Dispatch counts: cold 4 (was 5), one fix round 8 (was 9), resumed PR 1 (was 2).

## Amendment 2026-09-23 (x) — Revisits ADR-024: a fresh card has no up-front contract (US-506)

Append-only; earlier amendments stand except where this says otherwise. The engine stays at `4.0.1`: major unchanged, no argument renamed, in-flight runs compatible.

**What changes.** "The contract comes first" no longer applies to a **fresh card**; it still applies to **review findings**.

- **Fresh card ⇒ `implement / initial` first.** `deriveNext` on an empty run directory with `entry: fresh` answers `implement` (was `prepare a0`), identically for `pair-workflow-cycle`, `pair-cli run --card` and the batch engine's first guess.
  - The implementer writes tests and code together, test-first, as a practice; runs an informal self-review against the AC and review rules, fixes what it finds, publishes only with gates green.
  - **Nothing of the self-review is recorded:** `publish` refuses a `selfReview*` field (`self-review-not-recordable`).
  - No proof of test-first required. A fresh run's custody starts at the base: no `a0` segment; implement commits precede every seal.
- **Independence moves to a qualitative verify.** The first `verify` of a fresh card names, per AC, the test proving it (`acAssessment`; `publish` refuses the first review without it).
  - A weak or missing test is an ordinary finding; no new class; a `contract-gap` / `approved-test-failing` naming a group that sealed nothing routes ordinary remediation.
  - Every OPEN finding is evidenced: a reproducer (command or test) or a concrete failure scenario (`finding-unevidenced` otherwise). Taste is not a finding.
  - A mutation probe is optional, never required.
- **Review findings keep the sealed test-first path, unchanged:** `prepare r<n>` (a non-fixer writes the failing tests) → `validate` (independent validation + seal) → `green`. One path for every card, `risk:red` included: more protection means more reviewers (`pipeline.reviewers`), not an extra stage.
- **Runs already started finish under their rules.** A directory holding `a0` handoffs is not empty and continues the old transitions to completion; nothing migrated, no evidence discarded.

**Contract engine hardening (the findings path that remains).** Evidence: US-487's run.

- `publish` checks a repair against the **most recent** rejection. Each contract attempt is its own file (`<phase>-red-contract.attempt-N.json`), an earlier attempt's file must still hash as its handoff recorded, and a verdict carries the `contractPath` it validated.
- `cycle-state.mjs supersede` (an unvalidated attempt set aside, visible and indexed) and `decide` (a maintainer's answer to `needsHumanDecision` as a `recordType: decision` handoff) replace hand renames and the re-run review.
- `red-snapshot.mjs seal` runs one pre-seal guard: the repo's static gates (required `--static-gates`), a hermetic probe of every witness (no real `gh`, no network), the `predecessorContractHash` provenance check and a `changedRows` completeness check. A verified `red-verify` handoff carries per-row execution evidence; a witness that cannot fail is refused. See [ADL 2026-09-23](../../decision-log/2026-09-23-us-506-validator-execution-evidence-and-pre-seal-guard.md).
- `verify-chain --base-ref <base>` does not count files byte-identical to a merged base as PR changes (US-487 needed 7 overrides for exactly that).
- Every stage packet carries the bounded-commands guardrail: foreground, time-bounded commands only, no real engine or `gh` in a probe. A stalled stage is resumed once — on the same subagent where the realization can, fresh otherwise — within `deadDispatchRetries`.

**Supersession notes.** Decision §1's "preparation precedes every implementation" now holds for review findings only; implement-phase's "implementation against the sealed acceptance contract" for the sealed-`a0` path only. The batch engine's documented cold path is 2 dispatches (implement, verify), not 4. A batch run on an old-path directory pays one redirect at entry: to `prepare`/`validate a0` when its preparation is due, or to the same `implement a0` carrying the seal when `a0` is sealed and not implemented (implement-phase redirects a dispatch lacking the contract `next` carries; the engine accepts that one same-step redirect because it binds the contract). The in-session and console coordinators dispatch `resolve`'s own `next`, so they pay nothing.
