---
name: loop
description: "Unattended delivery loop: per iteration, selects eligible cards via pair-next, runs a dependency + mutex analysis, composes implement-batch for a mutex-safe parallel batch (or drives one card sequentially), enacts the automation policy (auto-advance) and evaluates the stop predicate. It probes the session for a fan-out primitive and binds the strongest realization available — the pair-loop workflow in Claude Code, Codex multi-agent subagents in Codex — degrading fail-closed to one eligible card plus a continue-token when none is exposed."
version: 0.2.0
author: Foomakers
---

# /loop — Unattended Delivery Loop

Advance the backlog unattended, within a policy the team controls, context-safe, halting only where the tier policy requires a human. Reads its policy from [`tech/automation.md`](../../.pair/knowledge/guidelines/collaboration/automation/automation-policy.md) (adoption delta over the KB default schema, D21) and composes `/implement-batch` (#219) for the actual per-card implement→PR→review pipeline — this skill never re-implements it.

## Arguments (optional)

| Argument | Value | Effect |
| --- | --- | --- |
| `--root` | an issue id (epic or story) | Scope every `/pair-next` call this run makes to that subtree, exactly as `/pair-next --root` does. |
| `--predicate` | a `<selector> ⇒ <condition>` string | Overrides `tech/automation.md`'s `## Stop Predicate` for this invocation only (Argument > Adoption > KB default). |
| `--iteration` | a positive integer | The starting iteration count — used when re-invoking from a printed continue-token; never required on a fresh run. |

## Core Rule: Zero Merit Logic (D18)

This skill classifies nothing and judges nothing. It reads tags, board state and the policy file verbatim, and evaluates a predicate — that is the whole of its decision surface. Every acceptance criterion below is grep-verifiable against that constraint.

## Step 0: Read the Policy — Fail-Closed

1. **Act**: Read `.pair/adoption/tech/automation.md` (project-relative, resolved the normal adoption-file way).
2. **Check**: Is the file absent, or present with no `## Eligibility` section?
3. **Act**: If so, report "automation is off — `tech/automation.md` declares no `## Eligibility`" and **exit cleanly**. This is not an error (D21) — never fall back to the KB's recommended `risk:green` default on the project's behalf.
4. **Act**: Extract and validate `## Eligibility` (the seven HALT triggers), `## Auto-Advance`, `## Stop Predicate`, `## Max Parallelism`, `## Audit Location` — the full algorithm lives in [automation-policy.md](../../.pair/knowledge/guidelines/collaboration/automation/automation-policy.md) and is **not restated here** (D18: the matching/parsing rule has one owner). A malformed value at any of the five knobs **HALTs before any card is touched**, naming the file and the offending value. `## Auto-Advance` may only ever name the SAME tier `## Eligibility` declares — a card outside eligibility is never selected in the first place, so no other tier could legally advance.
5. **Act**: Resolve `tech/risk-matrix.md`'s `## Tag Projection` declaration — every label this project actually emits (e.g. `risk:green`, `risk:yellow`, `risk:red`) — and hold it ready to pass as `tagProjectionFamily`. This is what lets `## Max Parallelism`'s per-tier override keys be checked against real, emitted tiers rather than shape alone (a tier that is emitted but never eligible, like a maintained-but-idle `risk:red` override, is still a legal narrowing target).
6. **Act**: Resolve the project's **working area** — `working_path` at the top level of `pair.config.json`, falling back to `.pair/working` when the file or the key is absent (working-area.md). It is where `## Audit Location` is rooted AND the path the fan-out asset's blindness check guards, so it is resolved ONCE here and passed in; a project that moved its working area and a skill that assumed the default disagree silently, and the disagreement is a reviewer reading the author's checkpoint.
7. **Verify**: All five knobs resolved (or their fail-closed default applied), the Tag Projection family resolved and the working area resolved. Proceed to Step 1.

## Step 1: Realization — Three Tiers (ADR-017 §4, amended by ADR-021)

Fan-out is ONE capability with THREE realizations, in preference order: **(1) in-harness** (Claude Code's `Workflow`, Codex subagents), **(2) external driver** (`pair run` — a fresh engine process per iteration, re-invoking on the continue-token: the portable baseline, and a legitimate choice even where subagents exist, since a separate process respects ADR-017 §3's context isolation more strongly than a subagent does), **(3) degraded** (one card + a continue-token a human/CI/cron re-invokes). Tier 2 is what retired ADR-017's "No portable unattended loop" limitation: the caller §4 leaves to a human is automated, not replaced.

Which realization is available is established by **probing this session**, never by the product name or a version string — see [harness realization](../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/harness-realization.md) for the probe → bind → announce → degrade mechanics. **This skill's delta**: the tiers above are the capability's; the surface map for the in-harness tier is data, held in the fan-out asset (`.pair/knowledge/assets/codex-fanout.cjs`), and it holds **every** in-harness realization — the delegated one this file's own harness offers as much as the spawn/wait ones, so no session is exempt from probing; the announcement goes to the run output AND to the audit; and the fail-closed floor is the one-card path, never an in-context multi-card loop.

1. **Check**: Which fan-out primitive does this session actually expose? Decide it by probing, not in prose, and not by naming your own harness: pipe the tool names actually exposed to you (plus `externalDriverAvailable`, true when `pair run` is on PATH; plus `harnessCeiling`/`harnessWaitTimeoutMs` when the session reports them) into the fan-out asset's `bind` command:

   ```bash
   echo '{"probe":{"tools":["…"],"externalDriverAvailable":false}}' \
     | node .pair/knowledge/assets/codex-fanout.cjs bind
   ```

   It returns `{tier, realization, dispatch, primitive, reason, announcement, harnessCeiling, waitTimeoutMs, waitTimeoutKeys}`. **Every** in-harness realization is an entry in its surface map, this session's included, so the answer is the one that decides the branch below — `dispatch` is what you route on, never the product you believe you are. **Print the announcement before dispatching anything**, and append it to the audit as a **run-level** record: `{"kind":"run","run":"<run id>","realization":"<id>","announcement":"<line>"}`. A run-level record needs no card id and is never resumed as a card; a card id invented for it becomes a phantom card owed a full pipeline.
2. **Act — the binding's `dispatch` is `delegated-run`**: hand the entire unattended run to the runtime the binding named — the `pair-loop` workflow (distributed alongside `pair-implement-batch` in the `workflows` registry) — passing `{ policyText, root, overrides, predicateOverride, startIteration, tagProjectionFamily }` — the resolved policy text, `--root` (if given), any run-argument overrides (pin-sequential, exclude), `--predicate` as `predicateOverride` (the Argument tier of the cascade, replacing the adoption file's `## Stop Predicate` for this invocation only), `--iteration` as `startIteration` (resuming the counter from a continue-token rather than restarting at 0), and the Tag Projection family from Step 0.5. The workflow validates every one of these by type and content before touching any card — `root` and the predicate reach agent prompts that run `gh`. It then drives every iteration — selection, dependency + mutex analysis, batch composition, `implement-batch` composition, auto-advance (re-reading each card's tier immediately before merging — a mid-run tier raise blocks it even with an approved PR), audit (write verified, never assumed), stop-predicate evaluation — in fresh per-card subagents (ADR-017 §3, architectural invariant: this orchestrator's context never grows with the number of cards). A card the run is DONE with this run — escalated, failed, already merged, parked awaiting human, or halted by a gate-red merge refusal — is excluded from every later iteration in the same run, never silently re-driven from scratch.
3. **Act — the binding's `dispatch` is `spawn-wait`**: this session dispatches and waits itself, so drive the run through the [in-harness spawn/wait fan-out](#step-1b-codex-in-harness-fan-out) below. Same lane, same policy, same per-card outcomes as the delegated realization — only the dispatch mechanism differs.
4. **Act — no in-harness realization bound** (`tier` is 2 or 3, `dispatch` is `null`): take the **one-card path** below — never iterate multiple cards in this session's own context. Whether that single card is the WHOLE run (tier 3, degraded) or one iteration of an unattended run (tier 2) is the CALLER's business, not this skill's: an external driver re-invokes on the continue-token this step prints, in a fresh process each time, so the steps here are identical either way. Say which tier the invocation is in the output only when the caller told you (e.g. `pair run` states its own resolution):
   - Run `/pair-next` once, scoped by `--root` (if given) and the policy's eligibility filter.
   - Apply the eligibility filter, the dependency analysis (ordering only — a single-card run has no parallel set to compute) and pick the first unblocked eligible card. An untagged card is `risk:red` and never eligible (quality-model §3.2 fail-safe).
   - Drive that one card to its gate via `/implement-batch` with a single-story batch (the same call `min(D,P)==1` uses in the fan-out path — sequential is not a second engine).
   - If the resulting PR is review-approved, the card's tier is `## Eligibility`'s own value (the only tier `## Auto-Advance` may ever name), and the 🟢 gate set verifies green (`/pair-capability-verify-quality`), push and merge unattended. **Otherwise** — awaiting human, or the gate came back red — leave it for the human AND post a comment on the card's issue recording that it awaits action — the same "on the issue," not audit-only, guarantee the fan-out path gives.
   - Append the iteration to the audit file at the resolved `## Audit Location`.
   - Write/update the checkpoint via `/pair-capability-checkpoint` for the driven card's story.
   - Stop, and print a **continue-token**: `pair-loop [--root <id>] [--predicate "<text>"] --iteration <n+1>` — the caller (human/CI/cron) pastes it back to resume. No new persistence format (Assumption 7): the token is the loop's scope + predicate + iteration counter rendered as a re-invocation line.
5. **Verify**: Exactly one card advanced this invocation (one-card path) or the bound fan-out realization ran to its own stop condition. Never both cards and context growth in the same session.

## Step 1b: Codex In-Harness Fan-Out

The tier-1 path for a session whose binding is `spawn-wait` — this orchestrator starts each subagent and waits for it (Codex's multi-agent toolsets are the realizations that bind here today). It runs the **same** lane Step 1's Claude branch delegates to the workflow: this section is a dispatch mechanism, not a second process engine — it selects nothing, classifies nothing, and adds no policy parameter. Eligibility, dependency + mutex analysis, the stop predicate and auto-advance stay exactly where Step 0 and the automation policy put them.

Every deterministic step below is the fan-out asset's, invoked as `node .pair/knowledge/assets/codex-fanout.cjs <command>` with one JSON request on stdin. What stays yours is the part only a model in this session can do: calling the bound `spawn`/`wait` handles the probe named, and running `/pair-next` and the dependency + mutex analysis Step 1's own algorithm already defines.

### 1b.1 Resume before selecting

**Act**: Stamp this invocation with a **run id** — any value unique to it (the timestamp it started at will do) — and carry that id on every audit record the run writes. Read the audit file at the resolved `## Audit Location` (empty string when it does not exist yet) and pass it to `resume` together with the run id (`{audit, run}`). It returns, per card, which phases are already recorded complete, which are left, how many fix rounds are already spent, whether **this run** halted the card, and the PR it already carries. **Re-dispatch only what it lists**, never a card it reports halted, and never the `pr` phase for a story that already has one — an in-flight story re-enters through its existing PR.

Two properties of that answer are worth stating, because a plan that lacked them was wrong in both directions:

- **A halt belongs to the run that recorded it.** The audit is ONE persistent, append-only, project-relative file that outlives every invocation, so a card whose phase timed out last week is driven again today. Passing the run id is what scopes it — exactly as the Claude branch's exclusion is scoped to "every later iteration in the same run", and never a permanent refusal only a hand-edit of an append-only file could lift. A later record completing the same phase retires the halt too.
- **A plan never owes `fix`.** A fix is owed by a review that returned findings (1b.3), never by a phase list. A card interrupted mid-cycle therefore re-enters at `review`, and its fixes get re-reviewed rather than assumed good.

### 1b.2 Compose the batch under three ceilings

**Act**: Run the eligibility filter, the dependency analysis and the mutex analysis exactly as Step 1 defines them, then ask `cap` for the effective parallelism, passing the dependency-allowed count, `## Max Parallelism` as resolved in Step 0, and the `harnessCeiling` the bind step returned. **Print the returned line** — it names the cap and which of the three limits bound it. A cap of `0` dispatches nothing this iteration.

### 1b.3 Dispatch each phase into a fresh subagent

For each card in the batch, dispatch the phases it still owes (`implement` → `pr` → `review`), then drive the **review ↔ fix loop** below. Each single dispatch:

1. **Act**: Ask `packet` for the phase's context packet. It carries one card, that card's worktree, the role instructions, the skill to run, the return schema and the findings the role must act on — and **nothing else**: no other card's content, no material the role must not see. Role text travels in the packet, so the run works with no harness agent profile configured.

   ```bash
   echo '{
     "workingPath": ".pair/working",
     "worktreeRoot": "../pair-worktrees",
     "packet": { "phase": "review", "card": {"id":"441","title":"…","branch":"…"}, "attachments": [] }
   }' | node .pair/knowledge/assets/codex-fanout.cjs packet
   ```

   `workingPath` (Step 0.6's resolved working area) and `worktreeRoot` (where this run actually put the worktrees) are read at **either** level — top-level as above, or inside `packet` — and the nested one wins. Neither is decoration: `workingPath` is the path the pre-spawn blindness check guards, so a project that moved its working area would otherwise get a reviewer holding the author's checkpoint, and a `worktreeRoot` that never arrived names a worktree the run did not create. An unknown key at either level is **rejected** rather than dropped, so a misspelling fails loudly instead of silently reinstating the default it was passed to override.
2. **Act**: Spawn a **fresh** subagent with the bound spawn handle, passing the packet's instructions + skill + card as the request and the packet's `schema` as the required structured result (`codex exec --output-schema` realizes the same contract when the spawn tool takes no schema of its own).
3. **Act**: Wait with the bound wait handle, **always under an explicit timeout** — and use the bound the `bind` step handed back, never one you chose. Take `waitTimeoutMs` when it returned a value (the harness reported it in the probe); otherwise read the harness's configured maximum from the config keys `waitTimeoutKeys` names and pass that. An unbounded wait is not permitted — it is how an unattended run hangs forever — and neither is a wait bounded by a number nobody observed: inventing a timeout, or omitting the argument and trusting an unseen default, is the inference the probe convention exists to keep out.
4. **Act**: Pass what the wait returned to `collect` (`{phase, result:{status, value, detail}}`). It answers with a declared terminal outcome — `completed`, `failed-validation`, `timed-out`, `cancelled`, `died`, `not-started` — and whether the card may advance. An absent, unparseable or schema-invalid return is a **failed** phase, never a success; an outcome the taxonomy cannot name — an unknown status, an unknown phase — fails closed the same way.

   For the `review` phase, ALSO pass the project's generated review contract as `schema` when one is on disk and fresh (`.claude/workflows/pair-contracts/code-review.contract.json`; check it with `node .claude/workflows/pair-contracts/ensure-contract.mjs check <review-template> <contract>` and skip it on anything but `fresh`). That artifact is what enum-locks the verdict and the severity names to the project's own review template, and it is the contract the Claude branch validates against — passing it is what makes "the same result contract" true rather than "the same skeleton". It **tightens only**: `collect` always applies the built-in phase contract as well, so a stale, partial or hand-edited artifact can never widen the check. Absent or stale, the built-in skeleton stands alone.
5. **Act**: Keep only that compact result. **Never** the subagent's transcript — the orchestrator's context must not grow with the batch (ADR-017 §3, architectural invariant).

**The review ↔ fix loop.** A `review` that collected `completed` does not finish the card. Pass its returned value to `converge` (`{review, round}`, plus `maxFixRounds` and the contract's `severityRanks` + blocking threshold where the project declares them). Its answer — not a fixed phase list — decides what happens next:

- **`converged`** — nothing actionable remains, the card is review-approved, continue to 1b.4. **No fixer is spawned**: a fixer dispatched on an approved PR has nothing to fix and burns a subagent to say so.
- **`fix`** — dispatch exactly ONE `fix` phase, passing the decision's `actionable` array straight through as the packet request's `findings` (top level or inside `packet` — either is read), and then **dispatch `review` again**, passing back the `round` it returned. Fixes are always re-reviewed; a card is never recorded converged on a review that ran before them. A `fix` packet with no findings is **refused**, so the omission cannot pass silently: a fixer that gets none returns `fixed:true` having fixed nothing determinable, the re-review re-raises the same findings, and the card burns its whole round cap to an escalation nobody chose.
- **`escalate`** — stop the card for a human and leave the PR as it stands: the round cap was reached, the reviewer asked for a human decision a second time, or the review carried no verdict at all (absence of findings is not evidence a review happened). Never merge it.

Record the decision on the review's audit record (`action`, `round`) — that is what lets 1b.1 resume an interrupted cycle at `review` instead of reading it as closed.

A subagent that ends badly stops **its own** card, and nothing else: collect and audit its siblings' results as usual. A partial batch is reported, never discarded.

### 1b.4 Audit and checkpoint, or stop

**Act**: Append every dispatch and every outcome to the audit through the asset's `audit` command, which writes and reads the file back. A record about a **card** names it (`id`); a record about the **run** — the realization announcement from Step 1.1, a run-level halt — is written `{"kind":"run", …}` and needs no id. The command refuses anything that is neither, so the two ways of getting it wrong are both loud: a record with no id was silently unreadable on resume, and one with an invented id came back as a phantom card owed a full pipeline. If the write fails, **HALT the run** — an unattended run with no audit trail is not an acceptable degraded mode. Per-card resumable state stays `/pair-capability-checkpoint`'s; there is no third store, and `.pair/working/` is never loaded as ambient context.

**Act**: Then continue the iteration exactly as Step 1's Claude branch does — auto-advance under `## Auto-Advance` (re-reading the card's tier immediately before merging), stop-predicate evaluation, max-iterations backstop. None of it is redefined here.

## Boundaries — What This Skill Does Not Do

- **Never re-implements the per-card pipeline.** Implement→PR→review is `/implement-batch`'s (#219); this skill composes it and consumes its outcomes only (PR opened/updated, review-approved, escalated, failed).
- **Never merges outside the tier the policy permits.** Merge authority belongs to `## Auto-Advance`, never to this skill inventing a looser rule, and never to branch protection it cannot count on (a project with `Review enforcement: disabled` gets no safety net there — this skill verifies the 🟢 gate set itself before ever pushing/merging).
- **Never modifies `/pair-next`.** Selection stays the frozen atom (ADR-017 §1) — this skill only ever passes `--root`/`--filter`.
- **Never widens an override.** A pin-sequential or exclude override may only narrow the parallel set the dependency+mutex analysis computed; it can never add back an excluded card.
- **Never asserts a realization it did not probe.** A product name, a version string and a documented-but-unobserved feature are all inadmissible evidence; an unrecognised probe result reads as absent. That holds for the harness this skill is *running in* too: **every** in-harness realization is an entry in the surface map, and Step 1's branch is taken on the binding's `dispatch`, never on which product the session believes itself to be.
- **Never applies a bound it invented.** The wait timeout comes from the binding — the probed value, or the config keys it names. A number the run chose for itself is the same inference the probe rule forbids.
- **Never iterates several cards inside one context**, at any tier. That is not a degraded mode, it is the defect the tiers exist to prevent.
- **Never converges a review cycle on a review that predates the fixes.** Every fix round is followed by a re-review, and the loop ends only on zero actionable findings or an escalation — the bound is the loop's own, not a merit criterion, and it never decides what to work on.
- **Never invents a second handoff format.** The return contract is the one the in-harness workflow already uses, realized through the harness's own structured-result mechanism.

## Output Format

```text
LOOP RUN:
├── Policy:        [tech/automation.md — Eligibility: <label> | absent, automation off]
├── Realization:   [<id> (tier N) — bound to <primitive>; <why> | degraded — <why>]
├── Mode:          [in-harness fan-out (workflow) | in-harness fan-out (codex subagents) | one card + continue-token (driver-re-invoked or manual)]
├── Parallelism:   [effective cap N, bound by dependency | policy | harness]
├── Iterations:    [N]
├── Cards driven:  [id, id, ...]
├── Auto-advanced: [id (merged) | none]
├── Audit:         [<working_path>/<Audit Location>]
└── Stop reason:   [predicate satisfied | max-iterations reached | nothing eligible | HALT — <reason>]
```

One-card path only (tiers 2 and 3), appended — this line is what an external driver reads to re-invoke:

```text
CONTINUE-TOKEN: pair-loop [--root <id>] [--predicate "<text>"] --iteration <n+1>
```

## Graceful Degradation

See [graceful degradation](../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) for the standard scenarios. Additional cases:

- **`tech/automation.md` absent or has no `## Eligibility`**: not a degradation — automation is off by design (D21), report and exit cleanly.
- **`/checkpoint` not installed** (degraded path): skip the checkpoint write; the continue-token and the audit file remain the resume mechanism.
- **`/verify-quality` not installed**: never auto-advance without a locally-verified gate set — halt that card for the human instead of guessing green.
- **The probe finds no fan-out primitive**: not a failure — degrade in the declared order (external driver, else the one-card path), record the reason in the audit, and say so in the output.
- **The fan-out asset is missing or unrunnable**: the in-harness tier cannot be bound without it (its surface map is what the probe reads), so degrade rather than hand-roll the probe, the cap arithmetic or the packet checks in prose.
- **The audit cannot be written**: HALT. This is the one degradation this skill refuses — an unaudited unattended run is not an acceptable mode.

## Notes

- This skill and the `pair-loop` workflow share one contract: the workflow is **a** fan-out realization, this file is the entry point, the degradation guard, the second in-harness realization (Codex) and the portable single-card path. Neither re-derives the automation-policy.md schema — both read it through the same extraction rules.
- Non-Claude-Code note (ADR-017 §5, amended by ADR-021): a harness with no fan-out primitive of its own runs the one-card path — as tier 2 when an external driver (`pair run`) re-invokes it unattended, as tier 3 when a human/CI/cron does. This is not a lesser mode by accident: it is the same safety property (no in-context multi-card iteration) applied without a primitive to lean on, and under tier 2 the fresh process per iteration makes the isolation stricter, not weaker. Codex is no longer in that set — Step 1b is its in-harness realization — but a Codex session whose probe misses lands there like any other.
- **The two in-harness realizations run one lane, not two.** The Claude branch executes it in JS; the Codex branch executes its deterministic half through the fan-out asset and its dispatch through the harness's own tools. The same card must come out with the same per-card outcome and an equivalent audit either way; where it does not, the bug is in the realization, never in the lane.
