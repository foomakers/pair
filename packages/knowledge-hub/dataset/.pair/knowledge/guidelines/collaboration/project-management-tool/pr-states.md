# PR State Flow — gate ≠ review

## Overview

A pull request moves through **three** pair states, and the state is never typed in by hand: it is the **synthesis** of signals that already exist on the code host.

```text
to-be-reviewed → ready-to-merge
               ↘ not-approved
```

| PR state | Meaning | Merge-enabling |
| --- | --- | --- |
| **to-be-reviewed** | The PR is open and not yet cleared: gates not green, review not submitted (or crashed), or a 🔴 PR still awaiting explicit human approval | No |
| **ready-to-merge** | Gates green **and** review approved **and** (at 🔴) explicit human approval recorded | Yes — a human still performs the merge; pair never auto-merges |
| **not-approved** | The review verdict is CHANGES-REQUESTED — the findings route back to a human (the author) | No |

This document is the **one place** the PR state flow is defined. It is the pull-request companion to [canonical-states.md](canonical-states.md), which owns the five **work-item** macrostates: a PR in any of the three states above sits under the work item's `Review` macrostate; `Done` is produced by the merge, not by a PR state.

## Gate ≠ review

Two enforcers act on a PR, and they never blur:

| Enforcer | Nature | Produces | Judgment |
| --- | --- | --- | --- |
| **Gate** (CI checks) | deterministic, mechanical pass/fail | green / red checks | **zero judgment** — no opinions, no severity calls |
| **Review** (`/review`) | judgment on the change | a verdict (APPROVED / CHANGES-REQUESTED / TECH-DEBT) in the native code-host review | **zero mechanical checks** — it reads gate results, it never re-runs them |

**The gate is the first filter** (R5.4). Review runs at green gates; while any mechanical gate is red the review may still report findings, but it can produce **no merge-enabling verdict** — a red or failing gate **never** yields `ready-to-merge`, regardless of the judgment verdict. This ordering is what makes the two enforcers composable instead of competing: the gate answers "does it build and pass", the review answers "should it exist".

## Synthesis — state = f(gates, review, tier, explicit approval)

The synthesis is a table, not a heuristic. It is implemented once, in the shipped, provider-agnostic [`pr-state.sh`](../../../assets/pr-state.sh) (`resolve_pr_state`), so every consumer — `/review`, `/publish-pr`, a code-host job — computes the same state from the same inputs.

| Gates | Review verdict | Tier | Explicit human approval | ⇒ PR state |
| --- | --- | --- | --- | --- |
| any | CHANGES-REQUESTED | any | any | `not-approved` |
| red / pending | any other | any | any | `to-be-reviewed` |
| green | pending / missing / crashed | any | any | `to-be-reviewed` |
| green | APPROVED / TECH-DEBT | 🟢 / 🟡 | not required | `ready-to-merge` |
| green | APPROVED / TECH-DEBT | 🔴 | absent | `to-be-reviewed` |
| green | APPROVED / TECH-DEBT | 🔴 | present on current head | `ready-to-merge` |

- **Green gates AND an approved review ⇒ `ready-to-merge`** at 🟢/🟡; the same combination at 🔴 additionally needs the explicit approval row.
- **A `not-approved` state routes to a human** — the author addresses the findings and the review re-runs; no automation clears it.
- **Order-independent**: the synthesis is a pure function of the current signals, re-evaluated on every relevant event (new commit, check completion, review submission, label change). A review that lands before the gate finishes is not a special case — the next evaluation simply sees both.

### Per-tier requirements are read, never restated

Reviewer count, SLA, checklist depth, and whether explicit approval is required come from the **quality model** ([quality-model.md](../../quality-assurance/quality-model.md) §4) through its `Argument > Adoption > KB default` cascade — 🟢 `risk:green` self-merge at green checks · 🟡 `risk:yellow` 1 reviewer / 1 working day · 🔴 `risk:red` 1 reviewer / 2 working days + extended checklist + **explicit approval** (D10). This document does **not** copy those thresholds; a project that overrides `tier.red.reviewers` in `tech/risk-matrix.md` changes them in exactly one place.

The tier itself is read from the PR's `risk:*` label via [`tier-resolve.sh`](../../../assets/tier-resolve.sh) (`resolve_tier`). **This flow contains no classification criteria** (D18): it never inspects the diff, the code, file paths, or change size — grep-verifiable, in both the guideline and the evaluator. **Fail-safe: an untagged, unknown, or malformed tier is treated as 🔴** (consistent with the pre-merge gate's own fail-safe, [tier-aware-pipeline.md](../../infrastructure/cicd-strategy/tier-aware-pipeline.md)) — so a missing classification demands *more*, never less.

## Enforcement: required checks are the authority, labels are a view

Merge blocking is **mechanical**. Three required-check layers sit on the protected branch:

| Layer | Check | Required | Blocks when |
| --- | --- | --- | --- |
| Gate | the pre-merge pipeline's jobs (base, secret-scan, and the suites for the tier) | always | any job red, or a required suite missing |
| Review | **`pair-review`** — the check the review flow publishes on the head commit | always | conclusion is `failure` (CHANGES-REQUESTED) **or** still `pending`/absent (review never ran, crashed, or was skipped) |
| Explicit approval | **`pair-explicit-approval`** — verifies a human approval exists on the current head when the tier demands it | always (auto-passes below 🔴) | tier is 🔴 (or untagged ⇒ 🔴) and no human approval is recorded on the current head |

Because `pair-review` is a **required status check** (R5.7), the review **cannot be skipped**: a PR with no review check, a failed one, or one still pending is not mergeable on the code host — not by convention, but by branch protection. The same holds for `pair-explicit-approval` at 🔴 (AC4/D10).

**The `pr-state:*` label is a view, not the authority.** The flow keeps exactly one of `pr-state:to-be-reviewed` / `pr-state:ready-to-merge` / `pr-state:not-approved` on the PR so humans and `pair-next`-style automation can filter at a glance. A label is never the thing that permits a merge: editing or forging a label cannot enable a merge, because branch protection evaluates the required checks and ignores labels entirely. If a label and the checks ever disagree, the checks win and the next evaluation re-labels.

Host mechanics — how the check run is published, the exact branch-protection payload, the `pair-explicit-approval` job — live in the code host's implementation guide (R2.12): [github-implementation.md](github-implementation.md) § "PR state flow — required checks & branch protection".

## Edge cases

| Case | Behavior |
| --- | --- |
| **Tier raised after review started** (e.g. review raises 🟡 → 🔴) | Requirements are re-evaluated on the **new** tier: a raise to 🔴 **re-blocks** the merge until explicit human approval is recorded. The label-change event re-runs the gate and re-evaluates `pair-explicit-approval`; the state drops back to `to-be-reviewed`. Tiers are raise-only (D17), so re-evaluation never loosens a requirement. |
| **Review subagent crashes or times out** | The `pair-review` check stays `pending` (or is published as `failure` with the error) — merge stays **blocked**, never silently open. The flow posts a PR comment with the re-run command so a human can restart the review. |
| **Force-push after approval** | Checks and reviews are per head commit: the new head has no `pair-review` check, so the merge is **blocked** and the review **re-runs on the new head**. Branch protection additionally sets `dismiss_stale_reviews` so a human approval does not survive a rewrite either. |
| **Code host without a required-check API** | **Degraded mode**, documented rather than silently skipped: the flow still computes and labels the state and still posts the verdict in the native review, but enforcement becomes advisory. `/setup-gates` reports the degradation and points to the host's **manual** branch-protection setup steps in its implementation guide; the project is told, explicitly, that merge blocking is not mechanical until those steps are applied. |
| **PR with no `risk:*` label** | Treated as 🔴 (fail-safe): the widest gate matrix **and** explicit human approval are required. |
| **Self-authored PR** (solo maintainer) | The code host rejects APPROVE on your own PR, so the verdict is recorded as a review comment led by the verdict token (see `/review`'s degradation). The `pair-review` check still carries the machine-readable conclusion, so enforcement is unaffected; at 🔴 the explicit human approval requirement is what a solo maintainer satisfies deliberately. |

## Who does what

| Actor | Responsibility |
| --- | --- |
| `/publish-pr` | Creates the PR, propagates the story's classification tags, registers `pair-review` as **pending**, labels the PR `pr-state:to-be-reviewed`, and triggers the review in a clean-context subagent (AC1) |
| `/review` | Produces the judgment verdict in the native review, publishes the `pair-review` check conclusion (`review_check_conclusion`), computes the state (`resolve_pr_state`), swaps the `pr-state:*` label, and refuses to merge unless `merge_allowed` passes |
| `/setup-gates` | Wires `pair-review` + `pair-explicit-approval` as required checks on the protected branch alongside the gate jobs, or reports degraded mode |
| Code host | Enforces: blocks the merge button while any required check is red, pending, or absent |
| Human | Fixes findings, gives the explicit approval at 🔴, and presses merge |

## Related

- [canonical-states.md](canonical-states.md) — the five work-item macrostates (`Review` is the macrostate a PR lives under)
- [quality-model.md](../../quality-assurance/quality-model.md) — §3.2 fail-safe tier, §4 per-tier requirements (the single source of the thresholds this flow reads)
- [tier-aware-pipeline.md](../../infrastructure/cicd-strategy/tier-aware-pipeline.md) — the gate side of the flow (tags-only pre-merge pipeline, fail-safe red)
- [`pr-state.sh`](../../../assets/pr-state.sh) — the provider-agnostic synthesis evaluator (`resolve_pr_state`, `merge_allowed`, `explicit_approval_required`, `review_check_conclusion`)
- [`tier-resolve.sh`](../../../assets/tier-resolve.sh) — the provider-agnostic, tags-only tier resolver
- [code-review-template.md](../templates/code-review-template.md) — the verdict-first review body whose verdict this flow consumes
- [github-implementation.md](github-implementation.md) — GitHub check-run + branch-protection mechanics for the two pair checks
