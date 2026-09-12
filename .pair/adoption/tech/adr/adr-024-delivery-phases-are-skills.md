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
  **Corrected 2026-09-11 (amendment g):** this lifecycle did NOT cover DT-04's contradiction
  recovery, nor DT-19/22/30 on real usage sources — the T-8 preflight found both. Read the T-27
  claim as "the composed lifecycle above", never as "DT-01–34".

**Correction 2026-09-11 (amendment g):** T-21's line above cited DT-04..08; DT-04's first clause
("conflicting sealed rows route revision in same cycle") was neither implemented nor tested until
amendment (g). The host launch recipe below named `--usage "$USAGE_PATH"` as though a source
existed; it did not until amendment (g) added the producer. And `usage.byRole` / the admin counters
were recorded as host limitations — they are not: `byRole` comes from the transcripts' own
`meta.agentType` and the admin counters from the engine's returned result. The one real remaining
limit is parent/child attribution deeper than one spawn level.

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

## Amendment 2026-09-10 (f) — Finding 6 Caso A completed: cumulative AC dialects, and a fail-closed unrecognized card

An independent verification of `09df6963` found amendment (e)'s Caso A fix had **replaced** the AC
line matcher rather than extended it, and had described a refusal the code did not implement.

**The previously supported dialect was dropped.** Amendment (e) characterized `AC-1: text` /
`- **AC-1**: text` as "a format no real card uses". It is in fact what a human writes on a card, what
this script itself emitted before `4.0.0`, and the shape the verification report's own Finding 6
reproduction is written in. Replacing the matcher with a checkbox-only one meant a requested
replacement on such a card matched nothing, was misclassified "genuinely new", and was appended as a
second definition beside the untouched old one — the very failure amendment (e) closed for the
checkbox dialect, reopened for the colon one. Six tests that had covered the colon fixtures were
rewritten onto checkbox fixtures in the same change, so nothing went red. Fixed: `parseAcCard` now
recognizes the adopted dialects **cumulatively** — colon, #479's checkbox (with and without a title)
and the template's Given/When/Then — merging the AC-id dialects into one map, so a duplicated id is
ambiguous whether it repeats inside one format or straddles two. Each entry keeps its exact prefix,
so a rewrite preserves the bullet, the checkbox state and the human title and changes only the
description. The colon fixtures were restored verbatim beside the checkbox and GWT ones.

**A card in no recognized dialect now really is refused.** Amendment (e) stated that "a card matching
neither dialect … refuses instead of appending". The code did not do that: `dialect: 'unknown'`
still reached the append branch. An interim fix made the refusal depend on the requested id
appearing somewhere in the body — a textual coincidence. On the developer's explicit decision
(ADL [2026-09-10-unknown-ac-card-format-fails-closed.md](../../decision-log/2026-09-10-unknown-ac-card-format-fails-closed.md))
the rule is now **fail-closed and unconditional**: `dialect: 'unknown'` returns the typed
`unsupported-card-format` before any write — no `gh issue edit`, no `extended`, no `scopeEpoch`
increment — whether or not the id appears in the card. The absence of an id token is not evidence
that a card carries no obligations. A card that *does* speak a recognized dialect is unaffected: an
unmatchable id there is still `ac-id-unresolvable:<id>`, and a genuinely new id is still added.
The DT-16 fixture, which had relied on the accepted-unstructured-card case, now seeds a card with an
existing AC in a supported dialect and keeps every assertion it made; the unstructured body it used
is retained as a negative test.

Tested against a fake `gh` boundary only, through `applyScopeDecisions` with a stateful fake and a
persisted body; no real card was touched or created by this remediation.

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

## Amendment 2026-09-11 (g) — US-479 B1/B2/B4: the three gaps the T-8 preflight found

The T-8 preflight (read-only, no paid run) compared the engine at `65ece7dc` against #479's own
S3/S9/S10 and found three deterministic gaps. All three are closed here, before any canary. No
scenario was launched, no seal retired, no finding waived.

### B1 — a contradiction with sealed rows routes a successor revision (S3, AC-08, DT-04)

S3 requires it literally: "predecessor contract hash + conflicting row IDs + authoritative
counterexample produce `revisionReason=contradicts-approved-authority`. `deriveNext` chooses
existing preparation `mode=revision`, same canonical cycle, exact `changedRows`." The engine routed
every such preparation to `blocked('failed-preparation')` instead — the state canary v4 run 18b
ended in, with the correct route spelled out in its own `splitReason`.

- `contradiction` is a typed red-spec ANSWER, separate from `split-required` (still terminal).
- Its evidence is validated before the atomic write: `revisionReason`, `predecessorContractHash`,
  a non-empty `conflictingRowIds`, `changedRows` covering all of them, and an executable
  `counterexample` with no shell syntax. `revisionReason` on any other status is refused, so a
  3.0.x prose `splitReason` can never be promoted into a validated one.
- The target is resolved from the VERIFIED sealed identity behind the hash (a `red-verify` that
  both verified and sealed it), never assumed to be the current group's contract; an unsealed or
  unknown hash is `contradiction-unresolvable`.
- The route is `prepare / mode=revision` on `<succession line>-rev<m+1>`, based on the contradicted
  contract, carrying the exact rows and `contradictionFor` (the phase and finding ids that raised
  it). The predecessor seal is untouched — the successor stands beside it.
- **Budget:** ONE successor revision per obligation per succession line. `publish` stamps
  `contradictionKey` itself from the sealed line plus the deduplicated sorted row ids, so id order,
  the raising group and the successor's hash are irrelevant; `resolve` feeds in the keys already
  spent by every sibling run of the same story/PR, so a new `runId` buys nothing. An equivalent
  contradiction after the first is `escalate` / `budget: contradictionRevisions`. No other budget
  moved.

Also corrected at the boundary this exposed: `envelopeErrors` validated red-spec's documented
`findings: { received, covered }` envelope against the REVIEW findings shape and refused it.

### B2 — legacy evidence is bound, not executed (S10, AC-27, DT-33)

The specification does not ask for an executable schema-2 resume, and `resolve` is right to refuse
one. What was missing is the BINDING: `migrate-inspect` was read-only and correct, but nothing
consumed it, nothing recorded it, and a new run directory therefore presented as a clean PR whose
lifetime totals silently dropped everything already measured — the outcome S10 forbids.

- `cycle-state.mjs migrate-acknowledge` writes ONE `recordType: migration` record binding the new
  run to the legacy run(s) it continues, transitively (v3 → v4 → v5 keeps v3), with a verified
  sha256 per legacy handoff, `migrate-inspect`'s finding and the path of any metrics the
  predecessor persisted. It reads the legacy directory and writes nothing into it; it is
  idempotent (`already-acknowledged`) and refuses `predecessor-evidence-changed` when a bound file
  moved.
- The record is evidence, not a judgment: the envelope validator refuses a migration carrying
  `verdict`, `readiness`, `reviewedHead`, `findings` or `custody`; it lives on a record-only phase
  (`m<n>`), `deriveNext` and `cycleCounters` skip it, so it confers no readiness and spends no
  review execution.
- Consumers: `resolve` returns `predecessorRuns` on every resume, and `reduceCycleMetrics` FOLDS
  each bound predecessor's persisted metrics into a `lifetime` section (cycles + usage), naming any
  predecessor without persisted metrics in `lifetime.missingRuns` and pushing `legacy-lifetime`
  into `missingSources` so the snapshot reads partial. Both renderers show it.

### B4 — the usage adapter the recipe assumed (S7, AC-20/21/25)

`observe --usage "$USAGE_PATH"` had no producer: the harness journal carries only
`{started|result, key, agentId}` — no tokens, no timestamps — while the cost lives in the per-agent
transcripts in a shape the reducer does not read. Every T-8 token figure would have been `unknown`.

- `cycle-runtime.mjs usage-extract` joins transcripts to the journal on `agentId`. Deterministic
  file reading: no provider API, no LLM, and no message CONTENT — usage, timing, model, effort and
  role metadata only.
- The provider's accounting, measured on the run-18b transcripts and not assumed: inside one
  `requestId` the input and cache fields REPEAT per `apiBlockIndex` while `output_tokens` GROWS,
  and only the last block carries a non-null `stop_reason`. A request contributes its fixed fields
  once and its final block's output. Blocks that disagree contribute nothing and are reported —
  never an average. A request with no `stop_reason` keeps the cost already charged but does not
  become complete: its execution is named in `usage.incompleteExecutionIds` and the snapshot reads
  partial.
- Records are cumulative per execution, so re-read, rotation and restart rebuild the same totals.
  A transcript with no dispatch identity keeps its cost under an explicit `unattributed` phase with
  no invented parent; a journal execution with no transcript stays in `missingExecutionIds`.
- **Three clocks, never conflated:** the host observes journal records at TICK time (a coarse upper
  bound), the provider timestamps the messages. Intervals COMBINE them so the measured span can
  only widen — earliest known start, latest known end — and an end is claimed only where a terminal
  result was actually observed. Neither clock is preferred for being the flattering one.
- `dispatch-stats` derives the four admin counters from the engine's own returned result;
  `nestedDispatches` stays `null` because that result genuinely does not carry it. `finalize`
  reconciles a late tail itself when given the sources, and a repeat that finds nothing new is
  idempotent (exit 0). Cache categories are rendered beside the aggregate.

**Correction 2026-09-11 (amendment h) to the bullet above:** "cache categories … never added into
it" was wrong about this provider and is retired. For Anthropic, `input_tokens` EXCLUDES cache reads
and cache creation, so a request's billed total is
`input_tokens + cache_read_input_tokens + cache_creation_input_tokens + output_tokens`. The rule that
survives is the real one: an aggregate is never counted together with its own details, and the
adapter states `totalTokens` with its accounting label (`anthropic-exclusive-input`) so a producer
whose input is already inclusive is not summed the same way.

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

The same commands, with the same `--transcripts` methodology, are used for BOTH sides of a paired
measurement. The baseline side runs its own engine from its own checkout in its own session (a
phase skill is dispatched by NAME and resolves against the session's installed skills); the
extractor is a host script and is run from this checkout against that session's transcript
directory, so the baseline engine is never modified to be measured.

### Still open, honestly

- Parent/child attribution deeper than one spawn level: the transcripts carry no parent link, so a
  nested execution's tokens are counted under its own identity and never attributed upward. Not
  fabricated, not inferred.
- T-8 itself is unchanged by this amendment: no scenario was run, and the six paired scenarios
  still require the separate baseline session.

## Amendment 2026-09-11 (h) — the eight findings of the independent audit of `64e5ddd1`

An independent audit of the B1/B4/B2 candidate reproduced eight defects through the real
entrypoints. They are closed here as ONE remediation grouped by cause, before any canary. No
scenario was launched, no seal retired, no finding waived, no budget raised.

**F1 (B1 x B2) — a legacy seal's identity now reaches the resolver.** A contradiction naming a
contract sealed in the predecessor run that an acknowledgment had just bound was
`contradiction-unresolvable`: the reference was listed and never used. `predecessorEvidence` reads
the bound run's handoffs, verifying each file against the sha256 the acknowledgment recorded, and
`resolveSealedContract` searches the current cycle first and those proven identities second. The
legacy directory stays non-executable and byte-identical; the successor continues the HISTORICAL
succession line (`a0-rev3` → `a0-rev4`), carries `predecessorRunId`/`predecessorPhase`, and receives
`revalidate` — the dimensions `migrate-inspect` reports as missing are re-derived by the revision,
never inherited. An unsealed hash, or one whose file moved since, stays unresolvable and says which.

**F2 — a truncated transcript no longer deletes observed cost.** The cumulative was rebuilt from
whatever the source held; the durable state is now a per-request ledger beside `usage.jsonl`.

**F3 — the provider's accounting is normalized.** For Anthropic `input_tokens` excludes cache reads
and cache creation, so the adapter states `totalTokens` with the label
`anthropic-exclusive-input`. Amendment (g)'s "cache … never added into it" is retired; the surviving
rule is that an aggregate is never counted together with its own details.

**F4 — the observer's read instant is no longer active time.** Journal observations carry
`timeSource`; only demonstrated boundaries are measured; the read clock is reported under
`time.observation`, labelled.

**F5 — a migration record is not a judgment in the reducer either.** Migration-only is
`not-evaluated`; a blocking review followed by an acknowledgment stays `not-converged`.

**F6 — the lifetime is a union by verified identity, validated and honestly incomplete.**
Overlapping acknowledgments fold once; imports are validated (schema, story, PR); uncertainty
propagates per dimension; `aggregateCohort` reads the lifetime, so a new run directory cannot
improve a PR's cycles or cost.

**F7/F8 — the recipe is executed, not only written.** A test extracts the bash block of this ADR
and runs every command through the CLI on a fixture, so a missing flag fails the suite instead of
the canary. And the observer's stop is bound to the host's REAL terminal result
(`mark-terminal --result`), never to a flag invented in the journal nor to the inference that all
agents observed so far have returned; the recipe owns the observer's PID, waits only for it, and a
tick after `finalize` cannot overwrite the finalized view.

### Host launch recipe (superseding amendment (g)'s)

Executable as written: `pair-contracts/recipe.test.mjs` extracts this exact block, substitutes the
variables with a fixture and runs every line through the CLI, so a missing flag fails the suite
instead of the canary.

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

`$WF_ID` is the workflow run id the Workflow tool returns — the same id `$TRANSCRIPTS` is derived
from. It is the INVOCATION identity: `mark-terminal` stamps it and `observe` accepts only its own
invocation's terminal result, in the marker and in the checkpoint alike, so a new invocation in the
same run directory is never closed by an earlier one and a marker written before the first tick
still closes its own (US-479 F8-A residual). `--since <ISO>` remains available as a coarser
fallback for a host with no id to give; it now filters the checkpoint's terminal too.

`$SKILL` is the installed `pair-workflow-review-phase` directory. `$TRANSCRIPTS` is the workflow
run's own directory (`~/.claude/projects/<project slug>/<session id>/subagents/workflows/<wf id>/`),
known once the Workflow tool returns its id. `$WF_RESULT` is the file the host wrote the workflow's
returned result to — that file, and nothing in the journal, is what ends the observation:
`mark-terminal` records the host's REAL terminal result, the observer stops after reconciling its
tail (or after the grace period, reporting partial), and the recipe waits for that ONE process by
the pid it owns. The `migrate-acknowledge` line belongs only to a run directory that continues an
older one. After `finalize` no late tick can overwrite the finalized view.

The same commands and the same methodology are used for BOTH sides of a paired measurement: the
baseline runs its own engine from its own checkout in its own session, and the extractor is run from
this checkout against that session's transcript directory, so the baseline engine is never modified
to be measured.

## Amendment 2026-09-11 (i) — the five residuals of F1/F2/F4/F6/F8

An independent verification of `82de9dce` confirmed F3, F5 and F7 closed and found that five of the
eight findings were only partly corrected. Same ids, same causes, no new requirements: what was
missing was the verification of the ALTERNATIVES inside invariants already approved.

- **F1** — a contract's identity is a COHERENT SET of necessary proofs. The lookup returned on the
  first sealed `red-verify`, so a predecessor whose `red-spec` had been excluded by the digest check
  routed `prepare/revision` with no `contract` field at all. `contractProofs` now requires the
  sealed verify AND the descriptor of the same phase AND their agreement on the hash;
  `evidence-incomplete` / `predecessor-evidence-incomplete:<run>/<phase>:<why>` is refused rather
  than routed. The route builds the descriptor from the two proofs it validated, and the coordinator
  refuses a `repair`/`revision` `next` without a complete descriptor as a second, independent guard.
- **F2** — the ledger separates the last ACCEPTED evidence from a later divergent observation. A
  contradicting block used to drop the request entirely (490 → 330), deleting cost already charged.
  The accepted value stands, the conflicting observation is kept as `divergent` (deduplicated, never
  merged), the request is flagged, and `usage.totalBasis: 'lower-bound'` plus
  `usage-inconsistent` carry the doubt to the snapshot, the lifetime and the PR summary.
- **F4** — a message SPAN is not an execution DURATION. One complete message spans zero
  milliseconds and proves nothing about how long the execution took. `agentMs`/`activeWallMs`/
  `elapsedMs` are measured only from real execution boundaries (`timeSource: 'record'`); without
  them the duration is unknown and the timing coverage partial, while the span is reported as
  `time.messageSpan` with its own basis and an explicit lower-bound note. No estimate, and no
  return to the tick clock. **Consequence to state plainly: with transcripts alone this engine
  measures cost, not duration — AC-14 cannot be argued from a span.**
- **F6** — the CURRENT run is a contributor like any other. Its partial coverage was not propagated,
  so a run with two executions and usage for one reported a complete lifetime of 300. Now its
  incompleteness lands in `lifetime.partialRuns`, the totals become `lower-bound`, the cohort
  inherits both, and `costPerCompletedDelivery.lowerBound` says so. A certain ZERO requires proof
  that nothing was dispatched here (no observation and no handoff beyond migration records);
  otherwise zero observations mean UNKNOWN, not zero.
- **F8** — a finalization is idempotent, not a freeze. The revision is now derived from what is
  actually persisted (`max(persisted, checkpoint) + 1`), so a stale writer computes a lower number
  and is refused while a genuine reconciliation computes a higher one; and the post-finalize guard
  compares a `viewFingerprint` instead of the mere existence of a finalization, so a late usage tail
  is reconciled into a higher revision on the SAME comment, an unconfirmed publication is still
  retried, and a repeat with nothing new is a no-op that exits 0.

Verified as interactions, not only as units: migration → revision; transcript → checkpoint →
restart → reducer; lifetime → cohort → summary; recipe → observer → terminal result → finalize.
511 workflows tests. Still no live canary, and #479 is not complete.

## Amendment 2026-09-11 (j) — F6 and F8 residuals: per-dimension coverage, invocation identity, evidence freshness, semantic fingerprint

- **F6** — lifetime coverage is propagated PER DIMENSION. A run can report every token and still
  have an open execution; collapsing usage and timing into one verdict lost the identity of the
  incomplete one and presented the sum of the KNOWN durations as the whole duration.
  `lifetime.usage.coverage` and `lifetime.time.coverage` are each `complete | partial | unknown`,
  with `partialRunsByDimension`, `lowerBoundDimensions` and per-dimension `totalBasis`; the cohort
  carries `lifetimeCoverageByDimension`, and `costPerCompletedDelivery.lowerBound` is qualified by
  the USAGE dimension alone, so a partial duration never disqualifies a complete token cost. A
  certain zero still requires proof that nothing was dispatched.
- **F8-A** — the terminal result belongs to an INVOCATION, and that identity now travels in the
  marker AND in the checkpoint. A timestamp could not express it: the host writes the marker as soon
  as the run returns, so any threshold chosen after startup either races it or accepts the previous
  invocation's. `--since` is kept as a coarser fallback and now filters the checkpoint too.
- **F8-B** — freshness is judged on the EVIDENCE, never on a revision number. `nextRevision` no
  longer folds in the writer's own checkpoint, and `writeMetrics` refuses `stale-evidence` when the
  persisted view already knows more about an execution than the candidate does. Totals are never
  merged: identity, categories and request counts are preserved by refusing, not by averaging.
- **F8-C** — the fingerprint is the PUBLISHED semantic state minus genuinely volatile fields (the
  revision, the reduce timestamp, the host read clock — including the per-observation heartbeat —
  the terminal heartbeat and the publication bookkeeping). Listing the interesting fields meant a
  real change in an unlisted one (a host admin counter, the timing coverage, the lifetime evidence)
  was mistaken for a heartbeat. A true no-op now returns the PERSISTED, confirmed view.

527 workflows tests; full quality gate green. No live canary, and #479 is not complete.

## Amendment 2026-09-11 (k) — US-479 T-29: the regression-risk rewind is a STATE transition, never a Git operation

D5/S11 adds one algorithm to the existing ledger and the existing remediation loop. It introduces no
fifth judgment stage, no new agent, no administrative round and no new budget.

**Terminology, stated once so it cannot be misread.** "Rewind" and "revert" in S11 mean a
WORKFLOW-STATE transition from review back to the introducing batch's remediation preparation. The
branch stays on its current head, every commit and seal stays exactly where it is, and the fix goes
FORWARD. `lastCleanReviewedHead` is only the behavioural baseline a guard is compared against — it is
never checked out, reset to, reverted to or rebased onto. `git revert`, `git reset`, `git rebase`,
force-push, seal deletion and evidence rewriting are NOT part of this algorithm; a maintainer may
authorize a Git revert separately, as its own decision.

**Qualification.** A reviewer may claim `origin: introduced-by-remediation` only with the approved
obligation it violates, an executable reproducer, the `lastCleanReviewedHead` where that reproducer
passes, the `firstFailingHead` where it fails, the `introducedByRemediationBatchId` that produced the
failing head, closure assertions and affected boundary references. `cycle-state.mjs` validates all of
it before the atomic write and additionally checks the claim against the run's own evidence: the
named batch must exist and the failing head must be one that batch actually produced. Anything less
is `origin: unknown` — an ordinary finding — and a new or changed requirement stays a `scopeChanges`
proposal. `riskId` is derived by the script from story/PR + stable finding id + introducing batch, so
replay, restart and a second observation reuse it by construction.

**One ledger, one derived matrix.** The risk lives on the existing finding entry as
`regressionRisk { riskId, introducedByRemediationBatchId, lastCleanReviewedHead, firstFailingHead,
reproducerRef, closureAssertions[], affectedBoundaryRefs[], state, dischargedByReviewId?,
dischargedHead? }`. The ACTIVE matrix is a view over the ledger's latest state per risk; a handoff
carrying its own aggregate is refused (`activeRegressionRisks-not-storable`) because that would be a
second, mutable authority.

**The transition.** When an exact-head review proves the regression, in one atomic publish the
review, the finding and the risk are persisted, the review names `invalidatedBatchId`, and
`deriveNext` routes `prepare / mode=remediation` on THAT batch's own phase as its next attempt,
carrying every original unresolved finding and every active guard into ONE complete corrective
contract. The ordinary path then runs unchanged: preparation → red verification → green fix →
independent delta review. Only an independent review bound to the exact new head may discharge:
it executes the closure assertions, shows the obligation passing, confirms the batch's original
findings closed and re-tests the affected boundaries. A discharged risk leaves the active view and
stays in the append-only history; a reintroduction reopens it on the same stable finding and is not a
new discovery. `quality-converged`, scope escalation and `ready-for-merge` are impossible while any
risk is active, and a scope decision can neither waive nor discharge one.

**Counters.** `invalidatedRemediations`, `regressionRepairs`, `activeRegressionRisks` and
`dischargedRegressionRisks` are derived from the same ledger and reach the step metrics, the
lifetime/cohort views and the one PR summary, with active and historical separated. An invalidated
remediation is an ATTEMPTED batch: its round becomes a completed cycle only once a review closes its
original findings and leaves no active risk it introduced. Every attempt, review execution, retry,
token and interval still counts. `maxFixRounds` is reused as it stands — neither raised nor reset.

**Two pre-existing wiring gaps were closed because the rewind cannot work without them** (both
recorded in T-29's commit): the coordinator never passed `$attempt` to the preparation or the
validation, so any second attempt of a phase collided on the handoff name; and the GREEN step's
`next` hard-coded `attempt: 1`. Both now follow what the phase has already seen. A GREEN that follows
a regression repair is verified as the NEXT review round; an ordinary approved-test retry keeps the
round's own re-review, unchanged.

## Amendment 2026-09-11 (l) — US-479 S12/AC-30: one transition authority, and the negative matrix upstream

The independent review of `cc221a83` found that T-29's positive chain was proved while its ILLEGAL
transitions were not contracted at all. Six consolidated root causes are closed together here. No new
agent, stage or budget; the rewind remains a workflow-state transition and never a Git operation.

1. **Risk transition integrity.** `regressionTransitionErrors` is the single authority every
   regression payload passes through in `publish`, and it reads the PERSISTED ledger and history.
   A discharge requires a prior `active` entry for the same derived `riskId`
   (`regression-risk-transition-invalid:<riskId>:missing-active-predecessor`), a matching regression
   repair whose GREEN actually fixed and whose output head IS the reviewed head
   (`:missing-matching-repair`, `discharge-head-mismatch`), byte-equal immutable evidence
   (`:immutable-field-mismatch:<field>` over reproducer, closure assertions, boundaries, batch, both
   heads and the cited obligations) and the batch's own obligations carried and confirmed closed in
   that very review (`:original-finding-not-closed:<id>`). The risk state, the finding transition and
   the derived blocking flag are ONE validated transition (`:finding-transition-incoherent`), not
   three caller-controlled state machines.
2. **Qualification authority.** An active claim is cross-bound to history: the failing head must be
   an output the named batch actually produced (a `reviewedHead` is what someone looked at, never
   what a remediation built), it must be the head this review read, the baseline must be a head this
   run reviewed with the cited obligation not open there, `originEvidence` must agree with the risk
   and `invalidatedBatchId` must be the same batch. Schema-valid but mutually inconsistent claims are
   refused (`regression-qualification-invalid:<finding>:<why>`).
3. **Guard propagation.** The derived active set now reaches red-spec, the INDEPENDENT red-verify
   (new `$regressionGuards` input), green-fix and the review. The verifier echoes the set it
   validated and the coordinator enforces exact set equality before the seal is trusted —
   `contract-incomplete:<phase>:regression-guards`.
4. **Human-decision precedence.** A mandatory human escalation (a history rewrite) is evaluated
   BEFORE the automatic rewind: an active risk can no longer hide or consume it. A plain scope
   proposal keeps no such precedence and still waits behind every quality risk.
5. **Batch/group lineage.** The repaired group is DERIVED from the group whose GREEN produced the
   failing head, with that group's own owner and allowed paths — never a hard-coded `-g1`. Ambiguous
   provenance is `regression-lineage-ambiguous` rather than a guess, and one canonical parser
   (`phaseParts`) replaces the local round regexes.
6. **Scoped counters.** Completion is evaluated per batch lineage: the review that closes a batch is
   the non-partial one after that batch's last fix which shows every one of the batch's own
   obligations resolved, with no active risk it introduced. A later unrelated dirty review can
   neither reopen nor erase an earlier completed batch; `invalidatedRemediations` counts only batch
   identities the history can resolve (the no-op `|| true` filter is gone); and the derived ledger is
   computed once per resolution and shared by the next step, the counters and the returned matrix.

Upstream, `pair-workflow-red-spec` now owns the S12 matrix for any changed persisted transition,
`pair-workflow-red-verify` rejects an incomplete or inconsistent one before the seal,
`implement-phase`/`green-fix` refuse production work without the complete seal and may not reduce a
sealed row, and `review-phase` samples the sealed matrix instead of being the first control expected
to discover a fundamental illegal transition.

## Amendment 2026-09-11 (m) — the four variants the delta review of `7b539e69` found (V1–V4)

Variants of the same frozen root causes, not new findings.

- **V1 (F-RR-02).** `firstFailingHead` was validated as the head of the CURRENT review on the active
  branch, and was not in that branch's immutable set — so re-observing a still-active risk was only
  possible by rewriting the origin evidence, losing the head where the regression first appeared and
  letting a later discharge certify as "first failing" a head that never was. The current-head rule
  now applies to the FIRST observation only; afterwards `firstFailingHead` is immutable like the
  reproducer, the closure assertions, the boundaries and the baseline.
- **V2 (F-RR-03).** The guard set reached red-spec, red-verify and green-fix but not the REVIEW —
  the one participant that must execute the guards and discharge them. It is now dispatched with
  `$regressionGuards`, declared in `VERIFY_SCHEMA` and in review-phase's inputs, echoed as the set
  actually executed, and checked for exact set equality: `contract-incomplete:<phase>:regression-guards`.
  The old behaviour was fail-safe and cost a whole wasted rewind, which is precisely the cost S12
  moves upstream.
- **V3 (F-RR-05).** The producing-group derivation excluded handoffs carrying a repair marker. A
  repair's own GREEN is exactly the producer when that repair introduced the next regression, so
  provenance is decided by the head it produced, never by a label.
- **V4 (F-RR-06).** `cycleCounters` compared raw `seq` values and treated a missing one as 0, while
  `readHandoffs` treats it as `+Infinity`: on a migrated run without `seq` no review could be "after"
  the last fix and no cycle ever completed. There is now ONE ordering — the publication order
  `readHandoffs` already establishes.

One T-29 fixture was corrected with them: it re-observed a risk by rewriting `firstFailingHead` to
the head under review, the exact behaviour V1 forbids. Its assertions are unchanged.

## Amendment 2026-09-11 (n) — one attachment point for the guard set (R1), and one transition still unenumerated (R2)

- **R1 (F-RR-03).** V2 attached the derived guard set to the verification that follows a GREEN, and
  to that branch only. Every other branch that dispatches a review — the **k-th reviewer of a
  multi-reviewer pass**, the one that has to discharge when `policy.reviewers > 1`, and the
  re-review a **changed effective input** forces — dispatched a reviewer with no guards to execute,
  reintroducing exactly the wasted round S12 exists to remove. The attachment is now a single rule
  applied to `deriveNext`'s result: every `prepare`, `validate`, `green` and `verify` dispatch
  carries the same active matrix, a branch that already computed its own (the rewind) keeps it, and
  `blocked`/`done` are decisions rather than dispatches and are untouched. The per-branch spreads
  V2 added are removed in favour of that one rule.
- **R2 (F-RR-01) — OPEN, a contract decision, not implemented.** The single transition authority
  enumerates `none→active`, `active→active` and `active→discharged`. It does **not** enumerate the
  **reintroduction** `discharged→active`, which review-phase's own contract text explicitly foresees
  ("a reintroduction reopens the risk on the same stable finding"): a later review may reopen a
  discharged `riskId` with a different reproducer, different closure assertions and different
  boundaries, and the latest-wins ledger view replaces the original evidence. Which evidence is
  immutable across a reintroduction — same defect ⇒ same reproducer? a new failing head in a
  distinct field, leaving the original origin intact? — is a contract question for story #479 and is
  deliberately NOT decided here. Until it is answered the transition stays unvalidated; this
  amendment records the gap, it does not close it.

## Amendment 2026-09-11 (o) — the reintroduction transition, decided and closed (US-479 S13/AC-31)

Amendment (n) left `discharged -> active` open as a contract question. It is now decided, and the
answer is narrower than either option that amendment posed — because the evidence, not a preference,
settles it.

`riskId` is derived from story, PR, finding id and introducing batch. A discharged batch produces no
further heads, so a defect observed after its discharge was produced by a LATER batch. Attributing
that observation to the original batch is already refused (`firstFailingHead-not-from-batch`), and
attributing it to the batch that actually produced the failing head yields a different `riskId` —
the ordinary `none -> active` path, already validated. Two consequences follow:

- a defect that reappears because later work reintroduced it is a NEW risk with a new identity, not
  a reopening. This is the common case and needed no new rule;
- `discharged -> active` on an existing id is legitimate in exactly one case: correcting a discharge
  that should not have been granted, where the evidence never changed and only the verdict was
  wrong. A reopening is therefore a RESTORATION of the prior entry, and every field of it is
  immutable — the defect identity (`reproducerRef`, `closureAssertions`, `affectedBoundaryRefs`,
  the cited `obligationIds`) and its observation window (`lastCleanReviewedHead`,
  `firstFailingHead`, and `introducedByRemediationBatchId` through the id itself) alike.

Implementation: the first-observation rule (`failing-head-not-current-review`) now applies only when
there is no prior entry at all, and the immutable-field check applies to a prior entry in ANY state
rather than only an active one, with the cited obligations added to it. The positive control that
keeps the two cases apart is part of the matrix: the same defect on a later batch's head must take
the `none -> active` path and receive its own id.

## Amendment 2026-09-11 (p) — restoring content is not rewriting history (US-479 S13/AC-32)

Until now green-fix read `lastCleanReviewedHead` as "a behavioural baseline, **not a target to check
out**". That wording collapsed two different things, and the stricter half was never required:

1. **rewriting history** — `git revert`, reset, rebase, force-push — which invalidates the sealed
   snapshot's ancestry, breaks custody and voids published reviews. Forbidden, unchanged;
2. **restoring content and rebuilding** — taking the group's own files as they were at the baseline,
   rebuilding the fix, and committing FORWARD. The branch never moves, the snapshot stays an
   ancestor, sealed test bytes stay identical, `verify-chain` stays green. Git cannot tell whether a
   commit's content was reached incrementally or rebuilt, and nothing in the custody model depends
   on it.

Forbidding (2) with (1) forced every failed repair to patch a base the guard had just proven bad, so
each round carried the previous round's mistake forward. From this amendment, a group that has
already failed once to repair its OWN regression is dispatched with a reconstruction directive:
restore the content of exactly that group's `allowedPaths` at `lastCleanReviewedHead`, rebuild
carrying the batch's obligations and every active guard, commit forward.

Three properties make this safe rather than lossy. The corrective contract IS the inventory of what
must work again, so nothing *specified* is lost by starting over — only work no obligation was
verifying. The regression travels as an executable reproducer plus closure assertions, so the defect
cannot re-enter silently: it is a test, not a memory. And the producing group and its scope are
derived from persisted history (S11/F-RR-05), so the restore surface is exact and an ambiguous
provenance refuses before anything is touched.

The cost decides the scope. The guard's own files are the reconstruction surface and the group's
`allowedPaths` the upper bound; a reconstruction that would cost what rebuilding the batch costs is
a replan through the existing preparation path, not a repair; and a path a LATER round has already
built on is refused outright (`reconstruction-overlaps-later-work`) — restoring it would break
consumers this batch's contract does not cover, and that trade is a human's to make.

## Amendment 2026-09-11 (q) — what two delta reviews changed in (l), (n), (o) and (p)

Two independent delta reviews of the S11–S13 work found ten and then ten findings. Three of the
second set were Major and each corrected a rule stated in an earlier amendment, so those statements
are superseded here rather than left standing.

- **Supersedes (l)#4 and (o)'s escalation wording.** "A mandatory human escalation (a history
  rewrite) is evaluated BEFORE the automatic rewind" was implemented as a check on one
  `humanDecisionKind`, so a review that asked for a human WITHOUT naming a kind was overridden by
  the very transition the request existed to hold. The rule is: ANY `needsHumanDecision: true`
  precedes every automatic transition; the kind only says why.
- **Supersedes (p)'s "a LATER round".** The reconstruction guard's subject is not a later ROUND. It
  is everything published after the review that proved `lastCleanReviewedHead` clean — which
  includes sibling groups of the same batch, whose fixes land BEFORE the producing group's own and
  were therefore invisible to a guard keyed on the producer's fix. It also compares path scopes by
  containment, since `allowedPaths` carries directories as well as files.
- **Supersedes (m)/(n)'s budget reading.** The remediation budget does not count COMPLETED cycles.
  A remediation that keeps failing completes nothing, so reading completions made `maxFixRounds`
  unreachable in its own failure mode. It counts CONCLUDED cycles — a fix followed by the review
  that judged it — and that count is phase-independent, because two engine shapes loop inside one
  round: the regression rewind (which repairs at the producing group's own phase) and a contract gap
  (which revises the same group as `<group>-rev<n>`).

One process note worth recording, because it is the reason the second review was needed. The first
round of fixes was written and then tested by the same author, and each test confirmed the shape its
author had in mind rather than attacking the defect class: all three Major findings were "fixed for
the case I imagined". The second round inverted the order — an independent agent derived the
witnesses from what the engine actually produces, before any fix existed — and that is how the
contract-gap revision loop was found at all. For a defect class rather than a single case, the
witness should not be written by whoever writes the fix.

## Amendment 2026-09-11 (r) — AC-32 stops deciding: two modes, and the maintainer picks the round

Supersedes (p) and the AC-32 half of (q). The reconstruction itself was never the problem — the
GUARD beside it was. Establishing *who wrote these paths after which head*, across contract
revisions, directory scopes, sibling groups fixing in order, and migrated ledgers whose baseline
review is not even in this run directory, produced four defects across three independent review
rounds. Every one of them had the same shape: closed for the case its author pictured, open for the
neighbouring case from the same producer. And the failure is not cheap — a wrong guard deletes work
nobody asked it to touch.

So the workflow no longer decides. There are two modes:

- **patch (default).** What always existed: the rewind fixes forward on the current head. AC-32 is
  not in play, and no directive is emitted.
- **rollback.** A maintainer names the round (`rollbackTo`, a phase id, per card). The head of that
  round is resolved from persisted history — the output of its last fix, or the head its review read
  — and the producing group's own `allowedPaths` are restored to that content and rebuilt, carrying
  the batch's obligations and every active guard. The commit still goes FORWARD; no Git history
  operation is part of it. An unresolvable round emits no directive and a typed refusal
  (`rollback-round-unknown:<round>`), never a guessed head.

The choice is ordinarily made after the budget escalates — three concluded corrective cycles — when
the maintainer has the cycle's own evidence in front of them. Nothing in the algorithm vetoes a
rollback: overlapping work no longer blocks it, because the person who named the round owns that
call and is better placed to make it than a heuristic over `allowedPaths`. What the fixer owes in
return is a report of what it had to overwrite.

Four defects left the codebase with the guard, and the ten tests that encoded them went with it.
That is the trade: a capability that decides less, and a human decision where the evidence lives.

## Amendment 2026-09-11 (s) — correcting (q), and what the budget actually counts

The third independent review checked amendment (q) against the code and found three of its
statements unsupported. Correcting them here rather than leaving them to be believed.

- **(q) said the concluded-cycle count is "phase-independent".** True, and beside the point: it was
  SKILL-dependent, keyed on `green-fix` handoffs. The initial contract's revision loop (`a0-rev<n>`)
  dispatches its work to `implement-phase`, so that loop spent nothing and `maxFixRounds` never fired
  on it — the third instance of the same defect class in three rounds. The count is now keyed on
  neither: **a concluded corrective cycle is a newly SEALED contract judged by a non-partial
  review.** A `greenRetries` retry reuses the seal and spends nothing, which also repairs a
  collateral (q) never disclosed: the previous key silently charged such a retry to `maxFixRounds`,
  a budget US-479 keeps separate from `redRepairs` and `greenRetries`. Two groups of one round share
  their review and spend one, as T-21 requires, and the initial contract is not corrective, so only
  its revisions count.
- **(q) said "ANY `needsHumanDecision: true` precedes every automatic transition".** It precedes
  every automatic transition of a COMPLETE review. The check sits after the custody breach check and
  after the multi-reviewer gate, so a PARTIAL review asking for a human dispatches the next reviewer
  of the pass first. That is the correct behaviour — a half-finished review is not yet a request —
  but it is not what the amendment said.
- **Commit `3b817d2b` claimed its cycle-count change "removes entries claiming more completed cycles
  than attempted".** It did not: `completed` was read from a lifetime view while `attempted` and
  `spent` came from the current run, so the incoherence survived and the hunk was a null mutation —
  reverting it broke no test. All three counts now come from one reading per view, and the folded
  lifetime carries the same three.

Two further corrections of the same kind, in the cohort fold: the comparator's last term could never
return 0, so it was not a total order and the fold still fell back to manifest position (the "same
set of views in, same entry out" claim was false when two views tied); and a floor was marked only
for overlapping views, not for a disjoint fold containing a run whose spend was never measured —
half a delivery unmeasured, reported as an exact cost.

## Amendment 2026-09-12 (t) — superseding (r): the rollback takes a head, and it is spent once

The fourth and fifth independent reviews landed on the same paragraph of (r) from opposite sides.
It is superseded here, because it still prescribes a mechanism this codebase deleted for being
dangerous, and (r) is the governing text a future implementer would read as current.

**(r) said the maintainer names the ROUND, and the head is resolved from persisted history.** That
resolution is gone. It matched a non-revision name against all of its own revisions and kept the
last, so `a0` could resolve to `a0-rev2`'s head — the very outcome (r)'s own paragraph above
promises never happens — and half the accepted alphabet could not be resolved at all. `rollbackTo`
is now a 40-hex head the maintainer reads from `git log` and the workflow takes verbatim: no
resolution step, therefore no heuristic and nothing to guess. Validation is existence — this cycle
recorded that sha, or the directive is refused — and the refusal STOPS THE RUN rather than being
computed and dropped. Two layers, and an earlier draft of this amendment confused them: the state
authority still derives `prepare` (a refusal is a field on the dispatch, not a dead end in
`cycle-state.mjs` — which is what its test asserts), and the COORDINATOR then ends the story
`failed-preparation` when it sees that field. The maintainer learns their directive was discarded
because the run stops on it. The typed refusals are `rollback-head-invalid:<value>`,
`rollback-head-unknown:<sha>` and `rollback-scope-unknown:<phase>`;
**`rollback-round-unknown:<round>` no longer exists** anywhere, and neither does the round-name
grammar it reported on. A decision already carried out is NOT a refusal: it travels as
`rollbackNote: rollback-already-honoured:<sha>` and the cycle proceeds (DR5-Q1 — three rounds of this
defect were invisible because an unspent head and a spent one both looked like silence). See ADL 2026-09-12
`rollback-notes-are-derived-from-handoffs.md`.

**(r) is silent on how many times the directive is emitted**, and two reviews in a row showed the
cost of that silence — once in each direction, which is why the rule below is stated in terms of the
decision and not of the work around it.

The fifth review (M-1) found the guard meant to stop a second emission asking `notes.active`, which
is true by construction everywhere it runs, so the identical directive re-fired at every later
rewind and restored the paths over the rebuild the previous rollback had just produced. The first
repair keyed spending on the BATCH — had this batch ever been repaired? — and the sixth review
(DR4-01) showed that is true, in the ordinary flow, long before a maintainer names anything: a
first-ever directive was then discarded in silence, an explicit human instruction lost without a
trace. Over-restoring is recoverable; ignoring a human decision without saying so is not.

**A rollback decision is honoured exactly once, and spending is keyed on the DECISION.** The
corrective preparation that RECEIVES a head echoes it back as `reconstructedFrom` — a sha validated
before the handoff is written, and checked by the coordinator in BOTH directions, as the guard-set
echo at `validate` already was: a preparation handed a directive that reports nothing or a different
head stops the run, and so does one that reports an echo nobody handed it, since the echo is the
sole authority for spending a human's instruction. The directive is spent when the fix DISPATCHED
FROM that preparation — the same phase and the same attempt, which the coordinator dispatches as one
unit — reported `fixed`. Identity, not ordering: the third review of this rule (DR5-01) showed that
"some later fix of the batch succeeded" lets a repair which restored nothing consume the decision,
because the repair the directive was handed to can fail and an ordinary one succeed after it.
Therefore: a head nobody was handed is never spent; a different head is a different decision and is
owed; and a repair that produced nothing consumed nothing — now in the code, not only here. Batch attribution everywhere falls back to the round the phase names, so
an omitted optional `remediationBatchId` cannot resurrect a spent directive. The echo is the only
new datum, and nothing writes a consumption flag and nothing deletes one.

Everything else in (r) stands: two modes with `patch` the default, the commit going FORWARD with no
Git history operation, no veto on overlapping work, and the fixer's duty to report what it had to
overwrite.

## Amendment 2026-09-12 (u) — superseding (t) in one respect: the workflow stops inferring that the rollback was carried out

(t) established that a rollback decision is honoured exactly once. Four implementations of "once"
were built and four independent reviews each found a blocking defect in the one before it. The rule
is withdrawn. What follows is why, because the failure is a specification failure and it will
recur wherever the same shape is specified again.

**The shape.** AC-32 asked the workflow to infer, from an append-only log of handoffs, whether a
human's instruction *had been carried out*. Nothing in that log records that fact — no participant
writes it, and no participant was ever asked to. So each implementation chose a proxy for it:

1. the notes view being empty — unreachable where it was evaluated, so the directive re-fired at
   every rewind and restored over its own rebuild;
2. "this batch has been repaired" — true in the ordinary flow long before a maintainer names a
   head, so a first-ever decision was discarded in silence;
3. "the echo, plus some later fix of the batch reported `fixed`" — true when the repair the
   directive was handed to FAILED and an ordinary one succeeded after it, so a decision was
   consumed by work that restored nothing;
4. "the echo, plus a fix at the same phase and attempt" — the two attempt counters are derived from
   different populations (`byPhase('red-spec', …)` and `byPhase('green-fix', …)`) and are bumped by
   different modelled events, so any contract repair or green retry desynchronises them permanently:
   the decision then either re-delivers forever or is spent by a fix published before it existed.

Each round's author reasoned correctly about the proxy they had just removed, and each new proxy
failed one staging further out. Every round passed its own tests and a full green gate, because the
fixtures held the proxy's assumption by construction. That is what happens when a specification
demands a fact the data model does not carry: there is no proxy, only proxies that have not been
falsified yet.

**The decision.** There is no spend inference. `reconstruct` is emitted on every rewind for which
`policy.rollbackTo` names a head this cycle recorded, and the maintainer clears `rollbackTo` when
their decision has been carried out. The lifetime of a decision belongs to the person who made it.

What the workflow owes instead is **legibility**: every delivery is reported in the run log, naming
the head, the exact paths restored, and whose job it is to end it. A directive still standing on a
later rewind is then a visible, attributable state — the maintainer left it set — rather than a
predicate misfiring where nobody can see it. Silence is what kept three of the four rounds
invisible: an unspent head and a spent one both produced no output.

This is AC-32's own lesson, applied to the half it had never reached. (r) established that the
workflow stopped deciding *whether* a restore was safe, because deciding it cost four defects in
three rounds. It went on deciding *how many times*, and that cost four more.

**What (t) keeps.** Everything that is not the spend: `rollbackTo` is a 40-hex head taken verbatim
with no resolution step; a head this cycle never recorded is refused (`rollback-head-invalid`,
`rollback-head-unknown`, `rollback-scope-unknown`) as a field on the dispatch, and the coordinator
then ends the story `failed-preparation`; the commit goes FORWARD with no Git history operation;
overlapping work does not veto; the fixer reports what it had to overwrite; and `rollbackNotes`
remains a derived view over the handoffs.

**Withdrawn with the rule:** the `reconstructedFrom` echo, its schema field, its two-sided
coordinator check and `rollbackNote` — all of them existed only to support the inference.

**The cost, recorded so the trade is legible.** Four repair rounds, four independent reviews at high
effort, and roughly 1,300 lines of churn on this one surface, to save the maintainer from clearing
a parameter they set. The simpler rule has a failure mode of its own — a maintainer who forgets to
clear `rollbackTo` gets the directive again — but it is theirs, it is announced on every dispatch,
and it does not take four reviews to see.
