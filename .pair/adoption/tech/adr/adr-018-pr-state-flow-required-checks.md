# ADR-018: PR State Flow — Required Code-Host Checks as the Merge Authority (Labels Are a View)

## Status

Accepted

## Date

2026-07-28

## Context

- Story #234 (epic #208) delivers the **gate ≠ review** PR flow: mechanical gates first, judgment
  review at green gates, and the synthesis of `gates × review verdict × risk tier × explicit approval`
  as the PR state (`to-be-reviewed` → `ready-to-merge` / `not-approved`). R5.4 fixes the ordering
  (gate is the first filter); R5.7 requires that the pair review be registered as a **required**
  code-host check; D10 adds the 🔴 requirement of an explicit human approval.
- The gate side already exists and is deterministic: the pre-merge pipeline (#258) reads the `risk:*`
  label only (D18) via the shipped `tier-resolve.sh`, fail-safe 🔴 when untagged, and `verify-quality`
  (#259) mirrors it locally through the same helper.
- What did **not** exist is an enforcement point for the review half. Review was documented as "always
  runs" (R5.3/D10) but nothing mechanically prevented merging a PR whose review never ran, crashed
  mid-flight, or was simply skipped — and nothing prevented merging a 🔴 PR with no human approval.
- pair already exposes state as chromatic **labels** (`risk:*`, `cost:*`). Extending that pattern to
  PR state (`pr-state:*`) is natural for humans and for tag-filter automation (`pair-next`), but a
  label is trivially mutable by anyone with write access and is not evaluated by branch protection —
  so it cannot be the thing that authorizes a merge.
- The review verdict itself is judgment produced by an agent, and the agent must not be able to grant
  itself merge rights: the authorization surface has to live outside the reviewing agent.

## Options Considered

### Option 1: Labels as the state machine, merge policed by convention

- **Description**: The review flow applies `pr-state:ready-to-merge`; humans and automation are
  expected to only merge PRs carrying that label.
- **Pros**: Zero host configuration; works identically on every code host; visible at a glance.
- **Cons**: Not enforcement — anyone (or any automation, or an agent with a stale view) can merge a
  PR whose label is wrong, missing, or hand-applied. A crashed review leaves **no** label at all, which
  is indistinguishable from "not yet evaluated" and blocks nothing. Directly violates R5.7 ("the review
  can never be skipped") and gives 🔴 PRs no mechanical approval trail for audit.

### Option 2: A single required check that also encodes the tier requirement

- **Description**: One `pair-merge-gate` check whose conclusion is the synthesized state — success only
  when gates are green, the review approved, and (at 🔴) a human approved.
- **Pros**: One context to require on the protected branch; one place to compute everything.
- **Cons**: Collapses two different authorities into one opaque check: the review verdict (produced by
  the reviewing agent) and the human-approval assertion (which must **not** be assertable by that agent).
  A reviewing agent that publishes a single success conclusion effectively self-grants the 🔴 human
  approval. It also hides *which* condition is unmet in a single red check, and re-evaluating on a label
  change would require the agent to re-run rather than a deterministic host job.

### Option 3: Two required checks — agent-published verdict + deterministic approval job (chosen)

- **Description**: `pair-review` (published by the review flow on the head commit as a **commit status**
  — the Checks API is writable only by a GitHub App installation token, while branch protection accepts a
  status context as a required check identically: `success` on
  APPROVED/TECH-DEBT, `failure` on CHANGES-REQUESTED, left **pending** when no decision exists) plus
  `pair-explicit-approval` (a deterministic host job that reads the `risk:*` label only, auto-passes
  below 🔴, and at 🔴 asserts a non-bot, non-author approving review on the current head). Both are
  required status checks; `pr-state:*` labels are a **view** of the same synthesis.
- **Pros**: The merge authority is branch protection, not an agent's opinion or a mutable label; the
  agent cannot satisfy the human-approval requirement (it is asserted by a deterministic job reading the
  host's own review records); a crashed/never-run review leaves a **pending** required check, so the
  fail-safe direction is "blocked", not "open"; per-head semantics give force-push invalidation for free;
  a tier raise re-evaluates via the `labeled`/`unlabeled` trigger already introduced in #258; each unmet
  condition is legible as its own red/pending check.
- **Cons**: Two contexts to wire (mitigated: `setup-gates` Step 4.5 does it and is idempotent); hosts
  without a required-check API degrade to advisory enforcement (documented degraded mode, reported
  rather than silently assumed); the checks are host artifacts, so the host mechanics live in an
  implementation guide instead of the host-agnostic model.

## Decision

**Adopt Option 3.** The merge authority is the set of **required code-host checks**; the `pr-state:*`
label is an advisory view that can never enable a merge. Concretely:

- The **model** — three states, the synthesis table, the check contracts, fail-safe and edge cases —
  lives in one KB guideline, `guidelines/collaboration/project-management-tool/pr-states.md`, the
  pull-request companion to `canonical-states.md`.
- The **synthesis is executable and shared**: `assets/pr-state.sh` (`resolve_pr_state`, `merge_allowed`,
  `explicit_approval_required`, `review_check_conclusion`), provider-agnostic and composed by the skills
  and by host jobs alike — the same "one executable projection" pattern as `tier-resolve.sh`, so the
  flow cannot drift between local reasoning and CI.
- **No criteria in the flow** (D18): the tier is read from the `risk:*` label via `resolve_tier`;
  per-tier requirements (reviewers, SLA, checklist depth, explicit approval) are read from
  `quality-model.md` §4 through `Argument > Adoption > KB default`. Untagged/malformed ⇒ 🔴 (fail-safe),
  consistent with the gate side.
- **Gate before judgment** (R5.4): a red gate caps the review decision and the synthesis can never
  return `ready-to-merge` while any mechanical check is red.
- **Host specifics** (check-run publication, branch-protection payload, the `pair-explicit-approval`
  job, manual/degraded setup) live in `github-implementation.md` (R2.12), not in the model.

## Consequences

- `publish-pr` registers `pair-review` as pending **before** dispatching the review to a clean-context
  subagent, so a PR is blocked from t0 and a dispatch failure defers the review instead of skipping it.
- `review` gains a step that publishes the check conclusion, resolves the tier requirements, and
  synthesizes/labels the state; its Phase 6 merge is preconditioned on `merge_allowed` and HALTs
  otherwise. The reviewing agent never edits branch protection and never bypasses a check.
- `setup-gates` wires both contexts (idempotently) and reports **degraded** enforcement when the host
  or token cannot configure protection — the degradation is visible, never assumed away.
- 🔴 PRs carry a mechanical, auditable explicit-approval trail (a human, non-author approving review on
  the merged head), satisfying the compliance angle of the story without a new artifact.
- **Consequence accepted knowingly: a 🔴 merge requires a second human account.** GitHub rejects an
  approving review from the PR author, so on a single-maintainer repository (including this one) no 🔴 PR
  can reach `ready-to-merge` while `pair-explicit-approval` is a required context. Such a project either
  adds a second human reviewer account or deliberately leaves that context out of the required list and
  records the 🔴 rule as advisory. An alternative solo-approval token (a human-applied `approved:human`
  label with actor verification, or an `/approve` comment command) is a **design change deferred to its
  own story** — it is intentionally absent here rather than half-specified.
- **Ordering is part of the decision**: the workflow job and the `pr-state:*` labels must exist and be
  observed reporting on a real PR *before* the protection is written (and `enforce_admins` enabled),
  otherwise a required context that never reports blocks every merge with no escape hatch.
- Adding a code host means adding an implementation-guide section, not touching the model or the
  evaluator. Hosts lacking required checks remain usable in advisory mode.
- Verification split per the gate-tooling ADL (2026-07-13): `pr-state.sh` behavior is executed by
  `scripts/smoke-tests/scenarios/pr-state-flow.sh`; the content invariants of the guideline and the
  skills are asserted in `packages/knowledge-hub/src/conformance/pr-state-flow.test.ts`.
- Applying the branch protection to a real repository (including this one) is a **repo-configuration**
  act with admin scope — out of a code change's reach and left to a human, which is why `setup-gates`
  reports the degraded state rather than assuming success.

## Adoption Impact

- `way-of-working.md`: Quality Gates section gains the required-check line for the two pair checks
  (surfacing; the same place the tiering and coverage-guardrail flags live).
- KB: new `pr-states.md` + `assets/pr-state.sh`; `quality-model.md` §4 gains a pointer to the flow
  (criteria stay in the model); `github-implementation.md` gains the host recipe.
- Docs site: new `concepts/pr-state-flow` page, cross-linked from `concepts/tag-driven-gates`.
