# ADR-024: Delivery phases are skills; the batch workflow only coordinates

## Status

Accepted

## Date

2026-09-08

## Context

- `pair-implement-batch.js` had grown to 2,200 lines: every phase of the review ↔ fix loop (RED authoring, verification, sealing, GREEN, P3) was a multi-kilobyte free-form prompt inside the workflow, with its rules, shell commands and severity logic spelled there. A change to delivery behaviour was a patch to a workflow file that was, at the time, driving product PRs — and the eleven decision-log entries produced that way were withdrawn on 2026-09-08 as iterative rules of an unfinished experiment.
- Git custody (rebase detection, `custodyReset`, `historyDecision`, `supersedes`) had become a second engine inside the first, repairing in place a situation the design can simply refuse.
- Deterministic work — hashing test artifacts, committing the RED snapshot, proving snapshot ancestry and blob identity — was delegated to LLM agents, i.e. re-derived by inference on every run.
- The Workflow sandbox has no filesystem: the coordinator only ever sees what an agent returns. Any design that claims the coordinator "validates persisted digests" overstates what it can do.
- `.pair/working/reports/delivery-workflow-to-be.md` (2026-09-08) proposed the target architecture; this record adopts its direction with the corrections below and settles the decisions §14 of that document left open for the phases touched here (storage authority, RED repair budget, snapshot persistence).

## Options Considered

### Option 1: Keep the monolithic workflow, tidy the prompts

- **Pros**: no new skills, no taxonomy change.
- **Cons**: policy still lives in a file that cannot be versioned or tested per phase; every rule change is a workflow patch; agent count and prompt size keep growing.

### Option 2: Big-bang replacement per the TO BE document (freeze, 11 new skills, registers, projector, canary, then cut-over)

- **Pros**: clean end state.
- **Cons**: months without delivered value; forbids reusing `pair-process-implement` / `publish-pr` / `process-review`, so it reaches the shipped product; adds `FindingRegister`, `TechnicalContextRegister` and a projector agent per boundary without evidence they are needed; ignores agent cost; assumes coordinator-side validation the sandbox cannot perform.

### Option 3: Strangler — same coordinator, phases replaced one at a time by versioned skills, deterministic Git work in scripts (chosen)

- **Pros**: each commit leaves the engine usable and tests green; the TO BE architecture is reached incrementally; product skills untouched until measured necessary.
- **Cons**: for a while the file mixes skill invocations (fase D) with inline prompts (fases A–C).

## Decision

1. **Phase skills.** The delivery loop is eleven skills in a new `workflow/` category, installed as `pair-workflow-*`: `contract-phase` (0), `implement-phase` (A), `pr-phase` (B), `review-phase` (C — review set declared from the PR's risk tier, union of passes, `first` / `re-review` / `fresh` modes), `cycle-comments` (the PR-comment policy: `probe` / `flush` / `synthesize`), `remediation-plan` (D0), `red-spec` (D1, the finite domain map is a step of it), `red-verify` (D2), `red-seal` (D3), `green-fix` (D4), `p3-verify` (D5). Each declares its arguments, its single mutation boundary and its handoff; the workflow names the skill and passes typed arguments (`$run $story $pr $phase $base $worktree $branch` plus phase-specific JSON). A workflow source scan must find none of the phase rules spelled inline (asserted in `pair-implement-batch.test.mjs`).
2. **Deterministic custody in a script.** `red-snapshot.mjs` — shipped INSIDE the skills that run it (`red-seal/scripts/`, and byte-identical in `p3-verify/scripts/`, guarded by a test), so a skill is portable as one folder on every harness — owns `seal` (HEAD at base, artifacts hash-checked, tree dirty only at the contract, one local `--no-verify` commit with the `Pair-RED-Snapshot` trailer, idempotent) and `verify` (one snapshot by trailer, parent == base, tree == manifest + artifacts, sealed blobs byte-identical at HEAD, no unlisted test change, production changes inside `fixScope.allowedPaths`, no module added or moved under a `behavioral` scope). It is tested against throwaway repositories; the sealer and P3 agents run it and return its answer.
3. **Rebase is never repaired.** No custody probe, card-level reset or SHA-scoped waiver. An in-flight attempt whose base moved fails closed where it is measured; a resumed run starts a fresh review on the current head; older snapshots are historical evidence. A history-only finding stays a typed human escalation (`humanDecisionKind: history-rewrite`) taken before RED/seal/GREEN.
4. **One frozen plan per round.** D0 groups the round's actionable findings by canonical owner, one mode (`behavioral` | `structural`) and exact allowed paths; every finding index appears in exactly one group; groups run sequentially in dependency order, each on the previous group's verified head. A plan that drops, duplicates or invents an index is `failed-plan`.
5. **Handoffs.** Each phase writes one JSON under `.pair/working/runs/<runId>/<story>/<phase>-<skill>.json` (`runId` is a batch argument, default `story-<id>`). The next phase reads that artifact; the coordinator validates only the typed value the agent returned. No finding register, no technical-context register, no projector agent: one file per phase is the storage authority until a measured need says otherwise.
6. **RED repair budget = 1**; a second rejection is `failed-red-contract`. P3 stays terminal for the attempt: a breach or a defect is `failed-preflight` and the next run starts a fresh RED contract.
7. **Agent budget is an acceptance criterion.** A fresh story with one fix round dispatches: implement, PR, probe, review, plan, red-spec, red-verify, red-seal (sonnet), green-fix, p3-verify, re-review, synthesis — twelve, with the mapper folded into RED and the custody probe gone. Adding an agent to the loop requires stating what it removes.

## Amendment 2026-09-09 — what the first canary taught

The first end-to-end run of the phase skills (story #321, PR #481, `runId: canary-479`) reached the
RED phase and stopped: fases 0/A/B/C and the planner worked; the RED author refused a group as
`split-required` because the finding was a **guard-strength** defect (a positional-blind assertion)
while production was already correct — no RED against unfixed production exists for it. Three
rules are added:

1. **A third group mode, `test`.** The planner assigns `mode: test` with `allowedPaths: []` to a
   finding whose defect is in a test artifact. Its RED is proven against an **injected regression**
   (the test fails on the restored defect, passes on the current source); it is sealed like any
   other; there is no GREEN; P3 verifies the sealed blobs, the suite on the same head, and that no
   production path changed (`test-mode-production-change` is a breach).
2. **A typed refusal is an answer, not a dead agent.** `stale` and `split-required` from the RED
   author, `stale` from the planner, are routed by status (`failed-fix`, `failed-red-contract`,
   with `splitReason` carried in the result) and never re-dispatched with the identical prompt.
3. **Handoffs live in the main checkout.** `.pair/working/runs/<run>/<story>/` is resolved from the
    checkout the coordinator was started in (its working directory before any `cd`),
    never from a story or review worktree — the review's detached worktree is removed at the end
    and took its handoff with it.
4. **The RED contract path is absolute.** The persisted contract lives in the main checkout's
    run directory while the sealer and the verifier `cd` into the story worktree, so the author
    returns an absolute `contractPath` (validated: under `/.pair/working/runs/`, no `..`, no shell
    syntax) and the coordinator hands it on verbatim. Canary run 3 (#482, PR #483) had three of four
    groups' first `red` rejected for being absolute; the relative retry did not resolve from the
    worktree and cost one failed seal.
5. **Unsealed leftovers are discarded, not inherited.** A RED attempt that ends before the seal
    (coordinator-side rejection, killed agent) can leave test edits in the worktree; the next RED
    author, finding HEAD at base and the tree dirty only at test artifacts with no snapshot for the
    PR, records those paths and hashes as `discarded` in its handoff and restores the tree before
    authoring. A dirty production path or a moved head stays `stale`. Canary run 4 (#482) refused
    `stale` on exactly such a leftover from run 3.
6. **The working log lives with the handoffs, and a resumed run keeps its `runId`.** GREEN appends
    the cycle log under the main checkout's `.pair/working/reviews/`; the probe, the flush and the
    synthesis read it there (canary run 5 found the log in the main checkout while the probe looked
    in the worktree, so no resume was ever a continuation). A resume passes the same `runId`, and
    the RED author treats the verifier's earlier rejection for its phase as mandatory rows while a
    `fresh` review re-validates the previous review's findings before hunting for new ones — the two
    attempts of one cycle build on each other instead of re-sampling.
7. **An out-of-repository finding is carried, never grouped.** A review may find a defect on the
    story card or in the PR body; the planner puts it in `carried` with a disposition, the engine
    accepts it (`Outside the repository — …`) for the merge gate, and a plan whose every finding is
    carried converges with them on the record. Canary run 7 (#482) put such a finding in a
    `structural` group with no paths and the plan was rejected.

## Amendment 2026-09-09 (b) — Revision: four judgment stages, incremental resume, upstream contract

Recorded for T-10 of #479 (delta refinement of the same day). Live canaries 1–10 on #482 / PR #483
(81 agents, 5.24M tokens, 446 min over runs 1–8; run 9 `failed-preflight` on a real gate red; run 10
stopped by the maintainer after contract + probe) showed duplicate discovery on unchanged heads, RED
contracts rebuilt from scratch on every resume, and invalid automatic dispositions. This revision
**replaces** Decision §1, §3, §4, §6, §7 and amendments (a) §3–§7 above; §2 (custody in a script),
§5 (handoffs are the storage authority, no register/projector) and the two unchanged limits — RED
repair budget 1, rebase never repaired — stay in force. The previous text is kept above as history.

### Replaced rules

| Superseded rule | Rule in force | Owner |
| --- | --- | --- |
| Resume starts a `fresh` full review; findings are unioned with a new sample | A compatible same-input resume (same repository/PR, unchanged head, unchanged effective AC/policy/consumer inputs) executes only the **first incomplete or invalidated step**. Changed inputs re-validate the prior findings plus the delta and its directly affected boundaries; an unrelated card edit invalidates nothing. | coordinator + `cycle-state.mjs resolve` |
| Planner after review; domain map re-derived on every RED retry | **One preparation stage** owns inventory (AC/finding → producer/grammar → inputs/representations → consumers → equivalence classes/interactions → executable evidence), grouping by owner/dependency and the executable contract, in `initial` (fresh story, before any production edit) and `remediation` (from findings) modes. Every repair sees the verifier's prior rejection. | `red-spec` |
| Every row must be RED against current production | Defect **witnesses** must discriminate (fail for the intended defect); positive / already-correct **controls** may pass and are recorded with `baseline: pass`; a `test`-mode row proves sensitivity on an isolated injected regression. Prose-regex presence alone proves nothing. | `red-spec`, `red-verify`, `red-snapshot.mjs` |
| P3 defect terminal; next invocation rebuilds RED | An approved test failing on production returns to **implementation on the same sealed contract**; a genuine contract gap revises **only the affected obligations** (stable row IDs kept, changed rows re-approved and sealed as a successor snapshot); a custody breach stops the attempt and preserves the trusted snapshot. Budgets exhausted are an unresolved failure. | coordinator, `green-fix`, `red-verify`, `review-phase` |
| Unsealed leftovers discarded wholesale by path shape | Attempt-owned artifacts (listed in the attempt's own handoff/contract) are reconciled; **unknown edits are preserved and reported** (`status: dirty`), never destroyed to recover. | `red-spec`, `cycle-state.mjs` |
| An out-of-repository finding is `carried` and accepted | Location and disposition are explicit (`external`); correction needs read-back evidence or an explicit human decision passed as input; an unresolved external blocker keeps the PR **not ready** (`escalate`). | `review-phase`, coordinator |
| Separate planner / probe / seal / P3 / re-review / publication dispatches; fixed 11 skills / 13 agents | **Four logical judgment stages**: preparation → independent contract validation (+ deterministic seal in the same execution) → implementation → independent final verification (custody + evidence + review + tier passes + idempotent publication). Probe, seal, hash, state and comment publication run as **scripts inside those stages**; no dedicated LLM dispatch. The tier's required reviewer count is honoured by dispatching that many independent final verifiers (`pipeline.reviewers`, KB default 1) and its cost is reported. | coordinator |
| A fresh invocation discards previous runtime assumptions | Every handoff pins `workflowVersion`, `schemaVersion`, repository/PR identity, exact 40-hex heads and the effective-inputs digest; an incompatible version or a moved history is `incompatible` / `failed-resume` and requires explicit revalidation — never silent reuse or overwrite of prior approval. | `cycle-state.mjs`, coordinator |

### Stage owners and retired dispatches

| Stage | Skill (installed as `pair-workflow-*`) | Agent | Folded in |
| --- | --- | --- | --- |
| 0 template contract (per batch, cache-by-hash) | `contract-phase` | `pair-contract-generator` | — |
| 1 preparation | `red-spec` | `pair-fix-test-author` | `remediation-plan` (grouping), domain map |
| 2 independent validation + seal | `red-verify` | `pair-red-contract-verifier` | `red-seal` (script `red-snapshot.mjs seal`) |
| 3 implementation | `implement-phase` (initial GREEN + PR publish) · `green-fix` (remediation GREEN) | `pair-implementer` | `pr-phase`; escalation flush as a script |
| 4 final verification | `review-phase` | `pair-reviewer` | `p3-verify` (script `red-snapshot.mjs verify`), re-review, `cycle-comments` probe / synthesize (script `pr-comment.mjs upsert`) |

Retired and **rejected at parse time** with a migration message: `pipeline.skills.remediationPlan | redSeal | p3Verify | cycleComments | prPhase`, `models.planner | seal | preflight | pr`. No compatibility shim dispatches anything. Consumers inventoried on 2026-09-09: `pair-loop.js` passes cards only; the `#451` pair-cli execution adapter on `main` reads no engine key; `#441` (Codex orchestration) is an unmerged worktree and validates against this contract when it lands.

### Contract modes and typed reasons

- **Template contract** (`contract-phase`, `*.contract.json`) fixes the review vocabulary. **Acceptance contract** (`<phase>-red-contract.json`, sealed) fixes the executable obligations. A template-contract cache hit never skips acceptance validation.
- Statuses a caller may see: `ready-for-merge` | `escalate` | `failed-preparation` | `failed-contract` | `failed-seal` | `failed-implement` | `failed-fix` | `failed-verify` | `failed-custody` | `failed-resume` | `incompatible`. Only `ready-for-merge` advances, and only with a 40-hex `reviewedHead` equal to the remote head at publication.
- Finding IDs are assigned once by the emitting verifier (`r<round>[-<reviewer>]-<n>`), persist across rounds and runs with an explicit transition (`open | resolved | superseded | human`); a severity change needs `severityEvidence` (a new failure case or changed impact). A newly evidenced defect on old code blocks under the unchanged policy, is marked `missedUpstream` and gets a regression row.

- **Scope inheritance (3.0.8, canary run 11)**: a `repair` or `revision` (`<phase>-rev<m>`) inherits the `fixScope` of the contract it revises — same `mode`, every `allowedPaths` entry — and may only add paths. The sealer reads the predecessor snapshot's manifest from Git and refuses `fixScope-narrowed` (`predecessor-snapshot-missing` when no predecessor exists); `verify-chain` reports a forged narrowing successor as `successor-narrows-scope`. Reason: a0-rev2 shrank a0 to one production file, so the implementer had no home for its decision log or convention page and reported both as gaps.
- **Envelope carries the PR (3.0.8)**: `cycle-state.mjs publish --pr <n>` stamps the bound PR into every handoff once it exists; a PR contradicting the draft or an earlier handoff of the run is `pr-mismatch`. A resumed coordinator reads the PR from the envelope, not only from `next.pr`.

- **T-9 closure (3.0.9)**: the chain custody check lists every seal between the cycle base and HEAD under EVERY identity (`pr=0` initial chain, `pr=<n>` groups) — one `verify-chain` per cycle, a later seal ends the previous segment (t9-1); the tier's `reviewers` count is honoured by the transition authority (reviewer `k+1` of the same phase until the count of non-partial reviews of one head is met; a partial review never completes a cycle) (t9-2); readiness is proven only by a 40-hex `remoteHead` equal to the reviewed head, in the coordinator and in the cycle state (t9-3); approved-test-failing findings across several groups return to GREEN group by group on their own seals (t9-4); a `next` for validate/implement/green without a usable contract is a typed `failed-resume` (t9-5); the fix-round budget is not part of the effective-inputs digest — a human extending it after `escalate` resumes at the revision (3.0.9). Canary run 12 added two more: a repair/revision RESULT is a delta — its rows may cover base obligations the delta inventory does not repeat (the coordinator refused one and burned a retry); and `behavioral` forbids creating code MODULES only — a new decision-log entry inside an allowed path is legal (the implementer had to revert its ADL). Known cost: the digest formula change invalidates pre-3.0.9 review evidence once (one migration re-review).
- **T-9 re-review (3.0.10)**: the review handoff's `attempt` is the cycle state's (`$attempt` in the dispatch, `--attempt` on publish), never the reviewer index — the second review of a phase after a GREEN retry, and reviewer 2 of a re-reviewed phase, land on their own filenames (t9b-1); the behavioral module guard exempts ONLY documentation and decision evidence (`.md/.mdx/.txt`, `.pair/adoption/`, `.pair/knowledge/`, `docs/`) — a new CI workflow, Terraform, migration, Dockerfile or JSON config stays a breach (t9b-2); the custody chain lists first-parent history only, so a foreign PR's seal merged into the branch is never a segment boundary (t9b-3); the delta rule of a preparation result follows the dispatched mode (t9b-4).
- **Finding history across cycles (3.0.11, canary v4)**: ids are stable across rounds AND cycles, so the first review of a PR-entry cycle may carry the PR's earlier findings as resolved/superseded history — non-blocking, with read-back evidence — without the coordinator refusing them as invented closures. Known gap: a stage publishes its handoff before the coordinator judges the result, so a coordinator refusal (`failed-*`) is not written back into the durable state and a resume continues from the handoff.
- **Card hash stamped by the script (3.0.12, canary v4 run 15)**: `publish` computes the canonical card hash itself (`gh issue view`) and replaces whatever the agent spelled, marking `acHashSource: publish`; `resolve` compares only script-stamped hashes. Two agents hashing the card two ways had ping-ponged prepare ↔ verify until the three-redirect guard stopped the run.
- **External refusals are retryable (3.0.13, canary v4 run 17)**: a preparation refused `dirty` or `stale` names a cause outside the cycle (worktree, head); once a human clears it the same phase is dispatched again as the next attempt, and a second identical refusal is terminal. `unprovable` and `split-required` stay terminal at once.

### Baseline frozen before optimizing

| Item | Value |
| --- | --- |
| Baseline coordinator | `pair-implement-batch.js` `WORKFLOW_VERSION 2.0.0` at `8b8b2607` |
| Baseline model policy | implementer/reviewer/RED/verifier opus; PR sonnet; seal sonnet; contract haiku; floor default `Minor` (canary runs 7–10 used `Major`) |
| Canary identities | story #482, PR #483, worktree `../pair-worktrees/482` at `c2e55274` (GREEN of run 9), `runId canary-479-run5`; #321 / PR #481 = refusal history only |
| Measured cost, runs 1–8 | 81 agents, 5.24M subagent tokens, 446 min — diagnostic context, not a like-for-like baseline |
| Requirement map | AC-01..16 → TC-01..17 as tabled on #479; every replaced rule above is a TC-05/06/09/10/11/12/13/14 case |

## Amendment 2026-09-10 — US-479 T-19: workflow 4.0.0, schema 3, human-only scope decisions

Recorded for T-19 of #479 (delta specification D4). Pins the version/taxonomy groundwork the rest
of the T-19–28 delta builds on; it does not itself implement the behaviour those fields enable.

1. **Versions.** Coordinator `WORKFLOW_VERSION` is `4.0.0`; the handoff envelope is `schemaVersion 3`
   (`cycle-state.mjs`, all five installed copies plus dataset sources); the metrics view T-24 adds
   is pinned at `METRICS_SCHEMA_VERSION 1` in the same module so no later caller re-spells it. A
   different major on either axis stays `incompatible`, exactly as `3.x` already was for `2.x`.
2. **New public statuses.** `awaiting-scope-decision`, `failed-publication`, `interrupted` and
   `abandoned` join the documented status list in `pair-implement-batch.js`; all four are non-ready.
   No caller change was needed for AC-11 — `pair-loop.js` already halts on anything that is not
   `ready-for-merge` — this amendment only names and pins the four for later stages to emit.
3. **Schema-3 taxonomy.** `cycle-state.mjs` now exports and validates, before the atomic handoff
   write: `FINDING_TRANSITIONS` (`open|resolved|superseded|human`), `RECORD_TYPES`
   (`decision|migration|judgment`), `SCOPE_CHANGE_TYPES` (`new-requirement|scope-extension`),
   `SCOPE_CHANGE_STATUSES` (`pending|ignored|extended|deferred`), and the new optional envelope
   fields `scopeEpoch`, `scopeBaselineHash`, `firstReviewHead`, `remediationBatchId`. A scope
   proposal can never carry `severity` or `nonActionable` — those stay findings-only. Unknown or
   ambiguous values in any of these are refused at `publish` time, never accepted and reconciled
   later.
4. **`migrate-inspect` is read-only.** `cycle-state.mjs migrate-inspect --dir <dir>` reports
   `{compatibleEvidenceRefs, missingDimensions, ambiguity, next}` from existing schema-2 (or
   current) evidence without rewriting a byte of it; a migration acknowledgment is a NEW handoff a
   later stage records (`recordType: migration`), never a silent upgrade of the old file.
5. **Default severity floor stays `Minor`.** Already the coordinator default
   (`DEFAULT_SEVERITY_FLOOR`); this amendment confirms it is not lowered by this delta.
6. **Scope proposals are a human decision, never an automatic extension.** Superseded in part: see
   the new decision log entry
   [2026-09-10-scope-proposals-are-a-human-decision.md](../../decision-log/2026-09-10-scope-proposals-are-a-human-decision.md).
   The 2026-08-12 rule (implementation/review never files a card for a **defect**; it fixes it or
   extends the story) is unchanged. What changes is demonstrably **new scope** (S2:
   `new-requirement` / `scope-extension`, never a defect): it is queued, never auto-absorbed or
   auto-carded, until the maintainer's explicit `ignore` / `extend-current-card` / `new-card`
   decision (S5).
7. **Metrics-view exception to the agent-budget rule.** Decision §8 ("agent budget is an acceptance
   criterion") is unaffected: `cycle-metrics.mjs` (T-24) and `cycle-runtime.mjs` (T-25) are
   deterministic scripts a phase imports and runs, like `red-snapshot.mjs` and `pr-comment.mjs`
   already are — not a new agent dispatch. Adding them does not raise the twelve-dispatch baseline.

### Baseline moved

| Item | Value |
| --- | --- |
| Coordinator | `pair-implement-batch.js` `WORKFLOW_VERSION 4.0.0` |
| Handoff schema | `cycle-state.mjs` `SCHEMA_VERSION 3` |
| Metrics view | `cycle-metrics.mjs` `METRICS_SCHEMA_VERSION 1` (module lands in T-24) |
| Prior baseline | `3.0.13` at `ab6d78de` (frozen table above), superseded by this amendment |

## Amendment 2026-09-10 (b) — US-479 T-20..T-27 closed under `4.0.0`

T-19's schema/taxonomy groundwork (above) is now load-bearing. Recorded per task, each its own
commit on `feature/US-479-delivery-workflow-to-be` / PR #480:

- **T-20** — `cycle-verify` gaps now carry `mechanismId`/`closureAssertions`/`reproducer`/
  `applicability`; a verifier's own declared `mechanismsIdentified` set must be closed in ONE
  answer (`publish` refuses an incomplete one); a repair must name every prior gap's row under
  `changedRows` or `publish` refuses it before the write (`repair-incomplete:<id>`).
- **T-21** — `cycleCounters` (attemptedCycles/completedCycles/reviewExecutions/reviewBatches/
  contractRevisions/preparationRepairs/implementationRetries) is a pure derived view; the
  `maxFixRounds` escalation check now bounds COMPLETED cycles, never the raw round counter — a
  metadata-only re-review no longer spends a real remediation's budget.
- **T-22** — scope proposals (`scopeChanges[]`) converge separately from defects:
  `awaiting-scope-decision` when quality is converged but a proposal is pending;
  `apply-scope-decisions` applies an authenticated maintainer decision mechanically (see the
  batch-engine reference doc for the worked example). See also the 2026-09-10 decision log entry.
- **T-23** — `args.entryCapsules` lets a proven-`done` story skip every dispatch, including the
  batch-wide contract-phase call, once its identity is re-verified; never trusted blindly.
- **T-24/25/26** — `cycle-metrics.mjs` (reducer, cohort aggregator) and `cycle-runtime.mjs` (host
  journal/usage observer, zero sandbox API) are new, portable, dependency-light scripts — no new
  agent. The final synthesis comment is RUNTIME's to publish, read back and confirm; a review-phase
  handoff no longer upserts it itself.
- **T-27** — one composed lifecycle (initial build → defect + scope proposal → remediation →
  awaiting-scope-decision → authenticated extension → targeted remediation → done → confirmed
  summary) replayed through the real script entrypoints, `pair-contracts/engine-integration.test.mjs`.
  Full regression suite green at `76fa55aa`. The paid live canary (T-8) was NOT run.

**Host launch recipe** (the coordinator's shell executor, never the Workflow sandbox, never a
phase skill itself):

```bash
node <skill>/scripts/cycle-runtime.mjs entry --dir "$RUN_DIR" --repo "$REPO" --story "$STORY" --pr "$PR"
# … dispatch the phase skills as already documented …
node <skill>/scripts/cycle-runtime.mjs observe --dir "$RUN_DIR" --repository "$REPO" --story "$STORY" \
  --branch "$BRANCH" --pr "$PR" --journal "$JOURNAL_PATH" --usage "$USAGE_PATH" &
# … after the cycle reaches a terminal status …
node <skill>/scripts/cycle-runtime.mjs finalize --dir "$RUN_DIR" --repo "$REPO" --story "$STORY" \
  --branch "$BRANCH" --pr "$PR"
```

**Migration finding for #483 (read-only; no code or seal touched)**: `migrate-inspect` against the
latest archived run directory
(`.pair/working/runs/canary-479-v4/482/`) reports
`{"compatibleEvidenceRefs":[],"missingDimensions":["scopeEpoch","scopeBaselineHash","findings-origin"],"ambiguity":[],"next":"migration-acknowledgment-required"}`
— its handoffs are `schemaVersion: 2` / `workflowVersion: 3.0.10`, genuinely pre-`4.0.0`. A resumed
cycle there needs an explicit migration acknowledgment (`recordType: migration`) before continuing
under this engine; nothing was rewritten to produce this finding.

## Amendment 2026-09-10 (c) — targeted remediation of six T-19..T-27 findings

Six independent-review findings against the `4.0.0` metrics/entry-capsule/scope-decision surface,
fixed test-first, no scope change:

1. **Entry capsule was trusted as approval.** `entryCapsules`' zero-dispatch shortcut (T-23) let a
   self-consistent but entirely fabricated capsule (nonexistent run, stale head, unapproved
   verdict) reach `ready-for-merge` with no real check — the sandbox has no filesystem to validate
   one itself. Removed: WF no longer short-circuits on a capsule; readiness comes ONLY from the
   real dispatched phase's own `cycle-state.mjs resolve` redirect, exactly as before T-23. The
   contract-phase batch skip tied to the same shortcut is removed with it.
2. **Observer/reducer timestamp mismatch.** `cycle-runtime.mjs` emits `observedAt` as an epoch-ms
   integer (S7); `cycle-metrics.mjs` fed it to `Date.parse` (string-only), producing `NaN` and then
   `RangeError: Invalid time value`. Fixed with one shared `toEpochMs` accepting a number or a
   validated ISO string; an invalid value is `null` (explicit partial evidence), never a crash or
   a fabricated duration. `time.incomplete`/`flaggedCount` now propagate into the view.
3. **Token accounting was not idempotent and coverage undercounted.** `reduceUsage`'s denominator
   now comes from every OBSERVED execution (any kind), not only ones reporting usage — a started-
   but-unmeasured execution is explicitly `missingExecutionIds`, never invisible.
   `mergeObservations` dedupes delta samples by `(executionId, eventId)`, so an identical replay
   sums once; the ADAPTER (`usageRecordToObservation`) now preserves a raw sample's OWN `eventId`
   instead of always synthesizing a fixed one, which had made every later genuinely-new delta
   collapse onto the first. Parent/child: an `accountingBasis: 'inclusive-subtree'` execution's
   descendants are excluded from both the sum and the denominator.
4. **Placeholder metrics presented as measured.** `execution.dispatches`/`startedWithoutResult` are
   now derived from observed `step-started`/`step-finished` events (never the handoff count);
   `redirects`/`engineRecoveries`/`administrativeDispatches`/`nestedDispatches` accept an optional
   `dispatchStats` argument (the host launch recipe's own WF-return counters) and stay explicit
   `null` — never a fabricated `0` — when not supplied; `usage.byRole` aggregates real observations
   that carry a `role`; `usage.sharedOverhead` now calls the previously-orphaned
   `allocateSharedCost` from the real reducer path via an optional `sharedCost` argument;
   `snapshot.completeness` is `'complete'` only when every observed execution has matching usage
   AND timing has no incomplete flags — an observation existing is no longer, by itself, proof of
   a fully reconciled cycle (`finalizeMetrics` no longer overrides this with a cruder check).
5. **Entry host output was unparseable by the workflow.** `buildEntryCapsule` returned
   `schemaVersion: null, run: null`, no `next`, and a `note` key WF's strict parser rejects. It now
   derives a genuinely-grounded capsule from a real `cycle-state.mjs resolve()` call (real
   authority at capture time) in the exact shape the parser accepts, or returns `capsule: null`
   when nothing is yet resolvable — never a malformed placeholder. Compatibility with finding 1:
   this fixes the PRODUCER/CONSUMER shape mismatch; it does not restore any authority to the
   capsule itself.
6. **Scope decisions marked applied without their real effects.** `extend-current-card` now
   actually updates the story card (idempotent: skips the edit if already applied, per a stable
   marker) and reads back the confirmed body before recording `status: extended`; `new-card`
   verifies an existing `targetIssueUrl` via a real `gh issue view`, or — only when explicitly
   authorized with an approved title — creates the card and records the read-back URL; neither
   marks success without a confirmed effect. Tested against a fake `gh` boundary only; no real card
   was touched or created by this remediation.

Every other reported quantity's known/partial coverage was already exact, derived from the durable
handoffs alone.

## Amendment 2026-09-10 (d) — four residual gaps in findings 3/4/6, closed against HEAD `99431a3c`

An independent verification of `99431a3c` found four residual cases where amendment (c)'s fixes were
real but incomplete — not new requirements, the same three findings' original AC:

1. **Finding 3 residual — dedup lost across checkpoint/resume.** `mergeObservations` deduped delta
   usage events correctly WITHIN one call, but its `(executionId, eventId)` ledger lived only in that
   call's local `Map` — a checkpoint round trip (persist merged observations, reload, replay an
   upstream-resent delta) had no record of which events already contributed, so a replayed delta
   summed a second time (100+200 → checkpoint → replay of the first → 400, not 300). Fixed:
   `mergeObservations(raw, priorLedger)` now takes and returns the ledger explicitly;
   `cycle-runtime.mjs`'s checkpoint persists `appliedDeltaEventIds` and reseeds it on every tick —
   the SAME existing checkpoint file, no second execution authority.
2. **Finding 4 residual — false completeness, and admin counters never reaching the real path.** An
   execution started with usage but no result (or a result with no observed start) was invisible to
   `reduceTime`'s interval list entirely, so `time.incomplete` stayed `false` and `completeness`
   claimed `'complete'` with a genuinely unresolved execution. Fixed: every execution seen on either
   side now gets one interval, with the missing side left `null`, so `reduceTime`'s own known/flagged
   split reports it honestly. Separately, `dispatchStats`/`sharedCost` were accepted by
   `reduceCycleMetrics` but never forwarded by `runtimeTick`, `finalizeMetrics`, or the CLI — the only
   tests exercising them called the reducer directly, proving nothing about the host wiring. Fixed:
   both flow through `runtimeTick` → the checkpoint (so a later tick/finalize that omits them keeps
   the last host-supplied values) → the CLI's `--dispatchStats`/`--sharedCost` JSON flags.
3. **Finding 6 residual — non-semantic AC readback.** `extendCard` matched an approved AC by
   INDEPENDENT substring `includes()` of id and description — a description already sitting under a
   DIFFERENT id satisfied the check, so a real requested change (e.g. AC-1's description replaced by
   text AC-2 already carried) produced zero edit and a false success, or duplicated AC-1 under a
   second definition when the text was novel. Fixed: AC lines are now parsed by exact id (never a
   substring — `AC-1` is never conflated with `AC-10`), a targeted id is replaced in place (its old
   definition removed, never left dangling), a genuinely new id is appended, and an id the card
   carries more than once is refused outright — never guessed, never marked extended.
4. **Finding 6 residual — new-card creation not idempotent after a successful remote effect.**
   `createTargetIssue` created the destination issue BEFORE the decision's own handoff was durably
   recorded, with no way to recognize its own prior effect on retry — a lost response, a failed
   confirming readback, or the enclosing `publish()` failing (a held lock) after a real creation could
   all lead a retry to create a second issue. Fixed: a durable per-(decisionRef, scope id) ledger is
   written BEFORE the remote call; a retry that finds `created` reuses that URL (re-verified, never
   blindly trusted); a retry that finds an unresolved `creating` attempt reconciles by searching for a
   HIDDEN marker this decision's own attempt would have embedded in the issue body — never by title,
   so a foreign issue that merely shares the approved title is never adopted; a local create failure
   immediately attempts the same reconciliation before reporting anything, since a local failure never
   proves the remote call didn't land. No new orchestrator: the ledger is a plain atomic temp+rename
   JSON file in the same run directory, exactly like the existing checkpoint/handoff files.

Tested against a fake `gh` boundary only; no real card was touched or created by this remediation.

## Amendment 2026-09-10 (e) — Finding 6 completed: real AC formats, and content over title alone

An independent verification of `ce0cf067` found amendment (d)'s Finding 6 fixes real but still
incomplete against the ACTUAL adopted card formats and against content (not just title) matching —
not new requirements, the same finding's original AC.

**Caso A — the AC parser only recognized a format no real card uses.** The prior parser matched
`**AC-01**: text` (a colon), never card #479's real `- [ ] **AC-01 — Title.** Description.` or the
delivery template's (and card #482's) numbered `N. **Given** … / **When** … / **Then** …` blocks.
Fed card #479's real body, a requested AC-01 replacement matched nothing, was misclassified
"genuinely new", and got appended as a second, contradictory definition. Fixed: two ADOPTED dialects are recognized
explicitly — the checkbox convention (id matched to its full token, `AC-1` never conflated with
`AC-10`; a targeted id is replaced in place; a duplicated id is refused, never guessed) and the
Given/When/Then convention (identified by its own ordinal; a replacement must itself be in
Given/When/Then shape — "modifica … secondo il contratto adottato" — or it is refused as a shape
mismatch). A card matching neither dialect, or a GWT-dialect card where the id has no matching
block, refuses instead of appending: a parser miss is never treated as proof an AC is new. No
universal Markdown parser was built; unsupported structures are a safe refusal, not a guess.

**Caso B — new-card idempotence checked the wrong thing.** The prior ledger/reconciliation fix
(amendment d) verified only the destination's TITLE and hidden marker — a created (or reconciled)
issue with the right title but missing, wrong, or duplicated AC content still returned success. The
report explicitly named this gap: "confermare titolo e AC approvati, non soltanto il titolo." Fixed:
one shared `verifyCreatedIssueContent` — identity (url/number), marker, title, AND every approved AC
id→description association (via the SAME exact-id parser Caso A fixed) — is now the SOLE
verification path for a fresh create+readback, a `created`-ledger reuse, a `creating`-ledger
reconciliation, and an immediate post-failure reconciliation alike. Missing/wrong/ambiguous content
is an explicit error with the proposal left unapplied; the ledger is untouched by a failed
verification, so a later retry reconciles onto the SAME issue rather than creating a second one —
never an automatic edit of a divergent card to paper over a failed readback.

Tested against a fake `gh` boundary only, with fixtures taken verbatim from #479's real body and the
delivery template's Given/When/Then format; no real card was touched or created by this remediation.

## Consequences

### Benefits

- Delivery behaviour is a skill version: testable from a fixture, reviewable as prose, distributable in the dataset like every other skill.
- Git integrity is proven by code, not by an opus agent reading `git show` output.
- ~700 lines leave the workflow file across c1–c2; the statuses a caller may see are enumerated and a caller must halt on anything that is not `ready-for-merge`.

### Trade-offs

- `models.redMapper` no longer exists (`models.planner` replaces it); `historyDecision` and `custodyReset` are unknown card keys.
- The defect history that used to live as comments in the workflow file is recorded once, in the appendix below; the file describes behaviour only.

## References

- Story #479, PR #480 — one branch, one squash-merge together with the 2026-09-08 hardening (`7b559003`).
- `.pair/working/reports/delivery-workflow-as-is.md`, `delivery-workflow-to-be.md` (2026-09-08).
- ADR-017 (automation loop), ADR-021 (fan-out realizations).

## Appendix — defects the coordinator's contract closes

Recorded here so the workflow file can describe behaviour instead of narrating its history. Each
line names the failure the corresponding rule prevents; the rule itself lives in the code or the
skill it belongs to.

| Rule | Failure it closed |
| --- | --- |
| Loud input validation (`args` must be a card list; unknown keys throw) | A bare list of refs coerced to an empty batch, ran zero agents and reported success; a misspelled key (`prNumbr`) opened a second PR for a story that had one. |
| Present-but-empty is an error; `undefined`/`null` are the only spellings of absent | `base: cfg.base ?? ''` dropped the stacked-story clause; `prNumber: undefined` aborted a 20-card batch. |
| Card and pipeline values validated by CONTENT with one predicate set | `branch: 'main; gh pr merge 432 --admin'` rendered a merge command into an implement prompt; `id: '../..'` aimed a `--force` worktree remove outside the root. |
| `prNumber` must be a positive integer | `0` switched the card to resume mode, skipped implement and the probe, and reported an unbuilt story as review-approved. |
| A review needs a verdict and a `reviewedHead` | Every reviewer died mid-response; `findings ?? []` read as "nothing actionable" and the batch returned `ready-for-merge`. |
| Severity floor ranks by the contract's explicit `severityRanks`, never array order; prototype-free rank maps | An ascending vocabulary ranked a `Blocker` below a `High` floor; `{severity: 'constructor'}` fell out of both partitions. |
| Accepted findings accumulate across rounds | Round-0 by-design and sub-floor findings vanished from the merge-gate table after a clean round 1. |
| Continuation probe keyed on the PR's existence and an exact marker, fail-open | Three pause/resume cycles posted three first reviews on one PR; a semantic reading of comment structure could silence a real one. |
| The note counts ADVANCED cards, not returned rows | A batch whose every card failed reported "PRs are ready-for-merge or escalated". |
| Only `ready-for-merge` advances in `pair-loop` | `seal-invalidated` and `stale-history-decision` cards were re-driven every iteration. |
| Rebase never repaired; custody by script | The custody/history-decision layer had become a second engine that repaired in place what the design can refuse. |
| One frozen plan per round, indices into the received set | A finding could be left out of remediation without anyone noticing. |
