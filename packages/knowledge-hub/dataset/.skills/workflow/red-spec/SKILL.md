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
| `$phase`           | Yes      | `a0` (initial) · `r<n>-g<k>` (group k of round n) · `r<n>-g<k>-rev<m>` (revision m of that group).                                             |
| `$head`            | No       | 40-hex head the attempt starts from. Absent only in `initial` mode, where you resolve it from `$base`.                                        |
| `$pr`              | No       | PR number, when one exists.                                                                                                                   |
| `$title`           | initial  | Story title.                                                                                                                                  |
| `$findings`        | remediation / repair / revision | JSON array of the obligations to contract: `{ id, severity, location, description, recommendation, kind?, groupId?, rowId? }`. Stable ids — never renumber them. |
| `$scope`           | No       | JSON `{ groupId, owner, mode, allowedPaths, oracle }` of an already-planned group (groups after the first, repairs, revisions). You may narrow it, never widen it. |
| `$rejection`       | repair   | JSON array: the validator's findings on the rejected contract. Every row it names is MANDATORY in the repaired contract.                        |
| `$contract`        | repair / revision | Absolute path of the contract being repaired or revised; `$contractHash` its recorded hash.                                          |
| `$revision`        | revision | The revision number `m` of `$phase`.                                                                                                          |
| `$notes`           | No       | Scope directive from the card; it overrides the issue body where they conflict.                                                               |
| `$workflowVersion` | Yes      | The coordinator's version; every handoff records it.                                                                                          |

## Algorithm

### Step 0: Resolve the durable state (mandatory, before anything else)

```bash
SKILL_DIR="$(dirname "<absolute path of this SKILL.md>")"
MAIN="$(pwd)"                                   # the main checkout — you have not cd'd yet
RUN_DIR="$MAIN/.pair/working/runs/$run/$story"
AC_HASH="$(gh issue view $story --json body -q .body | shasum -a 256 | cut -c1-64)"   # omit when no card is reachable
node "$SKILL_DIR/scripts/cycle-state.mjs" resolve --dir "$RUN_DIR" --workflowVersion $workflowVersion \
  --policy '$policy' --entry $entry --story $story --inputs $inputs --acHash "sha256:$AC_HASH" \
  --runsRoot "$MAIN/.pair/working/runs" ${pr:+--pr $pr}
```

- `status: other-run` ⇒ return `{ status: "other-run", runId }` — the cycle already lives under another run id.
- `status: incompatible | invalid` ⇒ return `{ status: "redirect", next: { step: "blocked", reason: "failed-resume", detail: <reason> } }`.
- `next.step` is not `prepare`, or `next.phase` is not `$phase` ⇒ return `{ status: "redirect", next }` verbatim. Spend no judgment.
- Otherwise continue; `next.attempt` is your attempt number.

### Step 1: Start state (mandatory)

1. `initial` mode: create or reuse the worktree — `git worktree add $worktree -B $branch $base` on first setup, `git worktree add $worktree $branch` if the branch has commits, plain `cd` if the path exists. Never touch the main checkout's working tree or branch. `inputHead` = `git -C $worktree rev-parse HEAD` (40-hex). Other modes: `HEAD` must equal `$head`; a moved head is `status: stale` — return it, never reset, stash or rebase.
2. **Reconcile, never destroy.** `git status --porcelain --untracked-files=all` in `$worktree`. A dirty path that this attempt owns (listed in `$RUN_DIR/$phase-red-contract.json` of an earlier attempt of THIS phase, or in `$rejection`'s named artifacts) is restored (`git checkout -- <path>` / `git clean -f -- <path>`) and recorded under `reconciled` with its working-tree `sha256`. Any other dirty path — production or test, tracked or untracked — is UNKNOWN work: list it under `preserved`, leave it untouched, and return `status: dirty` with the list. A sealed snapshot's blobs are never touched.

### Step 2: Inventory (the authority, once)

For every obligation — each AC of the card (`initial`; read the card with `gh issue view $story --json body`) or each finding in `$findings` — write one `inventory` item: `id` (`AC-<n>` or the finding id), `producer` (the function, grammar, command or format that owns the behavior — never a nearby predicate or a downstream consumer), `inputs`, `representations` (canonical source, generated assets, dataset/installed copies, documented command), `consumers`, `classes` (every supported, invalid and boundary equivalence class — equivalence needs a shared behavioral/grammar rule, not equal observed output) and `interactions` (the smallest cross-product where one rule's output feeds another). An obligation whose producer cannot be named, or whose authority is missing, is returned as `status: unprovable` with the exact gap — never a regex over prose as a stand-in.

**Grouping (`remediation`, first group of the round only — `$phase` = `r<n>-g1`, no `$scope`):** group the findings by canonical owner + authoritative oracle + one compatible mode (`behavioral` | `structural` | `test`), exact `allowedPaths` (`[]` for `test`), `dependsOn`; every finding id lands in exactly one group, or in `carried` with a one-line `disposition` when its correction lies OUTSIDE the repository (the card, the PR body, a human decision) — `carried` is a LOCATION, the finding stays blocking until a human dispositions it or a read-back proves the correction. Return the whole `plan` and contract the first group in dependency order; later groups are contracted by later dispatches with `$scope`.

**Carry-forward:** a finding carrying `observedHead`, `oracle`, `probe`, `observed` is a verified prior result — re-run its oracle on the base first; a `missedUpstream` finding gets a `regression` row that stays in the suite for good.

### Step 3: The matrix

One row per class and interaction of every inventory item: `{ id, kind, baseline, condition, oracle, expected, covers, rationale? }`.

- `kind`: `witness` (fails for the intended defect — RED against the unfixed base), `control` (a positive or already-correct case — may PASS, recorded with `baseline: pass`, never forced red), `boundary`, `interaction`, `not-applicable` (a class that provably cannot occur — `rationale` is mandatory and the validator re-derives it).
- Every inventory `id` is `covers`-ed by at least one row; at least one `witness` with `baseline: red` exists unless `fixScope.mode` is `test`. Do not collapse rows because their outputs agree today; justify any equivalence in `rationale`.
- `mode: test` (guard-strength — production is already correct): the witness FAILS against an injected regression in an isolated copy and PASSES against the current source; `observed` records both. Never edit production to make a guard red.
- Row ids are stable: a `repair` or `revision` keeps every existing id and changed row unchanged; it adds rows or edits only the rows the rejection / gap names, and lists them under `changedRows`.

### Step 4: Write and prove the artifacts

1. Declare `fixScope` before editing: one `owner`, one `mode`, exact `allowedPaths`. A behavior repair and a refactor never share a contract — `status: split-required` with `splitReason` says what a re-plan must change.
2. Modify ONLY test source, fixtures and committed oracle rows. Never production source, docs, adoption, configuration, generated assets. Never commit, push, post, label, create a card or merge.
3. Run every changed test at the base: a `baseline: red` artifact records its exact failing `command` and `observed` failure; a `baseline: pass` control records its passing command and output. A `kind: fixture` artifact names the RED test that `consumedBy` it.
4. Hash every artifact: `sha256sum <file>` ⇒ `sha256:<digest>`.
5. Select the tests you run by the changed producers and their consumers; never claim a result you did not run at this head.

### Step 5: Persist and hand off

1. Write the contract to `$RUN_DIR/$phase-red-contract.json`; `contractHash` = `node "$SKILL_DIR/scripts/cycle-state.mjs" hash --file <that path>`.
2. Write a complete draft handoff (envelope: `run`, `story`, `pr?`, `branch`, `phase`, `skill: "red-spec"`, `inputHead`, `inputsDigest: $inputs`, `acHash`, `attempt`, `mode`, `status`, `contractPath` (absolute), `contractHash`, `plan?`, `groupId?`, `revision?`, `changedRows?`, `reconciled`, `preserved`, `findings: { received, covered }`, `elapsedMs`) and publish it:

   ```bash
   node "$SKILL_DIR/scripts/cycle-state.mjs" publish --dir "$RUN_DIR" --file <draft> --phase $phase --skill red-spec \
     --workflowVersion $workflowVersion --attempt <n> [--predecessor <phase>-<skill>]
   ```

   A refusal (`stale`, `split-required`, `unprovable`, `dirty`) is published too, with `reason` — it is the cycle's answer, not a dead agent.
3. Run `resolve` again (Step 0 command) and return its `next`.

## Output Format

`{ status: red | stale | split-required | unprovable | dirty, mode, inputHead, sourceOfTruth, inventory, fixScope: { owner, mode, allowedPaths }, matrix, redTests: [{ file, kind, baseline, sha256, command?, observed?, consumedBy? }], testExempt, exemptionRationale?, contractPath, contractHash, plan?, changedRows?, reconciled?, preserved?, reason?, splitReason?, next }` — `contractPath` absolute, under `/.pair/working/runs/`.

## Notes

- Blind by design: read nothing under `.pair/working/` except `$RUN_DIR` (prior contracts, the validator's rejection and the last review are cycle evidence, not author context).
- The coordinator validates the typed result and follows `next`; it never derives a transition itself. Whatever you cannot prove, you refuse — typed, with the exact gap.
- Text shape: schematic, one line per row; the concrete failure case and its evidence at full length, no narration.
