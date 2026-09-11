---
name: red-spec
description: "Stage 1 of the delivery workflow — preparation: owns the authoritative inventory (AC or finding → producer/grammar → inputs, representations, consumers → equivalence classes and interactions → executable evidence), the grouping of a remediation round and the executable acceptance contract — discriminating witnesses that are RED against the unfixed base, positive/already-correct controls that may pass, stable row ids — writing ONLY tests and consumed fixtures before any production edit, in initial (fresh story), remediation, repair (verifier rejection) and revision (contract gap) modes. Resolves the durable cycle state first and redirects when another step is due. Never touches production source. Dispatched by the batch engine (pair-implement-batch)."
version: 0.2.0
author: Foomakers
---

# /red-spec — The Contract Comes First, From Someone Who Will Not Implement It

Prepare the executable acceptance contract a change must satisfy, before any agent that can edit source sees the task. You inventory what each obligation really is, group a round's findings by owner, write the tests that discriminate, and hand one typed contract to an independent validator. The implementer cannot author its own specification; you write it, a verifier reproduces and seals it.

## Arguments

| Argument           | Required | Description                                                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `$run`             | Yes      | Run id. Handoffs live under `.pair/working/runs/$run/$story/` in the MAIN checkout the coordinator was started in (its working directory before any `cd`) — never inside a story or review worktree. |
| `$story`           | Yes      | Story id.                                                                                                                                     |
| `$branch`          | Yes      | Story branch.                                                                                                                                 |
| `$worktree`        | Yes      | The persistent story worktree (`<worktreeRoot>/<story>`). All file work happens here.                                                          |
| `$base`            | Yes      | The ref the story is cut from (`origin/main`, or another story's branch when `$stacked=true`).                                                |
| `$stacked`         | Yes      | `true` when `$base` is another story's branch.                                                                                                |
| `$entry`           | Yes      | `fresh` (no PR yet) or `pr` (a PR exists).                                                                                                    |
| `$policy`          | Yes      | JSON: `{ maxFixRounds, redRepairs, greenRetries, reviewers }` — handed to the cycle-state script, never re-interpreted.                        |
| `$inputs`          | Yes      | The coordinator's effective-inputs digest; recorded in the handoff so a resume can tell an unchanged cycle from a changed one.                 |
| `$mode`            | Yes      | `initial` (acceptance contract from the story's AC, before implementation) · `remediation` (from a round's findings) · `repair` (the validator rejected the contract) · `revision` (the final verifier found a genuine contract gap). |
| `$phase`           | Yes      | `a0` (initial) · `a0-rev<m>` (revision m of the initial acceptance contract) · `r<n>-g<k>` (group k of round n) · `r<n>-g<k>-rev<m>` (revision m of that group). |
| `$head`            | No       | 40-hex head the attempt starts from. Absent only in `initial` mode, where you resolve it from `$base`.                                        |
| `$pr`              | No       | PR number, when one exists.                                                                                                                   |
| `$title`           | initial  | Story title.                                                                                                                                  |
| `$findings`        | remediation / repair / revision | JSON array of the obligations to contract: `{ id, severity, location, description, recommendation, kind?, groupId?, rowId? }`. Stable ids — never renumber them. |
| `$scope`           | No       | JSON `{ groupId, owner, mode, allowedPaths, oracle }` of an already-planned group (groups after the first, repairs, revisions). You may narrow it, never widen it. |
| `$rejection`       | repair   | JSON array: the validator's findings on the rejected contract. Every row it names is MANDATORY in the repaired contract.                        |
| `$contract`        | repair / revision | Absolute path of the contract being repaired or revised; `$contractHash` its recorded hash.                                          |
| `$revision`        | revision | The revision number `m` of `$phase`.                                                                                                          |
| `$changedRows`     | revision (contradiction) | The EXACT rows the successor may change — the `conflictingRowIds` of the contradiction that routed you here. Do not widen it.        |
| `$contradictionFor`| revision (contradiction) | `{ phase, findings }` of the remediation that raised the contradiction: the obligation you are unblocking, still open.               |
| `$revalidate`      | No       | Identity dimensions the predecessor's evidence never carried (US-479 F1, S10) — `scopeEpoch`, `scopeBaselineHash`, `findings-origin`. Re-DERIVE each from the authority; never inherit or assume one. |
| `$predecessorRun`  | No       | `{ runId, phase }` when the contract you revise was sealed in an EARLIER run directory bound by a migration acknowledgment. Read it there, read-only; never edit, move or re-seal it. |
| `$regressionGuards`| No       | The ACTIVE regression risks (US-479 S11): `{ riskId, introducedByRemediationBatchId, lastCleanReviewedHead, firstFailingHead, reproducerRef, closureAssertions, affectedBoundaryRefs }`. Every one of them belongs in THIS single complete contract, as a row whose oracle is its own reproducer. Do not split them across contracts and do not drop one. |
| `$regressionRepairOf`| No     | The remediation batch a review invalidated because it introduced a regression. You are preparing that SAME batch again — a LOGICAL rewind, on the current head: the fix goes forward, and `lastCleanReviewedHead` is only the behavioural baseline the guard is compared against. Never a Git revert, reset, rebase or seal deletion. |
| `$notes`           | No       | Scope directive from the card; it overrides the issue body where they conflict.                                                               |
| `$workflowVersion` | Yes      | The coordinator's version; every handoff records it.                                                                                          |

## Algorithm

### Step 0: Resolve the durable state (mandatory, before anything else)

```bash
SKILL_DIR="$(dirname "<absolute path of this SKILL.md>")"
MAIN="$(pwd)"                                   # the main checkout — you have not cd'd yet
RUN_DIR="$MAIN/.pair/working/runs/$run/$story"
AC_HASH="$(node "$SKILL_DIR/scripts/cycle-state.mjs" ac-hash --story $story | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).acHash')"   # canonical card hash; omit when no card is reachable
node "$SKILL_DIR/scripts/cycle-state.mjs" resolve --dir "$RUN_DIR" --workflowVersion $workflowVersion \
  --policy '$policy' --entry $entry --story $story --inputs $inputs --acHash "$AC_HASH" \
  --runsRoot "$MAIN/.pair/working/runs" ${pr:+--pr $pr}
```

- `status: other-run` ⇒ return `{ status: "other-run", runId }` — the cycle already lives under another run id.
- `status: incompatible | invalid` ⇒ return `{ status: "redirect", next: { step: "blocked", reason: "failed-resume", detail: <reason> } }`.
- `next.step` is not `prepare`, or `next.phase` is not `$phase` ⇒ return `{ status: "redirect", next }` verbatim. Spend no judgment. When `next` names THIS dispatch (`prepare`, `$phase`) you ARE the step: continue, never return a redirect to yourself.
- Otherwise continue; `next.attempt` is your attempt number.

### Step 1: Start state (mandatory)

1. `initial` mode: create or reuse the worktree — `git worktree add $worktree -B $branch $base` on first setup, `git worktree add $worktree $branch` if the branch has commits, plain `cd` if the path exists. Never touch the main checkout's working tree or branch. `inputHead` = `git -C $worktree rev-parse HEAD` (40-hex). Other modes: `HEAD` must equal `$head`; a moved head is `status: stale` — return it, never reset, stash or rebase.
2. **Reconcile, never destroy.** `git status --porcelain --untracked-files=all` in `$worktree`. A dirty path that this attempt owns (listed in `$RUN_DIR/$phase-red-contract.json` of an earlier attempt of THIS phase, or in `$rejection`'s named artifacts) is restored (`git checkout -- <path>` / `git clean -f -- <path>`) and recorded under `reconciled` with its working-tree `sha256`. Any other dirty path — production or test, tracked or untracked — is UNKNOWN work: list it under `preserved`, leave it untouched, and return `status: dirty` with the list. A sealed snapshot's blobs are never touched.

### Step 2: Inventory (the authority, once)

For every obligation — each AC of the card (`initial`; read the card with `gh issue view $story --json body`) or each finding in `$findings` — write one `inventory` item: `id` (`AC-<n>` or the finding id), `producer` (the function, grammar, command or format that owns the behavior — never a nearby predicate or a downstream consumer), `inputs`, `representations` (canonical source, generated assets, dataset/installed copies, documented command), `consumers`, `classes` (every supported, invalid and boundary equivalence class — equivalence needs a shared behavioral/grammar rule, not equal observed output) and `interactions` (the smallest cross-product where one rule's output feeds another). An obligation whose producer cannot be named, or whose authority is missing, is returned as `status: unprovable` with the exact gap — never a regex over prose as a stand-in.

**Grouping (`remediation`, first group of the round only — `$phase` = `r<n>-g1`, no `$scope`):** group the findings by canonical owner + authoritative oracle + one compatible mode (`behavioral` | `structural` | `test`), exact `allowedPaths` (`[]` for `test`), `dependsOn`; every finding id lands in exactly one group, or in `carried` with a one-line `disposition` when its correction lies OUTSIDE the repository (the card, the PR body, a human decision) — `carried` is a LOCATION, the finding stays blocking until a human dispositions it or a read-back proves the correction. Return the whole `plan` and contract the first group in dependency order; later groups are contracted by later dispatches with `$scope`. `dependsOn` names a real SEMANTIC dependency only (one group's fix changes the input/expected output another group's oracle reads) — never invent one to force serialization of groups that merely touch the shared worktree: the write mutex already serializes filesystem access, and an artificial `dependsOn` between two independent findings only stalls the round without closing anything faster (US-479 T-21, S3).

**Carry-forward:** a finding carrying `observedHead`, `oracle`, `probe`, `observed` is a verified prior result — re-run its oracle on the base first; a `missedUpstream` finding gets a `regression` row that stays in the suite for good.

### Step 3: The matrix

One row per class and interaction of every inventory item: `{ id, kind, baseline, condition, oracle, expected, covers, rationale? }`.

- `kind`: `witness` (fails for the intended defect — RED against the unfixed base), `control` (a positive or already-correct case — may PASS, recorded with `baseline: pass`, never forced red), `boundary`, `interaction`, `not-applicable` (a class that provably cannot occur — `rationale` is mandatory and the validator re-derives it).
- Every inventory `id` is `covers`-ed by at least one row; at least one `witness` with `baseline: red` exists unless `fixScope.mode` is `test`. Do not collapse rows because their outputs agree today; justify any equivalence in `rationale`.
- `mode: test` (guard-strength — production is already correct): the witness FAILS against an injected regression in an isolated copy and PASSES against the current source; `observed` records both. Never edit production to make a guard red.
- Row ids are stable: a `repair` or `revision` keeps every existing id and changed row unchanged; it adds rows or edits only the rows the rejection / gap names, and lists them under `changedRows`. **A repair's `changedRows` must name every `rowId`/`mechanismId` the rejection you are answering carried** (US-479 T-20, S3) — `publish` refuses the handoff before the write when one is missing (`repair-incomplete:<id>`), so a genuinely new counterexample never displaces verifying a prior gap first.
- Scope is inherited: a `repair` or `revision` keeps the `fixScope` of the contract it repairs or revises — the same `mode`, every `allowedPaths` entry — and may only ADD paths. The sealer refuses a narrowed scope (`fixScope-narrowed`); a0-rev2 in canary run 11 shrank a0 to one production file and left the implementer no home for its decision log or convention page.

### Step 4: Write and prove the artifacts

1. Declare `fixScope` before editing: one `owner`, one `mode`, exact `allowedPaths`. In `initial` mode `allowedPaths` is the story's whole implementation surface — every production path its AC require (from the card's files / integration surface), the docs and catalogs those paths are mirrored into, and `.pair/adoption/decision-log/` because the implement process records decisions there; a single-file scope on a fresh story forces the implementer to smuggle decisions into the PR body (canary run 11). In `remediation` mode it is the group's exact paths. A behavior repair and a refactor never share a contract — `status: split-required` with `splitReason` says what a re-plan must change, and it is terminal.

   **A contradiction is a different answer.** When the obligation you were handed cannot be given a witness at this head WITHOUT breaking rows an already-sealed contract approved — you proved it, you did not suspect it — answer `status: contradiction` instead. It is not a refusal: the cycle state routes ONE minimal successor revision of the contract you name, in the same canonical cycle, and you are dispatched again as `mode: revision` on `<line>-rev<m+1>` with `$changedRows` and `$contradictionFor`. It carries executable evidence or `publish` refuses it before the write:

   | field | meaning |
   | --- | --- |
   | `revisionReason` | exactly `contradicts-approved-authority` |
   | `predecessorContractHash` | the `contractHash` of the SEALED contract whose rows you contradict — resolved against the real seal, so a hash no `red-verify` ever sealed is `contradiction-unresolvable` |
   | `conflictingRowIds` | every row of that contract the correct behavior breaks — non-empty |
   | `changedRows` | what the revision must change: it must cover every `conflictingRowIds` entry |
   | `counterexample` | `{ command, cwd?, fixtureRef?, expected, actual }` — the run that proves the collision, no shell syntax |

   Prose never becomes this evidence: `revisionReason` on any other status is refused (`revisionReason-without-contradiction`), and a `split-required` with a long `splitReason` stays terminal. ONE successor revision per obligation per succession line: an equivalent contradiction after it escalates to a human, and a new `runId` does not reset that. Never waive the finding, never retire or edit the predecessor seal — the successor stands beside it. The sealed contract you name may live in an EARLIER run directory that a migration acknowledgment bound to this cycle (US-479 F1): the cycle state resolves it there, continues the historical succession line (`a0-rev3` is followed by `a0-rev4`), hands you `$predecessorRun` and `$revalidate`, and leaves that directory byte-identical. Nothing is inherited from it but the identity you were pointed at.
2. Modify ONLY test source, fixtures and committed oracle rows. Never production source, docs, adoption, configuration, generated assets. Never commit, push, post, label, create a card or merge.
3. Run every changed test at the base: a `baseline: red` artifact records its exact failing `command` and `observed` failure; a `baseline: pass` control records its passing command and output. A `kind: fixture` artifact names the RED test that `consumedBy` it.
4. Hash every artifact: `sha256sum <file>` ⇒ `sha256:<digest>`.
5. Select the tests you run by the changed producers and their consumers; never claim a result you did not run at this head. A fixture that stands in for the real producer (a hand-built "twin" reasoned about instead of exercised) is not evidence — if the producer takes real inputs (a directory tree, an installed copy, a real CLI invocation), build those and run the actual function/command; a row whose `expected` was derived by inspection alone is refused at `red-verify` (US-479 T-20).

### Step 5: Persist and hand off

1. Write the contract to `$RUN_DIR/$phase-red-contract.json`; `contractHash` = `node "$SKILL_DIR/scripts/cycle-state.mjs" hash --file <that path>`.
2. Write a complete draft handoff (envelope: `run`, `story`, `pr?`, `branch`, `phase`, `skill: "red-spec"`, `inputHead`, `inputsDigest: $inputs`, `acHash` (any value — `publish` replaces it with the canonical card hash it computes itself), `attempt`, `mode`, `status`, `contractPath` (absolute), `contractHash`, `plan?`, `groupId?`, `revision?`, `changedRows?`, `remediationBatchId?: "r<n>"` (`$phase`'s round `n`, for `remediation`/`repair`/`revision` modes only — every group of the same round shares it, US-479 T-21 S4), `reconciled`, `preserved`, `findings: { received, covered }`, `elapsedMs`) and publish it:

   ```bash
   node "$SKILL_DIR/scripts/cycle-state.mjs" publish --dir "$RUN_DIR" --file <draft> --phase $phase --skill red-spec \
     --workflowVersion $workflowVersion --attempt <n> [--predecessor <phase>-<skill>] ${pr:+--pr $pr}
   ```

   A refusal (`stale`, `split-required`, `unprovable`, `dirty`) is published too, with `reason` — it is the cycle's answer, not a dead agent. `dirty` and `stale` name a cause OUTSIDE the cycle: once a human clears it the same phase is dispatched again as the next attempt (once); `unprovable` and `split-required` are terminal at once. A `contradiction` (Step 4.1) is published the same way and is NOT terminal — it routes the successor revision.
3. Run `resolve` again (Step 0 command) and return its `next`.

## Output Format

`{ status: red | stale | split-required | unprovable | dirty | contradiction, mode, inputHead, sourceOfTruth, inventory, fixScope: { owner, mode, allowedPaths }, matrix, redTests: [{ file, kind, baseline, sha256, command?, observed?, consumedBy? }], testExempt, exemptionRationale?, contractPath, contractHash, plan?, changedRows?, reconciled?, preserved?, reason?, splitReason?, next }` — `contractPath` absolute, under `/.pair/working/runs/`.

A `contradiction` carries `revisionReason`, `predecessorContractHash`, `conflictingRowIds`, `changedRows` and `counterexample` instead of a contract (Step 4.1); `contractPath`/`contractHash` are absent, because nothing was written.

## Notes

- Blind by design: read nothing under `.pair/working/` except `$RUN_DIR` (prior contracts, the validator's rejection and the last review are cycle evidence, not author context).
- The coordinator validates the typed result and follows `next`; it never derives a transition itself. Whatever you cannot prove, you refuse — typed, with the exact gap.
- Text shape: schematic, one line per row; the concrete failure case and its evidence at full length, no narration.
- The returned `inventory` and `matrix` of a `repair` or `revision` are the DELTA (the obligations and rows this attempt adds or edits); a row may also `covers` an obligation of the base contract (an `AC-<n>` the delta does not repeat) as long as it covers one of the delta's own. The contract FILE always carries the whole inventory and matrix; the validator judges the file, the coordinator judges the result.
- Your handoff publish is observed by the host runtime (`cycle-runtime.mjs`, US-479 T-25) as a phase-level progress point, through `cycle-state.mjs` — never something you invoke yourself.
