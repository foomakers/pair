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
