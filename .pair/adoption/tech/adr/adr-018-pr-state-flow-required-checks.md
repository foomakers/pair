# ADR-018: PR State Flow — Required Code-Host Checks as the Merge Authority (Labels Are a View)

## Status

Accepted

## Date

2026-07-28

## Context

- Story #234 (epic #208) delivers the **gate ≠ review** PR flow: mechanical gates first, judgment
  review at green gates, and the synthesis of `gates × review verdict × risk tier × explicit approval`
  as the PR state (`to-be-reviewed` → `ready-to-merge` / `not-approved`). R5.4: the gate is the first
  filter; R5.7: the pair review is a **required** code-host check; D10: 🔴 needs an explicit human approval.
- The gate side exists and is deterministic: the pre-merge pipeline (#258) reads the `risk:*` label only
  (D18) via the shipped `tier-resolve.sh`, fail-safe 🔴 when untagged; `verify-quality` (#259) mirrors it
  locally through the same helper.
- The review half had **no** enforcement point. Review was documented as "always runs" (R5.3/D10) but
  nothing blocked merging a PR whose review never ran, crashed or was skipped — or a 🔴 PR with no human
  approval.
- pair exposes state as chromatic **labels** (`risk:*`, `cost:*`); `pr-state:*` labels suit humans and
  tag-filter automation (`pair-next`), but a label is mutable by anyone with write access and not
  evaluated by branch protection — it cannot authorize a merge.
- The agent must not grant itself merge rights: authorization lives outside the reviewing agent.

## Options Considered

### Option 1: Labels as the state machine, merge policed by convention

- **Description**: The review flow applies `pr-state:ready-to-merge`; humans and automation merge only
  PRs carrying it.
- **Pros**: Zero host configuration; identical on every code host; visible at a glance.
- **Cons**: Not enforcement — anyone can merge a PR whose label is wrong, missing or hand-applied; a
  crashed review leaves **no** label, blocking nothing. Violates R5.7 ("the review can never be skipped"); no mechanical 🔴
  approval trail for audit.

### Option 2: A single required check that also encodes the tier requirement

- **Description**: One `pair-merge-gate` check whose conclusion is the synthesized state — success only
  when gates are green, the review approved, and (at 🔴) a human approved.
- **Pros**: One context to require; one place to compute everything.
- **Cons**: Collapses two authorities into one opaque check: the review verdict (from the agent) and the
  human-approval assertion (which must **not** be assertable by that agent) — a single success
  self-grants the 🔴 approval. Hides *which* condition is unmet; a label change would need the agent to
  re-run, not a deterministic host job.

### Option 3: Two required checks — agent-published verdict + deterministic approval job (chosen)

- **Description**: `pair-review`, published by the review flow on the head commit as a **commit status**
  (the Checks API is writable only by a GitHub App installation token; branch protection accepts a status
  context as a required check identically): `success` on APPROVED, `failure` on CHANGES-REQUESTED,
  **pending** when no decision exists. Plus `pair-explicit-approval`, a deterministic host job that reads
  the `risk:*` label only, auto-passes below 🔴, and at 🔴 asserts a non-bot, non-author approving review
  on the current head. Both are required status checks; `pr-state:*` labels are a **view** of the same
  synthesis.
- **Pros**: The merge authority is branch protection, not an agent's opinion or a mutable label; the
  agent cannot satisfy the human-approval requirement **as long as the context's producer is pinned**
  (`required_status_checks.checks[].app_id`, see Decision; a status posted by the agent's own token does
  not count); a crashed/never-run review leaves a **pending** required check — fail-safe is "blocked";
  per-head semantics give force-push invalidation for free; a tier raise re-evaluates via the
  `labeled`/`unlabeled` trigger from #258; each unmet condition is its own red/pending check.
- **Cons**: Two contexts to wire (`setup-gates` Step 4.5 does it, idempotently); hosts without a
  required-check API degrade to advisory enforcement (reported, never silently assumed); host mechanics
  live in an implementation guide, not the host-agnostic model.

### Option 4: A separate reviewer identity (second human account, or a GitHub App)

- **Description**: The reviewing agent authenticates as its **own** identity (second user account or
  GitHub App installation), so its review is a real `APPROVE` by a non-author and could satisfy 🔴
  (with the human approval still required as a second signal, or replaced by it).
- **Pros**: A native APPROVE instead of the `--comment` degradation; on the App path the Checks API
  (`checks: write`), so `pair-review` could be a check run; "who reviewed" auditable per identity, not
  per body token.
- **Cons / why not now**: An identity is **project infrastructure** — a second seat, or an App
  registration, install, private key and secret store — which the flow cannot provision and a
  solo-maintainer repository may not want to pay for. Nor does it satisfy the 🔴 rule as specified: a
  bot/App approval is what `pair-explicit-approval` excludes (`user.type == "User"`), so adopting it
  would *change the rule* — a design decision, not configuration. **Deferred, explicitly**, to the same
  follow-up as the solo-approval token, so human token vs. distinct reviewer identity are weighed
  together: [#398](https://github.com/foomakers/pair/issues/398).

## Decision

**Adopt Option 3.** The merge authority is the set of **required code-host checks**; the `pr-state:*`
label is an advisory view that can never enable a merge.

- The **model** — three states, synthesis table, check contracts, fail-safe and edge cases — lives in one
  KB guideline, `guidelines/collaboration/project-management-tool/pr-states.md`, the pull-request
  companion to `canonical-states.md`.
- The **synthesis is executable and shared**: `assets/pr-state.sh` (`resolve_pr_state`, `merge_allowed`,
  `explicit_approval_required`, `review_check_conclusion`, `human_approval_jq_filter`),
  provider-agnostic, composed by skills and host jobs alike — the `tier-resolve.sh` "one executable
  projection" pattern, so local reasoning and CI cannot drift. The 🔴 approval **predicate** ships there
  as `human_approval_jq_filter`, so the host workflow and its tests read one text, never prose plus a
  hand-copied twin.
- **No criteria in the flow** (D18): tier from the `risk:*` label via `resolve_tier`; per-tier
  requirements (reviewers, SLA, checklist depth, explicit approval) from `quality-model.md` §4 through
  `Argument > Adoption > KB default`. Untagged/malformed ⇒ 🔴 (fail-safe), as on the gate side.
- **Gate before judgment** (R5.4): a red gate caps the review decision; the synthesis never returns
  `ready-to-merge` while any mechanical check is red.
- **Host specifics** (check publication, branch-protection payload, the `pair-explicit-approval` job,
  manual/degraded setup) live in `github-implementation.md` (R2.12), not the model.
- **The explicit-approval job is an authorization control, designed as one.** "Deterministic" holds only
  if its code cannot come from the change it authorizes:
  - **Trusted ref.** The job and every projection it sources are read from the **target branch**
    (`pull_request_target` + checkout pinned to `base.sha`), never the PR's tree. Counter-example: with
    the pre-fix `pull_request` + default checkout, a `risk:red` PR carrying a neutered
    `explicit_approval_required` published `pair-explicit-approval=success` on its own head — a
    self-granted 🔴 gate. Base-pinned, the identical tamper changes nothing.
  - **Head-pinned verdict.** Published as a commit status on `github.event.pull_request.head.sha`, the
    only commit protection evaluates. `$GITHUB_SHA` is *not* that commit (measured: base tip for
    `pull_request_target`, the `refs/pull/<n>/merge` commit for `pull_request_review`), so a verdict
    there would leave a 🔴 PR blocked *after* the human approves.
  - **Pinned producer + pending-first.** Any push-access principal can write a commit status for any
    context, and protection reads the most recent per context — so an unpinned context is satisfied by
    one `POST …/statuses/$HEAD_SHA -f context='pair-explicit-approval'` from the agent's own token (it
    needs `repo:status` for `pair-review`). The protection payload therefore uses the **`checks` form
    with `app_id`** pinned to the producer (GitHub Actions), not the legacy `contexts` array, and the job
    publishes **`pending` as its first step** so a cancelled re-evaluation cannot leave a stale
    lower-tier `success`. Residual, recorded: a PR that *adds* a workflow requesting `statuses: write` can
    still post as the Actions app — narrowed by two companion settings (default `GITHUB_TOKEN`
    permissions read-only; `CODEOWNERS` + `require_code_owner_reviews` on `/.github/workflows/**`),
    eliminated only by the GitHub-App/check-run form (Option 4).
- **`pair-review` is an anti-accident control, not an authorization control.** Published with the
  agent's own token, it is **forgeable by any push-access principal by construction** (no app publishes
  it, so no `app_id` pin). It guarantees that a review which never ran, crashed or was skipped leaves the
  context absent/pending and the merge blocked — removing the *accident*, not the *forgery*. Stronger
  than Option 1's label in exactly one respect (absent/pending blocks, a missing label does not), no
  stronger in mutability; authorization is `pair-explicit-approval`'s, hence two checks. An unforgeable
  verdict needs a distinct GitHub App publishing a check run whose `app_id` the repository's workflows
  cannot present — Option 4, deferred with [#398](https://github.com/foomakers/pair/issues/398).

  A project unwilling to enable `pull_request_target` gets the same guarantee by inlining the projection
  into the job (no checkout), at the cost of a second copy to keep in sync.
- **The review is dispatched, never nested, and never merges.** `/pair-capability-publish-pr` runs
  inside `/pair-process-implement`'s handoff subagent, so it returns `review-dispatch-required` and the
  **top-level session** spawns the reviewer (harnesses commonly forbid nested delegation). The dispatch
  prompt is bounded to phases 1–5, and `/pair-process-review` has a **non-interactive contract** for its
  two human prompts, so a dispatched review neither stalls nor self-answers into a merge. The merge stays
  a human act at every tier.

### Amendment (2026-08-28) — Option 4 adopted: a dedicated review identity + an adoption-gated light auto-approval row

Story [#218](https://github.com/foomakers/pair/issues/218) adopts **Option 4**, deferred above ("A
distinct reviewer identity stays out of scope, deliberately"). The identity is still project
infrastructure; what changes is that the flow now **consumes** one a project provisions. Option 3 stays
the design; this layers a credential-resolution step and one adoption-gated row on top.

**What is adopted.**

1. **A dedicated review identity, resolved through a host-agnostic adapter.** The host-writing skills
   (`/pair-process-review` Steps 5.3–5.4, `/pair-capability-publish-pr` Phase 5) resolve **which
   credential executes the host write** through one executable projection, `assets/review-identity.sh` —
   seven entry points, and a host adapter is wired from **all seven**: `review_identity_kind_ok`
   (validates the adoption value, so present-but-unparseable HALTs instead of degrading to `none`),
   `resolve_identity_mode`, `review_identity_exclusion_ok` (**security-critical**: omitting it lets a
   bot-user identity with no `REVIEW_IDENTITY_LOGIN` resolve to `identity` and sign the 🔴 human
   approval), `review_identity_health` (**the runtime source of the `healthy` flag**),
   `identity_verdict_event`, `pair_review_publication_mode`, `identity_audit_comment` — the
   `tier-resolve.sh`/`pr-state.sh` pattern, so recipe, skills and tests read one text. Three modes only:
   `identity` (configured and usable), `session` (none configured — **today's behavior**, not an error),
   `halt` (configured but unusable).
2. **A native verdict and, on the App path, the Checks API.** With an identity the reviewer is not the
   author, so GitHub's self-approval rejection no longer applies: a **native APPROVE /
   REQUEST_CHANGES** replaces the `--comment` degradation, and an App holds `checks: write`, so
   `pair-review` publishes as a **check run**. Both upgrade a degraded path: the `--comment` verdict
   (still produced by `session` mode on a **self-authored** PR) and the commit status remain that mode's
   documented behavior.
3. **An adoption-gated light auto-approval row.** `light_auto_approve_allowed` ships beside
   `resolve_pr_state` in `pr-state.sh`: approve/no-op from four inputs — adoption declares `light` in
   `## Tag Projection`, the PR carries the `light` tag, the tier is **below red**, and `resolve_pr_state`
   already synthesized `ready-to-merge`. **Zero classification criteria** (D18); no "lightness" is
   computed. Adoption is the gate, not the label: a hand-applied `light` label on a repository declaring
   no projection triggers nothing.

**What is NOT changed — stated because this is the part that is easy to get wrong.**

- **The 🔴 human-approval requirement stands — and it is now enforced by two clauses, not one.**
  `human_approval_jq_filter` still requires `user.type == "User"`, excluding a GitHub **App** (types as
  `"Bot"`) but **not** a **bot user** (an ordinary account, types as `"User"`) — which alone would let a
  machine account satisfy `pair-explicit-approval` on `risk:red`. The filter also excludes the identity by
  **login** (`.user.login != env.REVIEW_IDENTITY_LOGIN`), and `review_identity_exclusion_ok` makes an
  unprovisioned login **not-healthy**, so the flow HALTs rather than running with the clause inert. The
  single shipped-predicate change in this amendment, and it is additive: with the variable unset the clause
  matches nothing and every prior outcome is unchanged. A `risk:red` PR still requires an explicit
  approval from a second human account; light applies **below red only** — the one Option 4 Con not
  reversed: we take auditability and the native verdict, and decline the rule change.
- **A native `APPROVE` *by the identity* is authorized by the light row and by nothing else.**
  `light_auto_approve_allowed` feeds `identity_verdict_event`, so an approval the identity would sign
  outside the row is submitted comment-form. The row governs reviews cast **on the project's behalf**;
  it is not read in `session` mode (the acting account signs its own review as before). Without that
  wiring the four conditions would gate nothing: with `required_approving_review_count >= 1` any native
  approval satisfies the host rule, tagged or declared or not. `REQUEST_CHANGES` is ungated — it blocks,
  never unlocks.
- **`session` mode keeps the NATIVE verdict; the comment form is the self-review case, not the mode.**
  `--comment` works around one host rule (no APPROVE / REQUEST_CHANGES on your own PR). With no identity
  and a *second* maintainer reviewing, the native event was always accepted: `identity_verdict_event`
  takes a fourth argument, `self_authored`, and returns COMMENT in `session` only when the acting account
  is the author or authorship is unreadable (fail-safe). Collapsing every `session` verdict to COMMENT
  would drop real change requests and approvals (toward `required_approving_review_count`) on every
  two-human repository — making the identity mandatory to keep existing behavior.
- **The adoption read is two questions — presence, then value — and present-but-unparseable HALTs.**
  `none` resolves `session` — the review is written (and, where counted, APPROVED) with the **session
  token** — so degrading unrecognised shapes to `none` is the forbidden session-user fallback, with **no
  HALT**. Presence is detected
  format-agnostically; the value is validated by `review_identity_kind_ok` (the adapter owns the
  vocabulary, so a host guide snippet cannot drift from what `review_identity_exclusion_ok` and
  `pair_review_publication_mode` accept); only a genuinely absent key becomes `none`. Both consumer
  surfaces enumerate every entry point, `review_identity_exclusion_ok` included.
  **Presence is anchored to a KEY AT THE START OF A LINE — optional list/bold decoration, the phrase, then a
  colon — not to the bare phrase and not to the phrase-then-colon anywhere in a line.** A whole-file
  `grep -qi 'Review identity'` matches *prose* ("we use no dedicated review identity — reviews run with
  the session token"), and an unanchored `(^|[^[:alnum:]])` colon match fires mid-sentence ("A note on
  review identity: we deliberately run none") — either reads an identity-less project as configured and
  HALTs every review and publish, permanently. The **line**-anchored form still fires on both
  unparseable shapes that must HALT (`- Review identity: app`, `**Review identity**: bot-user`).
- **`healthy` is COMPUTED PER RUN, by `review_identity_health`, and the health probes are split in two.**
  It alone separates `identity` from `halt`. Both earlier readings broke a **correctly provisioned**
  repository: the guide's inert `PROBES_PASSED=0  # set to 1 by whatever ran step 5's probes` (never set)
  ⇒ `resolve_identity_mode 1 0` ⇒ `halt` on every review; re-running step 5's setup probes per review
  (they leave artifacts — a check run cannot be deleted) branded every head with a neutral
  `pair-identity-probe` check run plus a posted/deleted scratch comment. Split: **per run**, cheap
  artifact-free probes (credential authenticates and is scoped to this repository; grants observed
  without writing — on GitHub the App's installation-token exchange requested with explicit
  `permissions`, which GitHub 422s when one is missing, or the bot account's repository-permission
  read); **at setup, once**, the probes that must write to prove a write grant. What a read probe cannot
  prove is covered by one rule, on all three surfaces: a `403`/`422` met **mid-write is a HALT**, reported
  against the failed artifact — never a session-token retry, never a `pair-review` publication implying
  a review that did not land.
- **The review identity must not be an account that opens pull requests, and the mechanism backs the rule
  up.** With `<self_authored>` read in `session` only, a project publishing as `acme-bot` with `acme-bot`
  as its `bot-user` identity resolved `identity`, had every native event rejected (`422 Can not request
  changes on your own pull request`), yet still marked `pair-review` `success` with no review body.
  `identity_verdict_event` therefore reads authorship in **both** modes, with **deliberately asymmetric
  per-mode defaults**: unknown ⇒ self-authored in `session` (the acting account routinely is the
  author), ⇒ *not* self-authored in `identity` (setup forbids it; otherwise every identity verdict would
  be COMMENT). A wrong guess is loud (host 422); Step 5.3's read-back not showing the review ⇒
  `Review: NOT SUBMITTED`, resolved check **not** published, pending one stays. **The rule covers both
  forms and is a health input, not only a verdict degradation**: an App authors PRs too, so one App
  opening and reviewing would HALT mid-write on every review. The per-run probe compares acting
  principal and PR author on **both** paths ⇒ *not healthy* ⇒ `halt` **before any host write**; COMMENT
  stays the in-flow fail-safe for an adapter with no probe or a failed authorship read. **The comparison carries two login shapes, not
  one**: `gh` renders one Bot actor as `app/<app-slug>` via GraphQL (`gh pr view --json author`) and as
  `<app-slug>[bot]` via REST (`.user.login`); a single-shape gate is inert on the other path — measured:
  `gh pr view 14276 --repo cli/cli --json author -q .author.login` ⇒ `app/dependabot`,
  `gh api repos/cli/cli/pulls/14276 --jq .user.login` ⇒ `dependabot[bot]`.
- **One producer per required context, including across a `Review identity` switch.** `pair-review` is
  dual-form (check run on `app`, commit status otherwise), resolved *independently* by
  `/pair-capability-publish-pr` at PR creation and `/pair-process-review` at Step 5.4. A PR opened under
  one value and reviewed under another carries two records for one required context, the stale one
  cleared by nothing (merge possibly blocked). The `pair-explicit-approval` rule extends here:
  **drain** open PRs before changing `Review identity` (always works), or supersede the outgoing form on
  the head with the same conclusion. Supersede is conditional: `none`/`bot-user` ➝ `app` needs
  `statuses: write` **granted on the App AND requested in the installation-token mint payload** (the
  token carries only the requested subset; grant alone leaves `POST /statuses` at `403` and the stale
  status standing), added only while taking that exit since requesting an ungranted permission `422`s
  every mint. `app` ➝ anything needs the retired App's own token. Hence **drain** is the normative exit.
- **The idempotency skip covers the publication acts only.** Step 5.3 submits a *fresh* native review on
  every re-invocation, so skipping from Step 5.4 past Step 5.4b would leave an identity `APPROVE` with no
  paired audit comment and no `Light row:` line — the reason no longer reconstructable from the PR.
- **The audit comment follows the review, and the HALT does not undo the review.** Every input the
  comment renders (action, tag, declaration, tier, state) is resolved before submission, so order is a
  choice: **after**, because it attributes an action that happened; the reverse would leave a permanent
  comment claiming an `APPROVE` the host may refuse (`422` self-authored, `403` mid-write). Residual: both
  writes are HALT-bound and seconds apart, and a `403` on the second does not roll back the first — a
  light-row `identity` `APPROVE` stays on a `ready-to-merge` PR with no audit comment, mergeable with no
  human action wherever `required_approving_review_count >= 1`. It is **loud**: the run HALTs and reports
  the fifth `Light row:` value (`audit comment NOT POSTED (<host error>) — HALT, the APPROVE stands`), the
  one documented exception to "every identity review is paired with its audit comment".
- **The PR-state synthesis is unconditional.** `resolve_pr_state` is called once per review, in its own
  step, in **both modes that continue (`session` and `identity`) and for every verdict** — `halt` ends
  the review before any host write. Step 5.4 publishes exactly one `pr-state:*` label every run, so the
  call is never nested in the (identity-only, APPROVED-only) APPROVE-authority step.
- **`resolve_pr_state`'s table is untouched.** No row added, removed or reordered; the light row is a
  **sibling** consuming its output. A green/yellow PR still reaches `ready-to-merge` and a human still
  merges — the row changes *who supplies the host's required approving review*, never the synthesis.
- **`pair-review` remains anti-accident, not authorization**, in `session` mode. On the App path it is a
  check run whose `app_id` the repository's workflows cannot present — the residual recorded above as
  "eliminated only by the GitHub-App/check-run form" shrinks for App projects, unchanged otherwise.
- **No identity configured is not an error.** `session` is the shipped behavior in full. The HALT
  applies only to `identity`-configured-but-broken: a missing permission or invalid credential stops the
  flow with a pointer to the host guide's *Dedicated review identity* section, **never** silently falling
  back to the session user (a review misattributed to whoever's token was loaded is worse than a stopped
  one). It binds only a phase that **actually performs an identity host write**: where nothing is written
  as the identity (PR publication under `Review enforcement: disabled`, no `pair-review` record there),
  the unusable identity is **reported and the phase continues** — otherwise an enforcement-disabled
  project (the default) could not open a PR while its identity was half-provisioned.
- **Host mechanics stay in the implementation guide** (R2.12): App vs bot user, permissions, install and
  credential storage live in `github-implementation.md`; skills and adapter name no host.

**Residual, recorded rather than assumed away — declaring the `light` family makes the label a
merge-authorizing capability.** "Adoption is the gate, the label is not" contains mis-tagging only where
the family is undeclared. Where declared, with `required_approving_review_count >= 1`, nothing verifies
**who** applied the tag: any write/triage collaborator can label their own sub-🔴 PR `light` and the
identity's authorized `APPROVE` satisfies the host rule with no second person. Working as designed, but
the declaration is an authorization decision, so `light` must be access-controlled (applied from
classification; manual application restricted and audited) wherever declared. The 🔴 gate is
unaffected: `light` is inert at red. Stated on all three consumer surfaces (`pr-states.md`,
`github-implementation.md`, the docs page).

**Verification status.** Implemented and asserted against fixtures — the identity × `light` × tier ×
verdict matrix runs offline in `scripts/smoke-tests/scenarios/review-identity.sh`, the contracts in
`packages/knowledge-hub/src/conformance/review-identity.test.ts`. **Not** yet observed on a live host:
the end-to-end run with a real App (native APPROVE attributable to the identity, `pair-review` as a check
run, a `light` sub-red PR mergeable with no human action) — needs a maintainer-provisioned App, tracked
as story #218's task T11. Hence the **JWT → installation-token exchange** is documented as GitHub
documents it — `curl -H "Authorization: Bearer $JWT"` — not via `gh`'s auth scheme (a `401` there is
indistinguishable from a bad signature, leaving the App path unprovisionable). Nothing here enables the row: `tech/risk-matrix.md` declares
`Active: risk` only, so it is **inert here**, grep-verifiably.

## Consequences

- `publish-pr` registers `pair-review` as pending **before** dispatching the review to a clean-context
  subagent: blocked from t0, and a dispatch failure defers the review instead of skipping it.
- `review` gains a step that publishes the check conclusion, resolves tier requirements and
  synthesizes/labels the state; its Phase 6 merge HALTs unless `merge_allowed`. The agent never edits branch protection or bypasses a check.
- **Both merge paths carry the same precondition, not just the reviewer's.** `/pair-process-review`
  Phase 6 (Step 6.0) and `/pair-process-implement` Phase 4 (Step 4.1, the author re-invoked after
  approval, where every *dispatched* review routes) both run the re-synthesis + `merge_allowed` HALT,
  asserted by the conformance suite — critical in advisory mode (protection not applied), where nothing
  host-side blocks.
- `setup-gates` wires both contexts (idempotently) and reports **degraded** enforcement when host or
  token cannot configure protection.
- 🔴 PRs carry a mechanical, auditable explicit-approval trail (a human, non-author approving review on
  the merged head), satisfying the compliance angle without a new artifact.
- **Consequence accepted knowingly: a 🔴 merge requires a second human account.** GitHub rejects an
  author's approving review, so on a single-maintainer repository (including this one) no 🔴 PR reaches
  `ready-to-merge` via review while `pair-explicit-approval` is required; the project adds a second human
  reviewer or leaves that context out and records the 🔴 rule as advisory. **Amended by
  [#398](https://github.com/foomakers/pair/issues/398)** (§ Amendment below): a head-bound
  `/approve <head-sha>` token is a third option.
- **Ordering is part of the decision**: the workflow job and `pr-state:*` labels must be observed
  reporting on a real PR *before* protection is written (and `enforce_admins` enabled), otherwise a
  never-reporting required context blocks every merge with no escape hatch.
- A new code host is a new implementation-guide section, not a model/evaluator change. Hosts lacking
  required checks remain usable in advisory mode.
- ~~**A distinct reviewer identity stays out of scope**, deliberately (Option 4): the dispatched reviewer
  runs as the author's account, so its verdict is a `--comment` review by construction, and a second
  human account remains the only way to satisfy 🔴.~~ **Superseded by the 2026-08-28 amendment above**
  (story [#218](https://github.com/foomakers/pair/issues/218)): Option 4 adopted as a *consumed* identity
  via a host-agnostic adapter, falling back to exactly the behavior above when none is configured. Still
  true: **a second human account remains the only way to satisfy 🔴** — the identity is excluded by
  **account type** for an App (`user.type == "User"`) and by **login** (`REVIEW_IDENTITY_LOGIN`, the
  amendment's one additive predicate change; `review_identity_exclusion_ok` HALTs until provisioned) for
  a bot user. The solo-approval token (**2026-08-30 amendment below**) is a second *satisfaction path*
  for the same requirement, needing this story's identity only for forgery-resistance.
- **Merge blocking was verified end-to-end on a live code host** (throwaway repository, 2026-07-30):
  labels → workflow → contexts observed on the head commit → protection with `enforce_admins: true` → one
  PR per tier. Observed: **pending** `pair-review` blocks (`Required status check "pair-review" is
  pending.`), **failing** blocks, **absent** blocks as "expected", 🟢 with both green **merges**, 🔴
  without human approval blocks, a 🟡→🔴 raise re-blocks within one run, a `pull_request_review`
  re-reports the approval context **on the same head SHA**, and the tampered PR stays blocked. Evidence
  table: `github-implementation.md` § "Verified on a throwaway repository". A **point-in-time
  observation**, not re-auditable evidence: the sandbox is gone (no run URL or API dump), and rows are
  re-verified by re-running the documented ordering steps on the adopting repository (stated in the
  table's preamble). The producer pin, companion settings and pending-first step came later and are
  explicitly **not** covered by it.
- Verification split per the gate-tooling ADL (2026-07-13): `pr-state.sh` behavior is executed by
  `scripts/smoke-tests/scenarios/pr-state-flow.sh`; guideline/skill content invariants are asserted in
  `packages/knowledge-hub/src/conformance/pr-state-flow.test.ts`.
- Applying branch protection to a real repository (including this one) is a **repo-configuration** act
  with admin scope, left to a human (see the way-of-working status line) — why `setup-gates` reports the
  degraded state rather than assuming success.

## Adoption Impact

- `way-of-working.md`: Quality Gates gains the required-check line for the two pair checks (beside the
  tiering and coverage-guardrail flags).
- KB: new `pr-states.md` + `assets/pr-state.sh`; `quality-model.md` §4 gains a pointer to the flow
  (criteria stay in the model); `github-implementation.md` gains the host recipe.
- Docs site: new `concepts/pr-state-flow` page, cross-linked from `concepts/tag-driven-gates`.

Added by the 2026-08-28 amendment (story #218):

- KB: new `assets/review-identity.sh` (the identity adapter projection); `pr-state.sh` gains
  `light_auto_approve_allowed`; `github-implementation.md` gains § *Dedicated review identity*;
  `pr-states.md` gains the identity actor row and the one-line 🔴 rule.
- `way-of-working.md` (template + this repo): a `Review identity` line under Quality Gates — `none` by
  default, so adopting the identity is an explicit project act.

## Amendment (2026-08-30) — the solo-maintainer approval token (#398)

**Status**: Accepted. Amends this ADR; supersedes nothing. The decision above stands; this adds one
**satisfaction path** to `pair-explicit-approval` and states what it is worth.

### Context of the amendment

The consequence accepted above — *a 🔴 merge requires a second human account* — made 🔴 **unusable** on
a single-account repository, pair's most common adopter shape: the only options were "add a human"
(unavailable) or "drop the context and keep D10 advisory". Story #398 adds a third.

### Decision

**A human-applied, head-bound approval token is an alternative way to satisfy `pair-explicit-approval`
— never a replacement for the review path, and never a change to what the tier requires.**

- **Mechanism: a comment command, not a label.** The maintainer posts `/approve <head-sha>`. The other
  #398 candidate, a human-applied `approved:human` label, carries **no head SHA** (binding would compare a
  `labeled` event's timestamp with the head commit, which a force-push invalidates either way); the actor
  is equally host-asserted on both, so the explicit SHA binding decides it. Withdrawal is an edit or
  delete; comments are read fresh, so only the current state of the current head counts.
- **The actor is resolved server-side, in two stages that both have to pass.** Stage 1
  (`human_token_approval_jq_filter`, in `assets/pr-state.sh` next to the review predicate — one
  executable projection, no transliteration) accepts a comment only on host-asserted fields:
  `.user.type == "User"` (no Bot, no Organization), `.performed_via_github_app == null` (an App posting
  for a human is rejected), `.author_association ∈ {OWNER, MEMBER, COLLABORATOR}`, and the command
  **owning its line, outside fenced regions and HTML comments** — `(^|\n)/approve <40-hex head SHA>`, no
  leading whitespace, on the body with fenced regions (triple-backtick and `~~~`) and `<!-- … -->`
  stripped first. The anchor alone covers `>` quote-replies, 4-space-indented blocks and inline
  backticks, **not** a fence (column 0 — a maintainer pasting the command to *explain* it, as this ADR
  does) nor an HTML comment (invisible, yet naming its author as approver); without the strips both
  approved the PR. The fence strip is **line-anchored**, rejoined with `""` — a backtick-parity
  `split("```")` joined with `"\n"` read an inline ` ```gh``` ` span as a fence and made a mid-line
  mention count. A targeted strip, not a CommonMark parser — the residual is named in the
  guide's Stage 1 table (a fence indented four or more spaces is not recognised; its content is indented
  too, so the anchor rejects the token anyway). Only command and SHA come from the body; a body claiming
  to be someone else changes nothing. Stage 2 (`token_approver_login` / `token_permission_sufficient`)
  reads `GET /repos/{owner}/{repo}/collaborators/{login}/permission` and requires
  `admin`/`maintain`/`write`. **The association is a pre-filter, not the authorization**: `MEMBER` means
  "member of the organization that owns the repository", nothing about *this* repository, so on a
  500-member org a read-only member would have satisfied 🔴. Only the permission read authorizes.
- **The author exclusion, and the opt-in that suspends it.** The review predicate carries
  `.user.login != PR_AUTHOR`; so does the token, else *any* author self-satisfies 🔴 before the first
  review (every 🔴 PR's initial state, whatever the headcount). No payload says "this repository cannot
  produce a second human", so the repository **declares** it: `PAIR_SOLO_APPROVAL_TOKEN=true`, threaded into the predicate as `SOLO_APPROVAL_TOKEN`.
  Set, the author's own token counts (the point on a one-person repo). Unset (default), the token is
  available only to a **non-author** write-level human — never a self-approval shortcut where a second
  human exists. The executable form of "the token is a fallback for a configuration that cannot produce
  a second human, not a shortcut for one that can".
- **Why the default is the LOOSE form and not "opt-in unset ⇒ token path unreachable".** Where
  independent review is possible, D10 can also be satisfied by a comment absent from the Reviews tab and
  never subject to `dismiss_stale_reviews`. Accepted: small security delta (head-bound, voided by a
  force-push like `dismiss_stale_reviews`; stage 2 demands a reviewer's write-level permission), real
  **visibility** delta — the price of one fewer required setting for the solo maintainer, the only
  adopter with no review fallback, for whom a mis-set variable under the strict form is a silently
  unmergeable PR. Revisit if visibility bites: the strict form is one `if` branch away.
- **The review path stays primary — but "primary" is not "free".** The job queries reviews first and
  wins wherever an approval exists. It reaches the token branch whenever that returns zero — **every**
  🔴 PR before its first review: a ten-person repository pays the comments query and one permission read
  per candidate too, and a non-author write-level human's token satisfies 🔴 there.
- **A comment run belongs in its own concurrency group, not merely a non-cancelling one.**
  `concurrency` is evaluated at RUN level, before any job `if:`, so the body filter cannot keep a comment
  run out of the group. `cancel-in-progress: ${{ github.event_name != 'issue_comment' }}` fixes only one
  direction: the comment run stays **cancellABLE** (GitHub cancels a group's PENDING run when a newer one
  queues), so a `/approve` behind a `synchronize` evaluation is dropped by the next ordinary comment,
  leaving `needs a non-author human approval…` with a valid token unread. The group is keyed by comment id
  for `issue_comment`
  (`…-${{ github.event_name == 'issue_comment' && github.event.comment.id || 'eval' }}`): a token run
  neither cancels nor is cancelled; `edited`/`deleted` of the SAME comment share its key, newest wins. Remaining: a fail-safe publication race, in the guide's § Residual —
  an evaluation that read comments before the token can overwrite its `success` with `failure`: blocked,
  never merged, cleared by any later event.
- **Every refusal states which refusal it is, at BOTH stages.** With the opt-in unset, stage 1 drops the
  author's token and an empty candidate list read as "no token was posted", naming the lifting variable
  nowhere. On an empty list the
  job re-runs stage 1 with the opt-in forced on (`token_blocked_by_author_exclusion`) and, if the
  exclusion dropped the author's token, publishes `token posted by the PR author; set
  PAIR_SOLO_APPROVAL_TOKEN=true if this repo has one human`. The opt-in is compared case-insensitively,
  whitespace ignored (a free-text Actions Variables box; a `True` must not silently declare nothing).
- **A stage-2 failure is reported as a stage-2 failure.** The permission read can 403 (the collaborators
  endpoint is outside the job's four `permissions:` entries), 5xx or rate-limit; folded onto `none` it
  read as "no token was posted". `TOKEN_PERMISSION_UNKNOWN` + `token_denied_desc` give the three states
  three descriptions.
- **The tier requirement is untouched.** quality-model §4 and D10 still demand explicit human approval
  at 🔴. This amendment changes *how the rule is satisfied*, never what it demands.

### What the token guarantees — and what it does not

It is **explicit human confirmation, not independent review** — not a second pair of eyes; implying
otherwise turns 🔴 into ceremony. It provides exactly three properties: **deliberateness** (a distinct,
explicit act, not a reflex), an **audit trail** (who, when, on which head SHA — in the status
description), and **invalidation on change** (a force-push moves the head and voids it, like a
review-based approval). Two-human adopters keep the stronger property; solo adopters get the weaker one,
knowingly.

### Forgery-resistance is NOT achieved in the default configuration (#218)

With shared credentials (today's default) agent and human are **the same actor on the wire**: every
field above resolves identically, so the token records *that a deliberate act happened under this
identity*, not *that a human performed it*. A dedicated identity (#218) recovers verifiability only when
non-human to the host (`.user.type == "Bot"` or an App attribution, rejected by the predicate); a machine
user account — the cheapest, most common agent identity — does not (`performed_via_github_app` is
`null`). #218 is the prerequisite only under that condition. Until then, an adopter for whom
forgery-resistance is the point keeps a second human account; the token is the honest fallback for
everyone else.

**Grep-verifiable statement, one sentence per identity configuration** (the DoD item, kept literal so it
can be checked with `grep`, not inferred):

- With **shared credentials** (the agent authenticated as the maintainer), the agent **can** apply the
  token and nothing distinguishes it from the human — the token is auditable, not unforgeable.
- With a **dedicated identity** (#218) shipped as a **GitHub App or Bot account**, the agent **cannot**
  apply the token: its comments are host-attributed to a Bot or an App and the predicate rejects them —
  the human act becomes verifiable.
- With a **dedicated identity** shipped as a **machine user account** (a second GitHub user with a
  PAT), the agent **can** still apply the token: `user.type` is `"User"` and there is no App
  attribution, so the predicate accepts it — the same forgeability as shared credentials, and it would
  need an explicit deny-list of the agent login to close.

The residual the flow declares rather than hides, as with `pair-review` being anti-accident, not
authorization.

### Consequences of the amendment

- 🔴 is usable on a single-account repository, at a **named, weaker** guarantee — the risk guarded
  against is a false sense of security.
- **The token costs one extra API read per candidate actor** (the collaborators permission endpoint,
  after stage 1 found a candidate), on the fallback path only — never 🟢/🟡 (auto-pass); any 🔴 PR whose
  reviews query returns zero (§ Decision, "the review path stays primary — but 'primary' is not
  'free'").
- One more trigger (`issue_comment`), **body-filtered on `created`** so an ordinary new comment spends
  no Actions minutes; `edited`/`deleted` stay unfiltered (a withdrawal no longer contains the command).
  Price: editing or deleting *any* comment on *any* PR runs the job in full, pending-first flip included,
  so a 🟢 PR whose evaluation dies stays blocked until the next event (fail-safe; narrowing needs
  per-comment state the payload lacks). The payload carries `issue`, not `pull_request`; head/base/author
  come from the API. Residual: if that read fails, pending-first aborts and the *previous* status for the
  head stands, so a token withdrawn during a dying evaluation stays satisfied until the next event. A
  tier raise — what pending-first exists for — arrives as a `labeled` event carrying the head SHA and
  never depends on that read.
- Verification follows the existing split: the predicate runs against a committed comments fixture in
  `scripts/smoke-tests/scenarios/pr-state-flow.sh`; content invariants (including this amendment's
  wording) are asserted in `packages/knowledge-hub/src/conformance/pr-state-flow.test.ts`. The live pass
  is ordering step 4 in `github-implementation.md`, on the adopting repository.

### Adoption Impact (amendment)

- `way-of-working.md`: the single-maintainer line no longer reads "a second human account is a
  prerequisite" and names the token as this repository's path — **conditional on setting
  `PAIR_SOLO_APPROVAL_TOKEN=true` here**, since PR author and maintainer are the same person.
- KB: `assets/pr-state.sh` gains the token predicate + audit projection + server-side permission stage;
  `pr-states.md` gains the two edge-case rows; `github-implementation.md` gains the token section, the
  body-filtered `issue_comment` trigger and ordering step 4.
- Docs site: `concepts/pr-state-flow` states the solo path, its opt-in and its limit.
- **New repository setting for adopters**: the Actions variable `PAIR_SOLO_APPROVAL_TOKEN`, unset by
  default. Leaving it unset is the safe configuration and requires no action.
