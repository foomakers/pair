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

### Amendment (2026-08-28) — Option 4 adopted: a dedicated review identity + an adoption-gated light auto-approval row

Story [#218](https://github.com/foomakers/pair/issues/218) adopts **Option 4**, which this ADR deferred above
("A distinct reviewer identity stays out of scope, deliberately"). The deferral was correct for #234 — the
identity is project infrastructure — and what changes here is not that fact but who provides it: the flow now
**consumes** an identity a project provisions, instead of pretending none can exist. Option 3 is unchanged and
still the design; this amendment layers a credential resolution step and one adoption-gated row on top of it.

**What is adopted.**

1. **A dedicated review identity, resolved through a host-agnostic adapter.** The skills that write to the code
   host (`/pair-process-review` Steps 5.3–5.4, `/pair-capability-publish-pr` Phase 5) no longer assume the
   session token. They resolve **which credential executes the host write** through one executable projection,
   `assets/review-identity.sh` — seven entry points, and a host adapter is wired from **all seven**:
   `review_identity_kind_ok` (validates the adoption value, so present-but-unparseable HALTs instead of
   degrading to `none`), `resolve_identity_mode`, `review_identity_exclusion_ok` (**security-critical**: an
   adapter wired from a list that omits it lets a bot-user identity with no `REVIEW_IDENTITY_LOGIN` resolve to
   `identity` and sign the 🔴 human approval), `review_identity_health` (**the runtime source of the `healthy`
   flag** — see below), `identity_verdict_event`,
   `pair_review_publication_mode`, `identity_audit_comment` — the same "one executable projection" pattern as
   `tier-resolve.sh` and `pr-state.sh`, so the recipe, the skills and the tests read one text. Three modes, and
   only three: `identity` (configured and usable), `session` (none configured — **today's behavior**, not an
   error), `halt` (configured but unusable).
2. **A native verdict and, on the App path, the Checks API.** With an identity resolved the reviewer is not the
   author, so GitHub's self-approval rejection no longer applies: the verdict is a **native APPROVE /
   REQUEST_CHANGES** by the identity rather than the `--comment` degradation, and a GitHub App identity holds
   `checks: write`, so `pair-review` publishes as a **check run**. Both are *upgrades of a degraded path*: the
   `--comment` verdict (which `session` mode still produces on a **self-authored** PR) and the commit status
   remain exactly what that mode does, and remain documented.
3. **An adoption-gated light auto-approval row.** `light_auto_approve_allowed` ships beside `resolve_pr_state`
   in `pr-state.sh` and yields approve/no-op from four inputs — adoption declares `light` in
   `## Tag Projection`, the PR carries the `light` tag, the tier is **below red**, and `resolve_pr_state`
   already synthesized `ready-to-merge`. It reads tags, a declaration and the synthesis: **zero classification
   criteria** (D18), no "lightness" is ever computed. Adoption is the gate, not the label: a hand-applied
   `light` label on a repository that declares no projection triggers nothing.

**What is NOT changed — stated because this is the part that is easy to get wrong.**

- **The 🔴 human-approval requirement stands — and it is now enforced by two clauses, not one.**
  `human_approval_jq_filter` still requires `user.type == "User"`, which excludes a GitHub **App** installation
  (it types as `"Bot"`). It does **not** exclude a **bot user**: that is an ordinary account and types as
  `"User"`, so the type clause alone would have let a machine account satisfy `pair-explicit-approval` on a
  `risk:red` PR. The filter therefore also excludes the identity by **login**
  (`.user.login != env.REVIEW_IDENTITY_LOGIN`), and `review_identity_exclusion_ok` makes an unprovisioned login
  a **not-healthy** identity so the flow HALTs rather than running with the clause inert. This is the single
  change to a shipped predicate in this amendment, and it is additive: with the variable unset the clause
  matches nothing and every prior outcome is unchanged. A `risk:red` PR still requires an explicit approval
  from a second human account; light applies **below red only**. This is the one line of Option 4's Cons that
  is *not* being reversed here: we take the identity's auditability and native verdict, and we decline the rule
  change it tempted.
- **A native `APPROVE` *by the identity* is authorized by the light row and by nothing else.**
  `light_auto_approve_allowed` is an input to `identity_verdict_event`, so an approving verdict the identity
  would sign outside the row is submitted as a comment-form review. The row governs the review cast **on the
  project's behalf**; it is not read in `session` mode, where the acting account signs its own review exactly as
  it did before this amendment. Without that wiring the row's four conditions would gate nothing: on a repository with
  `required_approving_review_count >= 1` any approving native review satisfies the host's approvals rule on its
  own, tagged `light` or not, declared or not. `REQUEST_CHANGES` is ungated — it blocks, it never unlocks.
- **`session` mode keeps the NATIVE verdict; the comment form is the self-review case, not the mode.** The
  `--comment` verdict is the workaround for one host rule — GitHub rejects an APPROVE / REQUEST_CHANGES on a PR
  you authored. With no identity configured and a *second* maintainer reviewing, the host accepts the native
  event and always did: `identity_verdict_event` therefore takes a fourth argument, `self_authored`, and returns
  COMMENT in `session` mode only when the acting account is the author or authorship could not be read
  (fail-safe). Collapsing every `session` verdict to COMMENT would have removed a real change request (nothing
  blocking the merge button) and a real approval (nothing counting toward `required_approving_review_count`) on
  every two-human repository — i.e. it would have made the identity mandatory to keep behavior a project already
  had.
- **The adoption read is two questions — presence, then value — and present-but-unparseable HALTs.** `none`
  is not a neutral default: it means *no identity*, so it resolves `session` and the review is written (and,
  where the host counts it, APPROVED) with the **session token**. An extraction that recognises only one
  markdown shape and degrades everything else to `none` is therefore the session-user fallback this amendment
  forbids, reached with **no HALT** because the flow never learns an identity was configured. Presence is now
  detected format-agnostically, the value is validated by `review_identity_kind_ok` (the adapter owns the
  vocabulary, so a host guide's snippet cannot drift from what `review_identity_exclusion_ok` and
  `pair_review_publication_mode` accept), and only a genuinely absent key becomes `none`. Both consumer surfaces
  enumerate every entry point, `review_identity_exclusion_ok` included, since a host adapter wired from a list
  that omits it lets a bot-user identity with no `REVIEW_IDENTITY_LOGIN` resolve to `identity`.
  **Presence is anchored to a KEY AT THE START OF A LINE — optional list/bold decoration, the phrase, then a
  colon — not to the bare phrase and not to the phrase-then-colon anywhere in a line.** A
  `grep -qi 'Review identity'` over the whole adoption file also matches *prose*, so a project that runs no
  identity, deletes the key and keeps one explanatory sentence ("we use no dedicated review identity — reviews
  run with the session token") is read as configured, extracts nothing, and HALTs every review and every publish
  — being told to declare an identity it deliberately has not got. Requiring the colon narrows that but does not
  close it: an unanchored `(^|[^[:alnum:]])` match still fires mid-sentence ("A note on review identity: we
  deliberately run none"), with the same permanent-outage outcome. The **line**-anchored form still fires on both
  unparseable shapes the design must HALT on (`- Review identity: app`, `**Review identity**: bot-user`), which
  are line-leading, colon-terminated keys.
- **`healthy` is COMPUTED PER RUN, by `review_identity_health`, and the health probes are split in two.** It is
  the single signal separating `identity` from `halt`, and it shipped with no runtime source at all: the host
  guide's publication snippet carried an inert `PROBES_PASSED=0  # set to 1 by whatever ran step 5's probes`
  that nothing in the corpus ever set, while step 5's probes are explicitly setup-time because they leave
  artifacts (a check run cannot be deleted). Both readings were broken on a **correctly provisioned**
  repository: taking the guide literally left `healthy` 0 forever ⇒ `resolve_identity_mode 1 0` ⇒ `halt` on
  every review; re-running the setup probes per review branded every reviewed head with a neutral
  `pair-identity-probe` check run plus a posted/deleted scratch comment. So the question is split — **per run**:
  cheap, artifact-free probes (the credential authenticates and is scoped to this repository; the grants are
  observed without writing — on GitHub the App's installation-token exchange requested with explicit
  `permissions`, which GitHub 422s when the installation lacks one, or the bot account's repository-permission
  read); **at setup, once**: the probes that must write to prove a write grant. What a read probe cannot prove
  at run time is covered by one rule, stated on all three surfaces: a `403`/`422` met **mid-write is a HALT**,
  reported against the artifact that failed — never a retry with the session token, and never a `pair-review`
  publication implying a review that did not land.
- **The review identity must not be an account that opens pull requests, and the mechanism backs the rule up.**
  Nothing forbade it, and `<self_authored>` was read in `session` mode only — so an unattended-delivery project
  that implements and publishes as `acme-bot` and then declares that same `acme-bot` as its `bot-user` identity
  passed health, resolved `identity`, and had every native event rejected by the host
  (`422 Can not request changes on your own pull request`). The verdict never landed as a review while the
  separate publication step still marked `pair-review` `success`: an approving verdict as a green required check
  on a PR carrying no review body. `identity_verdict_event` therefore reads authorship in **both** modes, with
  **per-mode defaults that are deliberately asymmetric** — unknown ⇒ self-authored in `session` (the acting
  account routinely is the author), unknown ⇒ *not* self-authored in `identity` (setup forbids it, and the other
  default would collapse every identity verdict to COMMENT and delete the feature). A wrong guess there is loud
  (the host answers 422) rather than silent, and Step 5.3's read-back now has a defined action: a review the
  read does not show is `Review: NOT SUBMITTED`, the resolved check is **not** published, and the pending one
  stays in place. **The rule covers both forms and is now a health input, not only a verdict degradation**: a
  GitHub App authors pull requests, so "an App is never a PR author" was false and the one-credential setup —
  one App opening the PR and reviewing it — would have HALTed mid-write on every review it ever ran. The
  per-run probe compares the acting principal against the PR author on **both** paths and answers *not healthy*
  ⇒ `halt` **before any host write**; the COMMENT degradation stays as the in-flow fail-safe for a host adapter
  that runs no such probe or whose authorship read failed. **The comparison carries two login shapes, not one**:
  `gh` renders one Bot actor as `app/<app-slug>` through GraphQL (`gh pr view --json author`) and as
  `<app-slug>[bot]` through REST (`.user.login`). A gate written against a single shape is inert on the path
  that emits the other — measured on a public App-authored PR, `gh pr view 14276 --repo cli/cli --json author
  -q .author.login` ⇒ `app/dependabot` while `gh api repos/cli/cli/pulls/14276 --jq .user.login` ⇒
  `dependabot[bot]` — so the containment above is only real because both are compared.
- **One producer per required context, including across a `Review identity` switch.** `pair-review` is now
  dual-form (check run on `app`, commit status otherwise) and the form is resolved *independently* by
  `/pair-capability-publish-pr` at PR creation and by `/pair-process-review` at Step 5.4. A pull request opened
  under one value and reviewed under another would therefore carry two independent records for one required
  context — the stale one cleared by nothing — and a merge that may stay blocked on it. The rule the ADR already
  applied to `pair-explicit-approval` extends here: **drain** the open pull requests before changing
  `Review identity` (the exit that always works), or supersede the outgoing form on the head with the same
  conclusion (needs `statuses: write` on the App going one way, the retired App's own token going the other).
- **The idempotency skip covers the publication acts only.** Step 5.3 submits a *fresh* native review on every
  re-invocation, so a re-review on an unchanged head is a new identity action: skipping from Step 5.4 straight
  past Step 5.4b would leave an identity `APPROVE` with no paired audit comment and no `Light row:` line — the
  reason no longer reconstructable from the PR, which is the property the audit exists to guarantee.
- **The PR-state synthesis is unconditional.** `resolve_pr_state` is called once per review, in its own step,
  in **all three modes and for every verdict** — Step 5.4 publishes exactly one `pr-state:*` label on every run,
  so the call can never be nested inside the (identity-only, APPROVED-only) APPROVE-authority step.
- **`resolve_pr_state`'s table is untouched.** No row is added, removed, or reordered; the light row is a
  **sibling** function that consumes its output. A green/yellow PR still reaches `ready-to-merge` and a human
  still merges — the light row changes *who supplies the host's required approving review*, never what the
  synthesis decides.
- **`pair-review` remains anti-accident, not authorization**, in `session` mode. On the App path it becomes a
  check run whose `app_id` the repository's own workflows cannot present, which is precisely the residual this
  ADR recorded as "eliminated only by the GitHub-App/check-run form" — so the residual shrinks for projects
  that provision an App, and is unchanged for those that do not.
- **No identity configured is not an error.** `session` mode is the shipped behavior in full. The HALT applies
  only to `identity`-configured-but-broken: a missing permission or an invalid credential stops the flow with a
  pointer to the host guide's *Dedicated review identity* section, and **never** silently falls back to the
  session user — a review silently attributed to the human whose token happened to be loaded is worse than a
  stopped review.
- **Host mechanics stay in the implementation guide** (R2.12): GitHub App vs bot user, permissions, install and
  credential storage live in `github-implementation.md`; the skills and the adapter name no host.

**Residual, recorded rather than assumed away — declaring the `light` family makes the label a
merge-authorizing capability.** "Adoption is the gate, the label is not" contains the mis-tagging abuse only on
repositories that never declared the family. On one that did, and that sets `required_approving_review_count >= 1`,
nothing in the flow verifies **who** applied the tag: any collaborator with write or triage access can label
their own sub-🔴 PR `light`, and the identity's authorized `APPROVE` then satisfies the host's approvals rule with
no second person. That is the row working as designed, not a defect — but it means the declaration is an
authorization decision, so `light` must be access-controlled (applied from classification; manual application
restricted and audited) wherever the family is declared. The 🔴 gate is unaffected: `light` is inert at red.
Stated on all three consumer surfaces (`pr-states.md`, `github-implementation.md`, the docs page) so an adopter
meets it before opting in. It is **inert in this repository** — `Active: risk` only.

**Verification status.** Everything above is implemented and asserted against fixtures — the identity ×
`light` × tier × verdict matrix runs offline in `scripts/smoke-tests/scenarios/review-identity.sh`, the contracts
in `packages/knowledge-hub/src/conformance/review-identity.test.ts`. What is **not** yet observed on a live host
is the end-to-end run with a real App (native APPROVE attributable to the identity, `pair-review` as a check
run, a `light` sub-red PR mergeable with no human action): that needs a maintainer-provisioned App and is
tracked as story #218's task T11. Because no live-host run has been observed, the **JWT → installation-token
exchange** is documented in the form GitHub itself documents — `curl -H "Authorization: Bearer $JWT"` — rather
than relying on `gh`'s own auth scheme being accepted for an App JWT: a `401` there is indistinguishable from a
bad signature, and an unverifiable snippet at step 4 makes the whole App path unprovisionable by following the
guide. Nothing in this repository enables the row — `tech/risk-matrix.md` declares
`Active: risk` only, so the light row is **inert here** and its absence is grep-verifiable.

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
- ~~**A distinct reviewer identity stays out of scope**, deliberately (Option 4): the dispatched reviewer
  runs as the author's account, so its verdict is a `--comment` review by construction, and a second
  human account remains the only way to satisfy 🔴.~~ **Superseded by the 2026-08-28 amendment above**
  (story [#218](https://github.com/foomakers/pair/issues/218)): Option 4 is adopted as a *consumed*
  identity — the flow resolves a project-provisioned identity through a host-agnostic adapter, and falls
  back to exactly the behavior described here when none is configured. The half of this bullet that
  still holds is the last one: **a second human account remains the only way to satisfy 🔴** — the
  identity's approval is excluded by **account type** for an App (`user.type == "User"`) and by **login**
  (`REVIEW_IDENTITY_LOGIN`) for a bot user, which types as `"User"` like any other account. The amendment
  **adds** that login clause — the one shipped-predicate change it makes, additive and inert while the
  variable is unset — and provisioning it is a setup step (`review_identity_exclusion_ok` HALTs the flow
  until it is). What the amendment does not do is relax the human requirement.
  The solo-approval token stays a separate design question
  ([#398](https://github.com/foomakers/pair/issues/398)), which needs this story's identity only for
  forgery-resistance and is not needed by it.
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

Added by the 2026-08-28 amendment (story #218):

- KB: new `assets/review-identity.sh` (the identity adapter projection); `pr-state.sh` gains
  `light_auto_approve_allowed`; `github-implementation.md` gains § *Dedicated review identity*;
  `pr-states.md` gains the identity actor row and the one-line 🔴 rule.
- `way-of-working.md` (template + this repo): a `Review identity` line under Quality Gates — `none` by
  default, so adopting the identity is an explicit project act.
- `tech/risk-matrix.md`: unchanged — `Active: risk`, so the light row ships **inert** on this repository.
- Docs site: new `concepts/review-identity` page, cross-linked from `concepts/pr-state-flow`.
