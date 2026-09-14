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
  APPROVED, `failure` on CHANGES-REQUESTED, left **pending** when no decision exists) plus
  `pair-explicit-approval` (a deterministic host job that reads the `risk:*` label only, auto-passes
  below 🔴, and at 🔴 asserts a non-bot, non-author approving review on the current head). Both are
  required status checks; `pr-state:*` labels are a **view** of the same synthesis.
- **Pros**: The merge authority is branch protection, not an agent's opinion or a mutable label; the
  agent cannot satisfy the human-approval requirement **as long as the context's producer is pinned**
  (`required_status_checks.checks[].app_id` — see the third property below; it is asserted by a
  deterministic job reading the host's own review records, and a status posted by the agent's own token
  does not count); a crashed/never-run review leaves a **pending** required check, so the
  fail-safe direction is "blocked", not "open"; per-head semantics give force-push invalidation for free;
  a tier raise re-evaluates via the `labeled`/`unlabeled` trigger already introduced in #258; each unmet
  condition is legible as its own red/pending check.
- **Cons**: Two contexts to wire (mitigated: `setup-gates` Step 4.5 does it and is idempotent); hosts
  without a required-check API degrade to advisory enforcement (documented degraded mode, reported
  rather than silently assumed); the checks are host artifacts, so the host mechanics live in an
  implementation guide instead of the host-agnostic model.

### Option 4: A separate reviewer identity (second human account, or a GitHub App)

- **Description**: The reviewing agent authenticates as its **own** identity — a second user account or a
  GitHub App installation — instead of as the author. Its native review is then a real `APPROVE` event by
  a non-author, and the 🔴 explicit-approval requirement could be satisfied by a reviewer that is not the
  author (with the human approval still required as a second, human-typed signal, or replaced by it).
- **Pros**: Removes the two constraints this design accepts — the verdict would be a native APPROVE
  instead of a `--comment` degradation, and the App path additionally unlocks the Checks API
  (`checks: write`), so `pair-review` could be a real check run rather than a commit status. It also makes
  "who reviewed" auditable per-identity rather than per-body-token.
- **Cons / why not now**: An identity is **project infrastructure**, not a code change — it needs a
  second seat (or an App registration, install, private key, and a secret store), which the flow cannot
  provision for an adopting project and which a solo-maintainer repository may not want to pay for. It
  also does **not** by itself satisfy the 🔴 rule as specified: a bot/App approval is exactly what
  `pair-explicit-approval` excludes (`user.type == "User"`), so adopting it would mean *changing the rule*
  (deciding that a distinct non-human reviewer identity may grant the 🔴 gate) — a design decision, not a
  configuration one. **Deferred, explicitly**: it is the same missing ingredient as the second-human-account
  constraint below, and it belongs to the same follow-up story as the solo-approval token, where the two
  options (human token vs. distinct reviewer identity) are weighed together instead of one being adopted
  by accident: [#398](https://github.com/foomakers/pair/issues/398).

## Decision

**Adopt Option 3.** The merge authority is the set of **required code-host checks**; the `pr-state:*`
label is an advisory view that can never enable a merge. Concretely:

- The **model** — three states, the synthesis table, the check contracts, fail-safe and edge cases —
  lives in one KB guideline, `guidelines/collaboration/project-management-tool/pr-states.md`, the
  pull-request companion to `canonical-states.md`.
- The **synthesis is executable and shared**: `assets/pr-state.sh` (`resolve_pr_state`, `merge_allowed`,
  `explicit_approval_required`, `review_check_conclusion`, `human_approval_jq_filter`), provider-agnostic
  and composed by the skills
  and by host jobs alike — the same "one executable projection" pattern as `tier-resolve.sh`, so the
  flow cannot drift between local reasoning and CI. The 🔴 approval **predicate** is part of that
  projection on purpose: shipped as `human_approval_jq_filter`, the host workflow and the tests that
  verify it read one text, so authorization logic cannot exist only as prose in a doc code block with a
  hand-copied twin in a test.
- **No criteria in the flow** (D18): the tier is read from the `risk:*` label via `resolve_tier`;
  per-tier requirements (reviewers, SLA, checklist depth, explicit approval) are read from
  `quality-model.md` §4 through `Argument > Adoption > KB default`. Untagged/malformed ⇒ 🔴 (fail-safe),
  consistent with the gate side.
- **Gate before judgment** (R5.4): a red gate caps the review decision and the synthesis can never
  return `ready-to-merge` while any mechanical check is red.
- **Host specifics** (check-run publication, branch-protection payload, the `pair-explicit-approval`
  job, manual/degraded setup) live in `github-implementation.md` (R2.12), not in the model.
- **The explicit-approval job is an authorization control, and is designed as one.** "Deterministic"
  is only true if its code cannot come from the change it authorizes, so two properties are part of the
  decision, not implementation detail:
  - **Trusted ref.** The job and every projection it sources are read from the **target branch**
    (`pull_request_target` + a checkout pinned to `base.sha`), never from the PR's tree. Verified by
    counter-example: with the pre-fix `pull_request` + default-checkout form, a `risk:red` PR carrying a
    neutered `explicit_approval_required` published `pair-explicit-approval=success` on its own head —
    a self-granted 🔴 gate. With the base-pinned form the identical tamper changes nothing.
  - **Head-pinned verdict.** The result is published as a commit status on
    `github.event.pull_request.head.sha` — the only commit branch protection evaluates. `$GITHUB_SHA` is
    *not* that commit for either trigger (measured: base tip for `pull_request_target`, the
    `refs/pull/<n>/merge` commit for `pull_request_review`), so a verdict published against it would
    leave a 🔴 PR blocked *after* the human approves.
  - **Pinned producer + pending-first.** A commit status is writable by **any** principal with push
    access, for any context name, and protection evaluates the most recent status per context — so an
    unpinned context is satisfied by one `POST …/statuses/$HEAD_SHA -f context='pair-explicit-approval'`
    from the very token the reviewing agent holds (it needs `repo:status` to publish `pair-review`). The
    protection payload therefore uses the **`checks` form with `app_id`** pinned to the producer
    (GitHub Actions), not the legacy `contexts` array, and the job publishes **`pending` as its first
    step** so a cancelled/aborted re-evaluation cannot leave a stale lower-tier `success` standing.
    Residual, recorded rather than assumed away: a PR that *adds* a workflow requesting
    `statuses: write` can still post as the Actions app — narrowed by the two companion repository
    settings (default `GITHUB_TOKEN` permissions read-only, `CODEOWNERS` + `require_code_owner_reviews`
    on `/.github/workflows/**`), and eliminated only by the GitHub-App/check-run form (Option 4).
- **`pair-review` is an anti-accident control, not an authorization control** — stated here because the
  Pros above are otherwise easy to over-read. It is published with the authoring/reviewing agent's own
  token, so it is **forgeable by any push-access principal by construction** (an `app_id` pin is
  impossible: no app publishes it). What it guarantees is that a review which never ran, crashed, or was
  skipped leaves the context absent/pending and the merge blocked — i.e. it removes the *accident*, not
  the *forgery*. This is strictly stronger than the label of Option 1 in exactly one respect (an
  absent/pending status blocks, a missing label does not), and no stronger in mutability. The
  identity/authorization half is `pair-explicit-approval`'s, which is why the design keeps two checks.
  A genuinely unforgeable verdict requires a distinct GitHub App publishing a check run whose `app_id`
  the repository's own workflows cannot present — Option 4, deferred with
  [#398](https://github.com/foomakers/pair/issues/398).

  A project unwilling to enable `pull_request_target` gets the same guarantee by inlining the projection
  into the job (no checkout at all), at the cost of a second copy to keep in sync.
- **The review is dispatched, never nested, and never merges.** `/pair-capability-publish-pr` runs inside `/pair-process-implement`'s
  handoff subagent, so it returns a `review-dispatch-required` signal and the **top-level session**
  spawns the reviewing subagent (harnesses commonly forbid nested delegation, which would have made the
  documented primary path unreachable). The dispatch prompt is bounded to phases 1–5, and `/pair-process-review`
  carries a **non-interactive contract** for its two human prompts so a dispatched review neither stalls
  nor self-answers itself into a merge. The merge stays a human act at every tier.

## Consequences

- `publish-pr` registers `pair-review` as pending **before** dispatching the review to a clean-context
  subagent, so a PR is blocked from t0 and a dispatch failure defers the review instead of skipping it.
- `review` gains a step that publishes the check conclusion, resolves the tier requirements, and
  synthesizes/labels the state; its Phase 6 merge is preconditioned on `merge_allowed` and HALTs
  otherwise. The reviewing agent never edits branch protection and never bypasses a check.
- **Both merge paths carry the same precondition, not just the reviewer's.** The flow has two mergers —
  `/pair-process-review` Phase 6 (Step 6.0) and `/pair-process-implement` Phase 4 (Step 4.1, the author
  re-invoked after approval, which is where every *dispatched* review routes by contract). A precondition
  on only one of them is no precondition: the same re-synthesis + `merge_allowed` HALT is required in
  both, and both are asserted by the conformance suite. This matters most in the documented advisory
  mode (protection not yet applied), where nothing host-side blocks.
- `setup-gates` wires both contexts (idempotently) and reports **degraded** enforcement when the host
  or token cannot configure protection — the degradation is visible, never assumed away.
- 🔴 PRs carry a mechanical, auditable explicit-approval trail (a human, non-author approving review on
  the merged head), satisfying the compliance angle of the story without a new artifact.
- **Consequence accepted knowingly: a 🔴 merge requires a second human account.** GitHub rejects an
  approving review from the PR author, so on a single-maintainer repository (including this one) no 🔴 PR
  can reach `ready-to-merge` while `pair-explicit-approval` is a required context. Such a project either
  adds a second human reviewer account or deliberately leaves that context out of the required list and
  records the 🔴 rule as advisory. An alternative solo-approval token (a human-applied `approved:human`
  label with actor verification, or an `/approve` comment command) is a **design change tracked as
  [#398](https://github.com/foomakers/pair/issues/398)** — intentionally absent here rather than
  half-specified.
- **Ordering is part of the decision**: the workflow job and the `pr-state:*` labels must exist and be
  observed reporting on a real PR *before* the protection is written (and `enforce_admins` enabled),
  otherwise a required context that never reports blocks every merge with no escape hatch.
- Adding a code host means adding an implementation-guide section, not touching the model or the
  evaluator. Hosts lacking required checks remain usable in advisory mode.
- **A distinct reviewer identity stays out of scope**, deliberately (Option 4): the dispatched reviewer
  runs as the author's account, so its verdict is a `--comment` review by construction, and a second
  human account remains the only way to satisfy 🔴. The identity question is recorded here so it is not
  rediscovered per project; it is weighed in the same follow-up story as the solo-approval token
  ([#398](https://github.com/foomakers/pair/issues/398)).
- **Merge blocking was verified end-to-end on a live code host** (throwaway repository, 2026-07-30):
  labels → workflow → contexts observed on the head commit → protection applied with
  `enforce_admins: true` → one PR per tier. Observed: a **pending** `pair-review` blocks
  (`Required status check "pair-review" is pending.`), a **failing** one blocks, an **absent** one blocks
  as "expected", 🟢 with both contexts green **merges**, 🔴 without a human approval blocks, a 🟡→🔴 raise
  re-blocks within one run, a `pull_request_review` submission re-reports the approval context **on the
  same head SHA**, and the tampered PR above stays blocked. The evidence table lives in
  `github-implementation.md` § "Verified on a throwaway repository". It is a **point-in-time
  observation**, not re-auditable evidence: the sandbox was disposable and is gone, so no run URL or API
  dump survives, and the rows are re-verified by re-running the documented ordering steps on the adopting
  repository (that is stated in the table's own preamble). The producer pin, the companion settings and
  the pending-first step were added after that session and are explicitly **not** covered by it.
  Applying protection to *this* repository remains a human act (admin scope) — see the way-of-working
  status line.
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
