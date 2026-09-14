---
name: loop
description: "Unattended delivery loop: per iteration, selects eligible cards via pair-next, runs a dependency + mutex analysis, composes implement-batch for a mutex-safe parallel batch (or drives one card sequentially), enacts the automation policy (auto-advance) and evaluates the stop predicate. In an environment with a fan-out runner it delegates the whole unattended run to the pair-loop workflow; elsewhere it drives exactly one eligible card and reports a continue-token."
version: 0.1.0
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
6. **Verify**: All five knobs resolved (or their fail-closed default applied), and the Tag Projection family resolved. Proceed to Step 1.

## Step 1: Realization — Three Tiers (ADR-017 §4, amended by ADR-021)

Fan-out is ONE capability with THREE realizations, in preference order: **(1) in-harness** (Claude Code's `Workflow`, Codex subagents), **(2) external driver** (`pair-cli run` — a fresh engine process per iteration, re-invoking on the continue-token: the portable baseline, and a legitimate choice even where subagents exist, since a separate process respects ADR-017 §3's context isolation more strongly than a subagent does), **(3) degraded** (one card + a continue-token a human/CI/cron re-invokes). Tier 2 is what retired ADR-017's "No portable unattended loop" limitation: the caller §4 leaves to a human is automated, not replaced.

1. **Check**: Does the current environment expose a fan-out runner (Claude Code's `Workflow` tool)?
2. **Act — Claude Code**: Delegate the entire unattended run to the `pair-loop` workflow (distributed alongside `pair-implement-batch` in the `workflows` registry), passing `{ policyText, root, overrides, predicateOverride, startIteration, tagProjectionFamily }` — the resolved policy text, `--root` (if given), any run-argument overrides (pin-sequential, exclude), `--predicate` as `predicateOverride` (the Argument tier of the cascade, replacing the adoption file's `## Stop Predicate` for this invocation only), `--iteration` as `startIteration` (resuming the counter from a continue-token rather than restarting at 0), and the Tag Projection family from Step 0.5. The workflow validates every one of these by type and content before touching any card — `root` and the predicate reach agent prompts that run `gh`. It then drives every iteration — selection, dependency + mutex analysis, batch composition, `implement-batch` composition, auto-advance (re-reading each card's tier immediately before merging — a mid-run tier raise blocks it even with an approved PR), audit (write verified, never assumed), stop-predicate evaluation — in fresh per-card subagents (ADR-017 §3, architectural invariant: this orchestrator's context never grows with the number of cards). A card the run is DONE with this run — escalated, failed, already merged, parked awaiting human, or halted by a gate-red merge refusal — is excluded from every later iteration in the same run, never silently re-driven from scratch.
3. **Act — any other tool** (no in-harness fan-out runner): take the **one-card path** below — never iterate multiple cards in this session's own context. Whether that single card is the WHOLE run (tier 3, degraded) or one iteration of an unattended run (tier 2) is the CALLER's business, not this skill's: an external driver re-invokes on the continue-token this step prints, in a fresh process each time, so the steps here are identical either way. Say which tier the invocation is in the output only when the caller told you (e.g. `pair-cli run` states its own resolution):
   - Run `/pair-next` once, scoped by `--root` (if given) and the policy's eligibility filter.
   - Apply the eligibility filter, the dependency analysis (ordering only — a single-card run has no parallel set to compute) and pick the first unblocked eligible card. An untagged card is `risk:red` and never eligible (quality-model §3.2 fail-safe).
   - Drive that one card to its gate via `/implement-batch` with a single-story batch (the same call `min(D,P)==1` uses in the fan-out path — sequential is not a second engine).
   - If the resulting PR is review-approved, the card's tier is `## Eligibility`'s own value (the only tier `## Auto-Advance` may ever name), and the 🟢 gate set verifies green (`/verify-quality`), push and merge unattended. **Otherwise** — awaiting human, or the gate came back red — leave it for the human AND post a comment on the card's issue recording that it awaits action — the same "on the issue," not audit-only, guarantee the fan-out path gives.
   - Append the iteration to the audit file at the resolved `## Audit Location`.
   - Write/update the checkpoint via `/checkpoint` for the driven card's story.
   - Stop, and print a **continue-token**: `pair-loop [--root <id>] [--predicate "<text>"] --iteration <n+1>` — the caller (human/CI/cron) pastes it back to resume. No new persistence format (Assumption 7): the token is the loop's scope + predicate + iteration counter rendered as a re-invocation line.
4. **Verify**: Exactly one card advanced this invocation (degraded path) or the workflow ran to its own stop condition (fan-out path). Never both cards and context growth in the same session.

## Boundaries — What This Skill Does Not Do

- **Never re-implements the per-card pipeline.** Implement→PR→review is `/implement-batch`'s (#219); this skill composes it and consumes its outcomes only (PR opened/updated, review-approved, escalated, failed).
- **Never merges outside the tier the policy permits.** Merge authority belongs to `## Auto-Advance`, never to this skill inventing a looser rule, and never to branch protection it cannot count on (a project with `Review enforcement: disabled` gets no safety net there — this skill verifies the 🟢 gate set itself before ever pushing/merging).
- **Never modifies `/pair-next`.** Selection stays the frozen atom (ADR-017 §1) — this skill only ever passes `--root`/`--filter`.
- **Never widens an override.** A pin-sequential or exclude override may only narrow the parallel set the dependency+mutex analysis computed; it can never add back an excluded card.

## Output Format

```text
LOOP RUN:
├── Policy:        [tech/automation.md — Eligibility: <label> | absent, automation off]
├── Mode:          [in-harness fan-out (workflow) | one card + continue-token (driver-re-invoked or manual)]
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

## Notes

- This skill and the `pair-loop` workflow share one contract: the workflow is the fan-out realization, this file is the entry point, the degradation guard, and the portable single-card path. Neither re-derives the automation-policy.md schema — both read it through the same extraction rules.
- Non-Claude-Code note (ADR-017 §5, amended by ADR-021): every other supported harness runs the one-card path — as tier 2 when an external driver (`pair-cli run`) re-invokes it unattended, as tier 3 when a human/CI/cron does. This is not a lesser mode by accident: it is the same safety property (no in-context multi-card iteration) applied without a fan-out primitive to lean on, and under tier 2 the fresh process per iteration makes the isolation stricter, not weaker.
