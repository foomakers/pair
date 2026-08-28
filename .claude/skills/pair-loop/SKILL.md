---
name: pair-loop
description: "Unattended delivery loop: per iteration, selects eligible cards via pair-next, runs a dependency + mutex analysis, composes implement-batch for a mutex-safe parallel batch (or drives one card sequentially), enacts the automation policy (auto-advance) and evaluates the stop predicate. It probes the session for a fan-out primitive and binds the strongest realization available — the pair-loop workflow in Claude Code, Codex multi-agent subagents in Codex — degrading fail-closed to one eligible card plus a continue-token when none is exposed."
version: 0.2.0
author: Foomakers
---

# /pair-loop — Unattended Delivery Loop

Advance the backlog unattended, within a policy the team controls, context-safe, halting only where the tier policy requires a human. Reads its policy from [`tech/automation.md`](../../../.pair/knowledge/guidelines/collaboration/automation/automation-policy.md) (adoption delta over the KB default schema, D21) and composes `/implement-batch` (#219) for the actual per-card implement→PR→review pipeline — this skill never re-implements it.

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
4. **Act**: Extract and validate `## Eligibility` (the seven HALT triggers), `## Auto-Advance`, `## Stop Predicate`, `## Max Parallelism`, `## Audit Location` — the full algorithm lives in [automation-policy.md](../../../.pair/knowledge/guidelines/collaboration/automation/automation-policy.md) and is **not restated here** (D18: the matching/parsing rule has one owner). A malformed value at any of the five knobs **HALTs before any card is touched**, naming the file and the offending value. `## Auto-Advance` may only ever name the SAME tier `## Eligibility` declares — a card outside eligibility is never selected in the first place, so no other tier could legally advance.
5. **Act**: Resolve `tech/risk-matrix.md`'s `## Tag Projection` declaration — every label this project actually emits (e.g. `risk:green`, `risk:yellow`, `risk:red`) — and hold it ready to pass as `tagProjectionFamily`. This is what lets `## Max Parallelism`'s per-tier override keys be checked against real, emitted tiers rather than shape alone (a tier that is emitted but never eligible, like a maintained-but-idle `risk:red` override, is still a legal narrowing target).
6. **Verify**: All five knobs resolved (or their fail-closed default applied), and the Tag Projection family resolved. Proceed to Step 1.

## Step 1: Realization — Three Tiers (ADR-017 §4, amended by ADR-021)

Fan-out is ONE capability with THREE realizations, in preference order: **(1) in-harness** (Claude Code's `Workflow`, Codex subagents), **(2) external driver** (`pair run` — a fresh engine process per iteration, re-invoking on the continue-token: the portable baseline, and a legitimate choice even where subagents exist, since a separate process respects ADR-017 §3's context isolation more strongly than a subagent does), **(3) degraded** (one card + a continue-token a human/CI/cron re-invokes). Tier 2 is what retired ADR-017's "No portable unattended loop" limitation: the caller §4 leaves to a human is automated, not replaced.

Which realization is available is established by **probing this session**, never by the product name or a version string — see [harness realization](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/harness-realization.md) for the probe → bind → announce → degrade mechanics. **This skill's delta**: the tiers above are the capability's; the surface map for the in-harness tier is data, held in the fan-out asset (`.pair/knowledge/assets/codex-fanout.cjs`); the announcement goes to the run output AND to the audit; and the fail-closed floor is the one-card path, never an in-context multi-card loop.

1. **Check**: Which fan-out primitive does this session actually expose — Claude Code's `Workflow` tool, or the Codex multi-agent tools? Decide it by probing, not in prose: pipe the tool names actually exposed to you (plus `externalDriverAvailable`, true when `pair run` is on PATH) into the fan-out asset's `bind` command:

   ```bash
   echo '{"probe":{"tools":["…"],"externalDriverAvailable":false}}' \
     | node .pair/knowledge/assets/codex-fanout.cjs bind
   ```

   It returns `{tier, realization, primitive, reason, announcement, harnessCeiling}`. **Print the announcement before dispatching anything**, and record it in the audit.
2. **Act — Claude Code**: Delegate the entire unattended run to the `pair-loop` workflow (distributed alongside `pair-implement-batch` in the `workflows` registry), passing `{ policyText, root, overrides, predicateOverride, startIteration, tagProjectionFamily }` — the resolved policy text, `--root` (if given), any run-argument overrides (pin-sequential, exclude), `--predicate` as `predicateOverride` (the Argument tier of the cascade, replacing the adoption file's `## Stop Predicate` for this invocation only), `--iteration` as `startIteration` (resuming the counter from a continue-token rather than restarting at 0), and the Tag Projection family from Step 0.5. The workflow validates every one of these by type and content before touching any card — `root` and the predicate reach agent prompts that run `gh`. It then drives every iteration — selection, dependency + mutex analysis, batch composition, `implement-batch` composition, auto-advance (re-reading each card's tier immediately before merging — a mid-run tier raise blocks it even with an approved PR), audit (write verified, never assumed), stop-predicate evaluation — in fresh per-card subagents (ADR-017 §3, architectural invariant: this orchestrator's context never grows with the number of cards). A card the run is DONE with this run — escalated, failed, already merged, parked awaiting human, or halted by a gate-red merge refusal — is excluded from every later iteration in the same run, never silently re-driven from scratch.
3. **Act — Codex** (the probe bound a Codex multi-agent realization): drive the run through the [Codex in-harness fan-out](#step-1b-codex-in-harness-fan-out) below. Same lane, same policy, same per-card outcomes as the Claude realization — only the dispatch mechanism differs.
4. **Act — no in-harness primitive bound** (the probe missed): take the **one-card path** below — never iterate multiple cards in this session's own context. Whether that single card is the WHOLE run (tier 3, degraded) or one iteration of an unattended run (tier 2) is the CALLER's business, not this skill's: an external driver re-invokes on the continue-token this step prints, in a fresh process each time, so the steps here are identical either way. Say which tier the invocation is in the output only when the caller told you (e.g. `pair run` states its own resolution):
   - Run `/pair-next` once, scoped by `--root` (if given) and the policy's eligibility filter.
   - Apply the eligibility filter, the dependency analysis (ordering only — a single-card run has no parallel set to compute) and pick the first unblocked eligible card. An untagged card is `risk:red` and never eligible (quality-model §3.2 fail-safe).
   - Drive that one card to its gate via `/implement-batch` with a single-story batch (the same call `min(D,P)==1` uses in the fan-out path — sequential is not a second engine).
   - If the resulting PR is review-approved, the card's tier is `## Eligibility`'s own value (the only tier `## Auto-Advance` may ever name), and the 🟢 gate set verifies green (`/pair-capability-verify-quality`), push and merge unattended. **Otherwise** — awaiting human, or the gate came back red — leave it for the human AND post a comment on the card's issue recording that it awaits action — the same "on the issue," not audit-only, guarantee the fan-out path gives.
   - Append the iteration to the audit file at the resolved `## Audit Location`.
   - Write/update the checkpoint via `/pair-capability-checkpoint` for the driven card's story.
   - Stop, and print a **continue-token**: `pair-loop [--root <id>] [--predicate "<text>"] --iteration <n+1>` — the caller (human/CI/cron) pastes it back to resume. No new persistence format (Assumption 7): the token is the loop's scope + predicate + iteration counter rendered as a re-invocation line.
5. **Verify**: Exactly one card advanced this invocation (one-card path) or the bound fan-out realization ran to its own stop condition. Never both cards and context growth in the same session.

## Step 1b: Codex In-Harness Fan-Out

The tier-1 realization for a session whose probe bound a Codex multi-agent toolset. It runs the **same** lane Step 1's Claude branch delegates to the workflow: this section is a dispatch mechanism, not a second process engine — it selects nothing, classifies nothing, and adds no policy parameter. Eligibility, dependency + mutex analysis, the stop predicate and auto-advance stay exactly where Step 0 and the automation policy put them.

Every deterministic step below is the fan-out asset's, invoked as `node .pair/knowledge/assets/codex-fanout.cjs <command>` with one JSON request on stdin. What stays yours is the part only a model in this session can do: calling the bound `spawn`/`wait` handles the probe named, and running `/pair-next` and the dependency + mutex analysis Step 1's own algorithm already defines.

### 1b.1 Resume before selecting

**Act**: Read the audit file at the resolved `## Audit Location` (empty string when it does not exist yet) and pass it to `resume`. It returns, per card, which phases are already recorded complete, which are left, whether a previous iteration halted the card, and the PR it already carries. **Re-dispatch only what it lists**, never a card it reports halted, and never the `pr` phase for a story that already has one — an in-flight story re-enters through its existing PR.

### 1b.2 Compose the batch under three ceilings

**Act**: Run the eligibility filter, the dependency analysis and the mutex analysis exactly as Step 1 defines them, then ask `cap` for the effective parallelism, passing the dependency-allowed count, `## Max Parallelism` as resolved in Step 0, and the `harnessCeiling` the bind step returned. **Print the returned line** — it names the cap and which of the three limits bound it. A cap of `0` dispatches nothing this iteration.

### 1b.3 Dispatch each phase into a fresh subagent

For each card in the batch, for each phase it still owes (`implement` → `pr` → `review` → `fix`):

1. **Act**: Ask `packet` for the phase's context packet. It carries one card, that card's worktree, the role instructions, the skill to run and the return schema — and **nothing else**: no other card's content, no material the role must not see. Role text travels in the packet, so the run works with no harness agent profile configured.
2. **Act**: Spawn a **fresh** subagent with the bound spawn handle, passing the packet's instructions + skill + card as the request and the packet's `schema` as the required structured result (`codex exec --output-schema` realizes the same contract when the spawn tool takes no schema of its own).
3. **Act**: Wait with the bound wait handle, **always under an explicit timeout** — bound it by the harness's own `max_wait_timeout_ms` when the session reports one. An unbounded wait is not permitted: it is how an unattended run hangs forever.
4. **Act**: Pass what the wait returned to `collect` (`{phase, result:{status, value, detail}}`). It answers with a declared terminal outcome — `completed`, `failed-validation`, `timed-out`, `cancelled`, `died`, `not-started` — and whether the card may advance. An absent, unparseable or schema-invalid return is a **failed** phase, never a success; an outcome the taxonomy cannot name fails closed the same way.
5. **Act**: Keep only that compact result. **Never** the subagent's transcript — the orchestrator's context must not grow with the batch (ADR-017 §3, architectural invariant).

A subagent that ends badly stops **its own** card, and nothing else: collect and audit its siblings' results as usual. A partial batch is reported, never discarded.

### 1b.4 Audit and checkpoint, or stop

**Act**: Append every dispatch and every outcome to the audit through the asset's `audit` command, which writes and reads the file back. If it fails, **HALT the run** — an unattended run with no audit trail is not an acceptable degraded mode. Per-card resumable state stays `/pair-capability-checkpoint`'s; there is no third store, and `.pair/working/` is never loaded as ambient context.

**Act**: Then continue the iteration exactly as Step 1's Claude branch does — auto-advance under `## Auto-Advance` (re-reading the card's tier immediately before merging), stop-predicate evaluation, max-iterations backstop. None of it is redefined here.

## Boundaries — What This Skill Does Not Do

- **Never re-implements the per-card pipeline.** Implement→PR→review is `/implement-batch`'s (#219); this skill composes it and consumes its outcomes only (PR opened/updated, review-approved, escalated, failed).
- **Never merges outside the tier the policy permits.** Merge authority belongs to `## Auto-Advance`, never to this skill inventing a looser rule, and never to branch protection it cannot count on (a project with `Review enforcement: disabled` gets no safety net there — this skill verifies the 🟢 gate set itself before ever pushing/merging).
- **Never modifies `/pair-next`.** Selection stays the frozen atom (ADR-017 §1) — this skill only ever passes `--root`/`--filter`.
- **Never widens an override.** A pin-sequential or exclude override may only narrow the parallel set the dependency+mutex analysis computed; it can never add back an excluded card.
- **Never asserts a realization it did not probe.** A product name, a version string and a documented-but-unobserved feature are all inadmissible evidence; an unrecognised probe result reads as absent.
- **Never iterates several cards inside one context**, at any tier. That is not a degraded mode, it is the defect the tiers exist to prevent.
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

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) for the standard scenarios. Additional cases:

- **`tech/automation.md` absent or has no `## Eligibility`**: not a degradation — automation is off by design (D21), report and exit cleanly.
- **`/pair-capability-checkpoint` not installed** (degraded path): skip the checkpoint write; the continue-token and the audit file remain the resume mechanism.
- **`/pair-capability-verify-quality` not installed**: never auto-advance without a locally-verified gate set — halt that card for the human instead of guessing green.
- **The probe finds no fan-out primitive**: not a failure — degrade in the declared order (external driver, else the one-card path), record the reason in the audit, and say so in the output.
- **The fan-out asset is missing or unrunnable**: the in-harness tier cannot be bound without it (its surface map is what the probe reads), so degrade rather than hand-roll the probe, the cap arithmetic or the packet checks in prose.
- **The audit cannot be written**: HALT. This is the one degradation this skill refuses — an unaudited unattended run is not an acceptable mode.

## Notes

- This skill and the `pair-loop` workflow share one contract: the workflow is **a** fan-out realization, this file is the entry point, the degradation guard, the second in-harness realization (Codex) and the portable single-card path. Neither re-derives the automation-policy.md schema — both read it through the same extraction rules.
- Non-Claude-Code note (ADR-017 §5, amended by ADR-021): a harness with no fan-out primitive of its own runs the one-card path — as tier 2 when an external driver (`pair run`) re-invokes it unattended, as tier 3 when a human/CI/cron does. This is not a lesser mode by accident: it is the same safety property (no in-context multi-card iteration) applied without a primitive to lean on, and under tier 2 the fresh process per iteration makes the isolation stricter, not weaker. Codex is no longer in that set — Step 1b is its in-harness realization — but a Codex session whose probe misses lands there like any other.
- **The two in-harness realizations run one lane, not two.** The Claude branch executes it in JS; the Codex branch executes its deterministic half through the fan-out asset and its dispatch through the harness's own tools. The same card must come out with the same per-card outcome and an equivalent audit either way; where it does not, the bug is in the realization, never in the lane.
