import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Story #218 — dedicated review identity + adoption-gated light auto-approval.
//
// This story EXTENDS the shipped PR state flow (#234/#390, ADR-018 Option 3). It
// rebuilds nothing: `resolve_pr_state`'s table is untouched and the required-check
// enforcement is untouched. The 🔴 human-approval predicate gains exactly ONE additive
// clause — `.user.login != env.REVIEW_IDENTITY_LOGIN` — because the `bot-user` identity
// form types as `user.type == "User"` on the reviews API and the type clause alone does
// NOT exclude it; with the variable unset the clause matches nothing, so every prior
// outcome is unchanged. What is
// new is (a) WHO acts — a project-provisioned identity resolved through a
// host-agnostic adapter, with HALT-not-fallback when it is configured but broken —
// and (b) ONE adoption-gated row that lets that identity sign the approving review a
// `light`-tagged, sub-red, already-`ready-to-merge` PR needs.
//
// These are content invariants on the sources of record (dataset KB + dataset skills),
// asserted the way the rest of the corpus is (see pr-state-flow.test.ts). The
// BEHAVIOR of the shipped shell projections (`review-identity.sh`, the light row in
// `pr-state.sh`) is executed end-to-end by scripts/smoke-tests/scenarios/review-identity.sh
// per the gate-tooling ADL (2026-07-13: shell assets are smoke-tested, never
// vitest-unit-tested) — including the full identity × light × tier × verdict matrix
// and the 🔴-predicate regression against the committed reviews fixture.

const DATASET = join(__dirname, '../../dataset')
const REPO = join(__dirname, '../../../..')

const read = (p: string): string => readFileSync(p, 'utf-8')

const ADAPTER = read(join(DATASET, '.pair/knowledge/assets/review-identity.sh'))
const EVALUATOR = read(join(DATASET, '.pair/knowledge/assets/pr-state.sh'))
const GUIDELINE = read(
  join(DATASET, '.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md'),
)
const GITHUB_GUIDE = read(
  join(
    DATASET,
    '.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md',
  ),
)
const REVIEW = read(join(DATASET, '.skills/process/review/SKILL.md'))
const PUBLISH_PR = read(join(DATASET, '.skills/capability/publish-pr/SKILL.md'))
const SETUP_GATES = read(join(DATASET, '.skills/capability/setup-gates/SKILL.md'))
const WOW_TEMPLATE = read(join(DATASET, '.pair/adoption/tech/way-of-working.md'))
const ROOT_WOW = read(join(REPO, '.pair/adoption/tech/way-of-working.md'))
const ADR_018 = read(join(REPO, '.pair/adoption/tech/adr/adr-018-pr-state-flow-required-checks.md'))
const RISK_MATRIX = read(join(REPO, '.pair/adoption/tech/risk-matrix.md'))
const DOCS_PAGE = read(join(REPO, 'apps/website/content/docs/concepts/review-identity.mdx'))
const SMOKE = read(join(REPO, 'scripts/smoke-tests/scenarios/review-identity.sh'))
const CI_TESTS = read(join(REPO, 'scripts/smoke-tests/lib/ci-tests.sh'))

describe('review-identity.sh — the host-agnostic identity adapter (AC1, AC4)', () => {
  it('exposes the seven entry points the flow composes', () => {
    for (const fn of [
      'review_identity_kind_ok',
      'resolve_identity_mode',
      'review_identity_exclusion_ok',
      'review_identity_health',
      'identity_verdict_event',
      'pair_review_publication_mode',
      'identity_audit_comment',
    ]) {
      expect(ADAPTER).toContain(`${fn}()`)
    }
  })

  // REGRESSION (review round 4). The host guide extracted the adoption kind with ONE
  // markdown-shaped expression and defaulted an empty result to `none`. `none` is not a
  // neutral default: it means NO IDENTITY, so `resolve_identity_mode` yields `session`
  // and the review is written — and where the host allows it, APPROVED — with the SESSION
  // token, on a repository that provisioned an identity. No HALT is raised because the
  // flow never learns one was configured. The vocabulary therefore lives in the adapter,
  // and a present-but-unparseable value is configured-but-unusable.
  it('review_identity_kind_ok parses the adoption value, so unparseable is never `none`', () => {
    expect(ADAPTER).toMatch(/^review_identity_kind_ok\(\) \{$/m)
    // the vocabulary, single-sourced here
    expect(ADAPTER).toMatch(/^ {2}app \| user \| bot-user \| none\)$/m)
    // and the reason the caller must not fall through to `none`
    expect(ADAPTER).toMatch(/detects the key's PRESENCE format-agnostically/)
    expect(ADAPTER).toMatch(/unparseable ⇒ configured-but-unusable ⇒ HALT with the setup pointer/)
    expect(ADAPTER).toMatch(/That is the session-user/)
  })

  it('names no code host — the mechanism is agnostic, per-host setup is R2.12', () => {
    // A GitHub App is NAMED in the doc comments as the example that unlocks the Checks
    // API; what must not appear is a host COMMAND or endpoint, which would make the
    // adapter GitHub-specific instead of GitHub-aware.
    expect(ADAPTER).not.toMatch(/\bgh api\b|\bgh pr\b|api\.github\.com|repos\/\$/)
    expect(ADAPTER).toMatch(/implementation guide/i)
  })

  it('AC4 — configured-but-broken HALTs and states there is no session-user fallback', () => {
    expect(ADAPTER).toMatch(/halt/i)
    expect(ADAPTER).toMatch(/never falls back to the session user/i)
    expect(ADAPTER).toMatch(/Dedicated review identity/)
  })

  it('AC4 — an ABSENT identity is the default mode, explicitly not an error', () => {
    expect(ADAPTER).toMatch(/session/)
    expect(ADAPTER).toMatch(/not an error|zero-configuration default/i)
  })

  it('AC6 — restates that the identity never satisfies the 🔴 human predicate', () => {
    expect(ADAPTER).toMatch(/user\.type == "User"/)
    expect(ADAPTER).toMatch(/pair-explicit-approval/)
    expect(ADAPTER).toMatch(/second HUMAN account/i)
  })

  // REGRESSION (review round 4). The audit comment is rendered onto every PR the identity
  // acts on, on every adopting project — its sentence was missing the possessive between
  // the function name and `clause`.
  it('the audit comment sentence is well-formed — it ships on every audited action', () => {
    expect(ADAPTER).toContain(
      'rejected by `human_approval_jq_filter`\'"\'"\'s `user.type == "User"` clause',
    )
  })

  it('carries no classification criteria — it reads configuration, never the change (D18)', () => {
    expect(ADAPTER).toMatch(/D18/)
    expect(ADAPTER).not.toMatch(/git diff|--numstat|files?[- ]changed|\bmigration\b/i)
  })
})

describe('review-identity.sh — the identity must be excluded from the 🔴 gate to act (AC3, AC6)', () => {
  it('review_identity_exclusion_ok distinguishes the App form from the bot-USER form', () => {
    expect(ADAPTER).toMatch(/review_identity_exclusion_ok\(\)/)
    expect(ADAPTER).toContain(
      'review_identity_exclusion_ok <identity_kind> <review_identity_login> <acting_login>',
    )
    // app ⇒ excluded by account type, nothing to configure
    expect(ADAPTER).toMatch(/app\)\n\s+# `user\.type == "Bot"`/)
    // user ⇒ excluded ONLY by login, so an unset login is a not-healthy identity
    expect(ADAPTER).toMatch(/bot-USER identity types as user\.type == \\"User\\"/)
    expect(ADAPTER).toMatch(/Treat this identity as NOT healthy until it is set/)
    // unknown kind is fail-safe NOT excluded
    expect(ADAPTER).toMatch(/fail-safe: not excluded/)
  })

  it('requires the machine identity that acts to be the login the red gate excludes', () => {
    expect(ADAPTER).toMatch(/if \[ -z "\$acting" \]; then/)
    expect(ADAPTER).toMatch(/if \[ "\$login" != "\$acting" \]; then/)
    expect(ADAPTER).toMatch(/excludes THAT login/)
  })

  // REGRESSION (review round 2). The `<identity_kind>` the skills pass is the LITERAL
  // read from way-of-working (`app` | `bot-user`) — `/review` Step 5.3 forwards it
  // verbatim. An adapter that accepts only `user` turns a correctly provisioned bot-user
  // repository into a permanent HALT: exclusion_ok fails ⇒ healthy=0 ⇒ resolve_identity_mode
  // 1 0 ⇒ halt, on every review, with a setup pointer to a setup already done.
  it('accepts BOTH spellings of the machine-user kind — the adoption literal included', () => {
    expect(ADAPTER).toMatch(/^ {2}user \| bot-user\)$/m)
    expect(ADAPTER).toMatch(/identity_kind\s+: app \| user \| bot-user \|/)
    // the same vocabulary on the publication side, so the two never drift apart
    expect(ADAPTER).toMatch(/identity_kind : app \| user \| bot-user \|/)
    expect(ADAPTER).toMatch(/`bot-user` is the ADOPTION literal/)
  })

  it('the header states the exclusion as two mechanisms, one per identity form', () => {
    expect(ADAPTER).toMatch(/app\s+— a GitHub App installation types as `user\.type == "Bot"`/)
    expect(ADAPTER).toMatch(/bot-user\s+— a machine USER account types as `"User"`/)
  })

  it('AC2/AC3 — identity_verdict_event gates APPROVE on the light row, fail-safe closed', () => {
    expect(ADAPTER).toMatch(
      /identity_verdict_event <mode> <verdict> <approve_authorized> <self_authored>/,
    )
    expect(ADAPTER).toMatch(
      /local mode="\$\{1:-\}" verdict="\$\{2:-\}" approve_authorized="\$\{3:-0\}" self_authored="\$\{4:-\}"/,
    )
    expect(ADAPTER).toMatch(/WHY AN APPROVING VERDICT IS NOT AUTOMATICALLY AN `APPROVE` EVENT/)
    // REQUEST_CHANGES is deliberately ungated — it blocks, it never unlocks
    expect(ADAPTER).toMatch(/`REQUEST_CHANGES` needs no such gate/)
  })

  // REGRESSION (review round 3). `session` is the DEFAULT mode (no identity configured),
  // and COMMENT there is the workaround for ONE host rule: a SELF-authored APPROVE /
  // REQUEST_CHANGES is rejected. Returning COMMENT for every session verdict regressed the
  // shipped non-self-authored case: a CHANGES-REQUESTED by a second maintainer stopped
  // being a real change request (merge button unblocked, zero blocking reviewers) and an
  // APPROVED stopped counting toward `required_approving_review_count`.
  it('session mode returns the NATIVE event unless the acting account authored the PR', () => {
    expect(ADAPTER).toMatch(/WHY `session` MODE IS NOT UNIFORMLY A COMMENT/)
    expect(ADAPTER).toMatch(
      /self_authored\s+: 0 when the acting account is provably NOT the pull request's/,
    )
    // fail-safe in `session`: unknown authorship is treated as self-authored
    expect(ADAPTER).toMatch(/session\s+— unknown ⇒ SELF-authored/)
    // the light row governs the IDENTITY's approval, so it is inert in session mode
    expect(ADAPTER).toMatch(/Read in `identity` mode ONLY/)
  })

  // REGRESSION (review round 6). `healthy` is the single signal separating `identity`
  // from `halt` and it had NO runtime source: the host guide's snippet carried
  // `PROBES_PASSED=0  # set to 1 by whatever ran step 5's probes` and nothing ever set it,
  // while step 5's probes are explicitly setup-time ("run them once at setup, not per
  // review") because they leave an undeletable check run on the head commit. Both shipped
  // surfaces then told the agent `healthy` is 1 when "the required permissions were
  // observed", with no way to observe them: on a CORRECTLY provisioned repository the
  // literal reading HALTs every review forever, and the other reading brands every
  // reviewed head with a `pair-identity-probe` check run.
  it('review_identity_health is the runtime source of the health flag', () => {
    expect(ADAPTER).toMatch(/^review_identity_health\(\) \{$/m)
    expect(ADAPTER).toMatch(
      /review_identity_health <identity_kind> <auth_ok> <perms_ok> <review_identity_login> <acting_login>/,
    )
    // the per-run / at-setup split, stated where the function lives
    expect(ADAPTER).toMatch(/PER RUN \(here\)\s+— cheap, artifact-free/)
    expect(ADAPTER).toMatch(/AT SETUP \(once\) — the probes that must WRITE/)
    // unknown is never healthy, and the exclusion precondition cannot be forgotten
    expect(ADAPTER).toMatch(/\[ "\$auth_ok" != "1" \]/)
    expect(ADAPTER).toMatch(/\[ "\$perms_ok" != "1" \]/)
    expect(ADAPTER).toMatch(/if ! review_identity_exclusion_ok "\$kind" "\$login" "\$acting"; then/)
    // and the rule that covers what a read probe cannot prove at run time
    expect(ADAPTER).toMatch(/403\/422 met MID-WRITE is a HALT/)
  })

  // REGRESSION (review round 6). `<self-authored>` was read in `session` mode only, and
  // nothing forbade the review identity from being the account that OPENS the PRs — the
  // #219 unattended loop provisioning its own `acme-bot` as `Review identity: bot-user` is
  // the concrete case. Health passes, the mode resolves `identity`, and GitHub answers
  // `422 Can not request changes on your own pull request`: the verdict never lands as a
  // review, while the check publication is a separate step that still marks `pair-review`
  // `success` — an approving verdict as a green required check on a PR with no review body.
  it('identity mode reads authorship too, with per-mode defaults', () => {
    expect(ADAPTER).toMatch(/WHY `identity` MODE READS AUTHORSHIP TOO/)
    expect(ADAPTER).toMatch(/422 Can not request changes on your own pull request/)
    // the arm itself, before the verdict switch
    expect(ADAPTER).toMatch(/if \[ "\$self_authored" = "1" \]; then[\s\S]{0,600}echo "COMMENT"/)
    // the defaults are asymmetric ON PURPOSE — the other way deletes the feature
    expect(ADAPTER).toMatch(/identity — unknown ⇒ NOT self-authored/)
    expect(ADAPTER).toMatch(/would collapse\n#\s+every identity verdict to COMMENT/)
  })

  it('the audit comment names BOTH exclusion clauses, not just the type one', () => {
    expect(ADAPTER).toMatch(/an App identity is rejected by[\s\S]{0,120}user\.type == "User"/)
    expect(ADAPTER).toMatch(/bot-USER identity \(which does type as "User"\) by its login clause/)
  })
})

describe('pr-state.sh — the light row is a SIBLING, not a change to the table (AC2, AC3)', () => {
  it('ships light_auto_approve_allowed beside the untouched resolve_pr_state', () => {
    expect(EVALUATOR).toContain('light_auto_approve_allowed()')
    expect(EVALUATOR).toContain('resolve_pr_state()')
    expect(EVALUATOR).toMatch(/sibling/i)
  })

  it('AC3 — it is the ONLY auto-approval definition in the evaluator', () => {
    expect(EVALUATOR.match(/^light_auto_approve_allowed\(\)/gm)?.length).toBe(1)
    // no second helper that could yield an approval on other grounds
    expect(EVALUATOR).not.toMatch(/^auto_approve|^approve_pr\(\)/m)
  })

  it('AC2 — all four conditions are named: declaration, tag, below-red, merge-enabling state', () => {
    expect(EVALUATOR).toMatch(/Tag Projection/)
    expect(EVALUATOR).toMatch(/light_declared/)
    expect(EVALUATOR).toMatch(/explicit_approval_required "\$tier"/)
    expect(EVALUATOR).toMatch(/ready-to-merge/)
  })

  it('AC3 — adoption is the gate: the label alone is inert', () => {
    expect(EVALUATOR).toMatch(/ADOPTION IS THE GATE/i)
    expect(EVALUATOR).toMatch(/label alone is inert|hand-applied/i)
  })

  it('D18 — it reads a tag and never computes "lightness"', () => {
    expect(EVALUATOR).toMatch(/ZERO CRITERIA \(D18\)/)
    expect(EVALUATOR).toMatch(/not comput(ed|able) here/i)
  })

  it('the 🔴 approval predicate keeps its three shipped clauses', () => {
    expect(EVALUATOR).toMatch(/user\.type=="User"/)
    expect(EVALUATOR).toMatch(/commit_id==env\.HEAD_SHA/)
    expect(EVALUATOR).toMatch(/user\.login!=env\.PR_AUTHOR/)
  })

  it('AC3/AC6 — and gains the login clause that excludes a bot-USER identity', () => {
    // A `Review identity: bot-user` is an ordinary machine account: GitHub answers
    // `user.type == "User"` for it, so the type clause does NOT exclude it and its
    // approving review would otherwise satisfy `pair-explicit-approval` on a risk:red
    // PR — a red PR mergeable with no human involvement. Only an App types as "Bot".
    expect(EVALUATOR).toMatch(/user\.login!=env\.REVIEW_IDENTITY_LOGIN/)
    expect(EVALUATOR).toMatch(/WHY THE LOGIN CLAUSE IS NOT REDUNDANT WITH THE TYPE CLAUSE/)
    expect(EVALUATOR).toMatch(
      /REVIEW_IDENTITY_LOGIN \(the dedicated review identity's account login/,
    )
  })

  it('the light row declares itself the sole authority for the APPROVE event', () => {
    expect(EVALUATOR).toMatch(
      /THIS ROW IS THE ONLY AUTHORITY FOR AN `APPROVE` EVENT THE IDENTITY SIGNS/,
    )
    expect(EVALUATOR).toMatch(/third argument of `identity_verdict_event`/)
    // scoped, so it cannot be read as a rule over the session account's own review
    expect(EVALUATOR).toMatch(/In `session` mode no identity acts and the argument is not read/)
  })
})

describe('review — resolves WHO acts, then submits (AC1, AC4)', () => {
  it('Step 5.3 composes the adapter rather than re-deriving the resolution', () => {
    expect(REVIEW).toContain('review-identity.sh')
    expect(REVIEW).toContain('resolve_identity_mode')
    expect(REVIEW).toContain('identity_verdict_event')
  })

  it('AC1 — an identity yields a NATIVE verdict; --comment stays the degraded form', () => {
    expect(REVIEW).toMatch(/event = APPROVE/)
    expect(REVIEW).toMatch(/event = REQUEST_CHANGES/)
    expect(REVIEW).toMatch(/event = COMMENT/)
    expect(REVIEW).toMatch(/retires the `--comment` degradation|upgrades? it/i)
  })

  it('AC1 — pair-review publishes through the resolved mode (check run on an App)', () => {
    expect(REVIEW).toContain('pair_review_publication_mode')
    expect(REVIEW).toMatch(/checks-api/)
    expect(REVIEW).toMatch(/commit-status|commit status/)
  })

  it('AC4 — configured-but-broken is a HALT before any host write, never a fallback', () => {
    expect(REVIEW).toMatch(/`halt`[\s\S]{0,400}HALT/)
    expect(REVIEW).toMatch(/[Nn]ever fall back to the session user/)
    expect(REVIEW).toMatch(/HALT[\s\S]{0,600}before any host write/i)
  })

  it('AC4 — no identity configured is NOT an error (session is the default)', () => {
    expect(REVIEW).toMatch(/`session`[\s\S]{0,300}(default|not a degradation)/i)
  })

  it('AC5 — the acting account is confirmed by a READ, never assumed', () => {
    expect(REVIEW).toMatch(/read of the PR'?s reviews shows which account authored it/i)
  })

  it('AC5 — decision Q5 is scoped to the VERDICT, so it does not suppress the audit comment', () => {
    // Q5 ("the verdict is the review action; there is no separate PR comment") and the
    // mandatory identity audit comment are both rules of this phase; unqualified, an
    // implementer honouring Q5 literally skips the artifact AC5 requires.
    expect(REVIEW).toMatch(/\*\*no separate VERDICT comment\*\* \(decision Q5\)/)
    expect(REVIEW).toMatch(
      /identity audit comment\*\* of Step 5\.4b is a distinct, required artifact/,
    )
  })

  // REGRESSION (review round 6). Both skills said `healthy` is 1 when "the required
  // permissions were observed (the host guide lists the probes)" — and the guide's probes
  // are setup-time. Neither surface named a runtime source, so the agent was left to
  // improvise the flow's security-critical flag.
  it('AC4 — both skills name the RUNTIME source of the health flag', () => {
    for (const skill of [REVIEW, PUBLISH_PR]) {
      expect(skill).toContain('review_identity_health')
      expect(skill).toMatch(/per-run, artifact-free probes/)
      expect(skill).toMatch(/artifact-leaving\*{0,2} probes[\s\S]{0,120}setup-time only/i)
      expect(skill).toMatch(/mid-write is a HALT\*\*|\*\*HALT\*\* on the refused write/)
      // the old, sourceless formulation is gone
      expect(skill).not.toMatch(/the health the host guide's probes report/)
    }
  })

  // REGRESSION (review round 6). Nothing forbade the identity from being the PR author,
  // and no degradation covered it: the host rejects the native event, the verdict never
  // lands as a review, and Step 5.4 still publishes `pair-review` + the `pr-state:*` label.
  it('AC1 — identity-mode self-authorship degrades to COMMENT and is a documented case', () => {
    expect(REVIEW).toMatch(/`identity` where the identity IS the PR author\*\* ⇒ `event = COMMENT`/)
    expect(REVIEW).toMatch(/The review identity IS the PR author\*\* \(`identity` mode/)
    expect(REVIEW).toMatch(/Never publish `pair-review` without the review/)
    // and the read-back that catches a refused submission now has a defined action
    expect(REVIEW).toMatch(/Review: NOT SUBMITTED/)
    expect(REVIEW).toMatch(/not let Step 5\.4 publish a resolved `pair-review`/)
    // the host guide states the setup rule the mechanism backs up
    expect(GITHUB_GUIDE).toMatch(
      /the identity must NOT be an account that opens pull requests in this repository/,
    )
  })

  it('AC3 — health includes being mechanically excluded from the 🔴 gate', () => {
    expect(REVIEW).toContain('review_identity_exclusion_ok')
    expect(REVIEW).toMatch(/not mechanically excluded from the 🔴 gate is \*\*not healthy\*\*/)
  })

  it('AC2 — the state is synthesized ONCE, in Step 5.3, and Step 5.4 publishes that value', () => {
    // the light row needs the synthesis to decide the APPROVE authority, and the label
    // must describe the same value the event was resolved from
    expect(REVIEW).toMatch(/Step 5\.4 publishes this same value and does not re-synthesize it/)
    expect(REVIEW).toMatch(/apply the state Step 5\.3 already synthesized/i)
  })

  // REGRESSION (review round 3). The single `resolve_pr_state` call was nested inside the
  // APPROVE-authority step, which is scoped to `identity` mode AND to an APPROVED verdict,
  // while Step 5.4 was forbidden from making the call itself. In `session` mode (every
  // project today) nothing was ever synthesized, yet Step 5.4 still demands exactly one
  // `pr-state:*` label — so the run either loses the #234/#390 state view or violates the
  // "do not re-synthesize" instruction. Same on any CHANGES-REQUESTED verdict.
  it('the synthesis is its own UNCONDITIONAL step, not nested in the APPROVE authority', () => {
    const step53 = REVIEW.slice(REVIEW.indexOf('### Step 5.3'), REVIEW.indexOf('### Step 5.4:'))
    const synthesis = step53.indexOf('resolve_pr_state <gates> <verdict> <tier>')
    const authority = step53.indexOf('only in `identity` mode, and only when Step 5.2 decided')
    expect(synthesis).toBeGreaterThan(-1)
    expect(authority).toBeGreaterThan(-1)
    // the synthesis comes FIRST and carries no mode/verdict scope of its own
    expect(synthesis).toBeLessThan(authority)
    // REGRESSION (review round 12). It said "all three modes", which is false for `halt`:
    // step 1 of this same list ends that mode ("No host write happens on this path") and
    // the HALT Conditions bullet stops the review outright. The load-bearing claim is that
    // the call is NOT nested inside the identity-only, APPROVED-only authority step.
    expect(step53).toMatch(
      /in \*\*both modes that continue \(`session` and `identity`\) and for every verdict\*\*/,
    )
    expect(step53).not.toContain('all three modes and for every verdict')
    // the `session` skip belongs to the authority step, never to the synthesis
    expect(step53).toMatch(/In `session` mode skip this entirely: `approve-authorized = 0`/)
  })
})

// REGRESSION (review round 12, Major). The story's security-critical containment — a
// bot-user identity is excluded from the 🔴 human-approval predicate ONLY by its login,
// and an unprovisioned login makes it not-healthy ⇒ HALT — was asserted on five surfaces
// while the check meant to enforce it read the WRONG thing: `review_identity_health` was
// fed `${REVIEW_IDENTITY_LOGIN:-}` from the AGENT'S AMBIENT ENVIRONMENT, whereas the
// clause it arms is evaluated in the `pair-explicit-approval` workflow from the REPOSITORY
// VARIABLE (`vars.REVIEW_IDENTITY_LOGIN`). Export the env var without `gh variable set`
// (or set a SECRET instead, or scope the variable to an Environment the
// `pull_request_target` job does not use) and health computed HEALTHY while the gate-side
// clause read the empty string — `.user.login != ""`, true for every account — so an
// APPROVED review by the bot on a `risk:red` head satisfied the explicit HUMAN approval.
describe('the bot-user health input is the REPOSITORY VARIABLE, not ambient state', () => {
  it('the per-run probe reads the variable back and gates AUTH_OK on it', () => {
    expect(GITHUB_GUIDE).toContain(
      'gh api "repos/$REPO/actions/variables/REVIEW_IDENTITY_LOGIN" --jq .value',
    )
    // AUTH_OK is 1 only on the arm where the read SUCCEEDED and named the acting account.
    expect(GITHUB_GUIDE).toMatch(
      /elif \[ "\$ACTING" != "\$RV" \]; then[\s\S]{0,600}\nelse\n {2}AUTH_OK=1/,
    )
  })

  it('the health call is fed that read-back value, and no ambient env var survives', () => {
    expect(GITHUB_GUIDE).toContain('"${RV:-}" "${ACTING:-}")"')
    expect(GITHUB_GUIDE).not.toContain('"${REVIEW_IDENTITY_LOGIN:-}"')
    // the adapter's own usage example must not model the ambient read either
    expect(ADAPTER).not.toContain('"${REVIEW_IDENTITY_LOGIN:-}")"')
  })

  it('both skills name the same source for the <login> they pass', () => {
    for (const skill of [REVIEW, PUBLISH_PR]) {
      expect(skill).toMatch(/repository variable `REVIEW_IDENTITY_LOGIN`/)
      expect(skill).toMatch(/read back on this run|read back from the host/)
    }
  })

  // REGRESSION (review round 13, Major). Round 12 made the per-run probe READ the
  // repository variable back with the BOT'S OWN PAT — but the form's provisioning list
  // grants only `Pull requests: write`, `Commit statuses: write` and `Contents: read`, and
  // `GET /repos/{owner}/{repo}/actions/variables/{name}` needs the `Variables` permission.
  // The `gh variable set` / `gh variable get` of the setup step runs under the MAINTAINER's
  // token, so provisioning succeeds and the gap appears only at review time: the read
  // answers 403, `|| true` swallowed it, `RV` was empty ⇒ AUTH_OK=0 ⇒ health 0 ⇒ HALT on
  // EVERY review and EVERY publish of a repository that is otherwise correctly set up —
  // with the guide's own pointer sending the operator to a permission list that does not
  // name the missing grant.
  it('the bot-user PAT list grants the READ the per-run probe performs', () => {
    const list = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('#### Bot user (alternative)'),
      GITHUB_GUIDE.indexOf('**Per-run health, artifact-free**'),
    )
    expect(list).toContain('Pull requests: write')
    expect(list).toContain('Commit statuses: write')
    expect(list).toMatch(/`Variables: read`/)
  })

  // Second defect in the same lines: an unreadable variable (403, no grant), an unset one
  // (404) and a genuinely dead credential all collapsed into AUTH_OK=0, so health printed
  // "the identity's credential did not authenticate on this run" about a credential that
  // answered 200 one line above. Each cause must print its OWN reason before zeroing the
  // flag — the same rule round 12 applied to the authorship checks.
  it('the read failure is separated from the auth failure and names itself', () => {
    expect(GITHUB_GUIDE).not.toMatch(
      /RV="\$\(gh api "repos\/\$REPO\/actions\/variables\/REVIEW_IDENTITY_LOGIN" --jq \.value 2>\/dev\/null \|\| true\)"/,
    )
    expect(GITHUB_GUIDE).toMatch(
      /elif ! RV="\$\(gh api "repos\/\$REPO\/actions\/variables\/REVIEW_IDENTITY_LOGIN" --jq \.value 2>\/dev\/null\)"; then/,
    )
    // the refused/unset read owns a diagnostic that names the grant and the variable
    const reason = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('could not be READ BACK'),
      GITHUB_GUIDE.indexOf('could not be READ BACK') + 700,
    )
    expect(reason).toContain('Variables: read')
    expect(reason).toContain('gh variable set REVIEW_IDENTITY_LOGIN')
    expect(reason).toMatch(/not a credential failure/i)
  })

  // The failure-mode table sends the operator somewhere: the `bot-user` row must name the
  // read grant too, or the table repeats the omission that produced the permanent HALT.
  it('the failure-mode table names the missing read grant as a cause', () => {
    const row = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('| Configured as `bot-user`'),
      GITHUB_GUIDE.indexOf('| Configured as `bot-user`') + 1400,
    )
    expect(row).toContain('Variables: read')
  })

  it('the smoke matrix covers a REFUSED read on an authenticated credential', () => {
    expect(SMOKE).toMatch(/variable read REFUSED/i)
  })
})

// REGRESSION (review round 13, Minor). Round 12's back-reference was missed: Step 5.4
// step 5 still described the Step 5.3 step 2 call as "run in every mode and for every
// verdict" one screen after :286 was corrected to "both modes that continue". `halt` IS
// one of the three modes and Step 5.3 step 1 ends the review on it, so the two sentences
// assert opposite properties of the same step in a normative document where a step's
// reachability per mode is load-bearing.
describe('review — the synthesis reachability claim is stated once, and identically', () => {
  it('no line in the review skill claims the synthesis runs in every mode', () => {
    expect(REVIEW).not.toContain('run in every mode and for every verdict')
    expect(REVIEW).not.toContain('all three modes and for every verdict')
  })

  it('the Step 5.4 back-reference matches the Step 5.3 wording', () => {
    expect(REVIEW).toMatch(
      /its own unconditional step, run in both modes that continue and for every verdict/,
    )
  })
})

// REGRESSION (review round 13, Minor). This PR renumbered Phase 5 (identity resolution
// became step 3), and the HALT's blast radius was stated twice with different bounds:
// the phase body says "steps 4–6 simply do not run", the HALT Conditions bullet said
// "everything from step 3 on is skipped" — step 3 being the identity resolution that
// PRODUCED the HALT, so a literal reader cannot tell whether the HALT is reachable.
describe('publish-pr — the HALT blast radius is bounded identically in both statements', () => {
  it('the HALT Conditions bullet names steps 4–6, like the phase body', () => {
    expect(PUBLISH_PR).toContain('steps 4–6 simply do not run')
    expect(PUBLISH_PR).toMatch(/steps 4–6 do not run: the check registration/)
    expect(PUBLISH_PR).not.toContain('everything from step 3 on is skipped')
  })
})

describe('review — the light row is wired, gated and audited (AC2, AC3, AC5)', () => {
  it('Step 5.4b evaluates the shipped helper instead of deciding anything itself', () => {
    expect(REVIEW).toContain('Step 5.4b')
    expect(REVIEW).toContain('light_auto_approve_allowed')
    expect(REVIEW).toMatch(/Tag Projection/)
  })

  it('AC3 — the light row is the only authority for the APPROVE event, mechanically', () => {
    // The containment is load-bearing only because the row's result is the third
    // argument of `identity_verdict_event`. Documentation alone would not gate anything:
    // any approving native review satisfies a host `required_approving_review_count >= 1`.
    expect(REVIEW).toMatch(
      /identity_verdict_event <mode> <verdict> <approve-authorized> <self-authored>/,
    )
    expect(REVIEW).toMatch(/light_auto_approve_allowed[\s\S]{0,1200}approve-authorized/)
    expect(REVIEW).toMatch(/APPROVED \+ not authorized\*\* ⇒ `event = COMMENT`/)
    // and every auto-approval mention in the skill is qualified by "light"
    for (const line of REVIEW.split('\n').filter(l => /auto-approv/i.test(l))) {
      expect(line, `unqualified auto-approval mention: ${line.slice(0, 90)}`).toMatch(/light/i)
    }
  })

  // REGRESSION (review round 4, re-opened round 5 for the ADR). Both consumer surfaces
  // enumerated the adapter as four entry points, omitting the security-critical
  // `review_identity_exclusion_ok` — a reader wiring a host adapter from either list builds
  // the health input without the exclusion check, so a bot-user identity with no
  // REVIEW_IDENTITY_LOGIN resolves to `identity` and can sign the 🔴 human approval. Round 4
  // fixed the two KB guides; the ADR — the decision record a second-host implementer reads
  // FIRST — still carried the four-function list, and this loop did not cover it.
  it('every adapter enumeration lists every entry point, exclusion included', () => {
    for (const surface of [GUIDELINE, GITHUB_GUIDE, ADR_018]) {
      const at = surface.indexOf('seven entry points')
      expect(at, 'each surface must announce the adapter enumeration').toBeGreaterThan(-1)
      const list = surface.slice(Math.max(0, at - 700), at + 900)
      expect(list).toContain('review-identity.sh')
      for (const fn of [
        'review_identity_kind_ok',
        'resolve_identity_mode',
        'review_identity_exclusion_ok',
        'review_identity_health',
        'identity_verdict_event',
        'pair_review_publication_mode',
        'identity_audit_comment',
      ]) {
        expect(list, `enumeration must list ${fn}`).toContain(fn)
      }
    }
  })

  it('AC5 — every identity action is audited, in all three directions', () => {
    expect(REVIEW).toContain('identity_audit_comment')
    expect(REVIEW).toMatch(/on every identity action, in all three directions/i)
    // approve / comment / block — the COMMENT-form approving verdict is audited too,
    // otherwise an unauthorized approval would leave no trace of why it was refused.
    expect(REVIEW).toMatch(/`approve`[\s\S]{0,200}`comment`[\s\S]{0,200}`block`/)
    expect(ADAPTER).toMatch(/action\s+: approve \| comment \| block/)
  })

  it('AC2/AC5 — the pr-state:* label mechanics of Step 5.4 are explicitly unchanged', () => {
    expect(REVIEW).toMatch(
      /label[\s\S]{0,120}unchanged by this step|label mechanics are Step 5\.4/i,
    )
  })

  it('AC3 — at 🔴 the row never fires, and the identity never satisfies the human gate', () => {
    expect(REVIEW).toMatch(/At 🔴 the row never fires at all/)
    // both exclusion clauses named — the type one covers an App, the login one a bot user
    expect(REVIEW).toMatch(/user\.type == "User"/)
    expect(REVIEW).toMatch(/REVIEW_IDENTITY_LOGIN/)
  })

  // REGRESSION (review round 4). Step 5.4's idempotency skip jumped to Step 5.5, over the
  // newly inserted Step 5.4b — while Step 5.3 has no skip guard and submits a FRESH native
  // review on every re-invocation. A re-review on an unchanged head therefore produced a
  // second identity review (possibly a second native APPROVE) with NO audit comment and no
  // `Light row:` line, i.e. an identity approval whose reason is not reconstructable from
  // the PR — the property 5.4b exists to guarantee.
  it('Step 5.4 skips only the publication acts, never the identity audit of 5.4b', () => {
    const step = REVIEW.slice(REVIEW.indexOf('### Step 5.4:'), REVIEW.indexOf('### Step 5.4b'))
    expect(step).not.toContain('nothing to publish, move to Step 5.5')
    expect(step).toMatch(
      /skip \*\*steps 3–5 only\*\* and go to \*\*Step 5\.4b\*\*, which still runs/,
    )
    expect(step).toMatch(/submits a \*\*fresh\*\* native review on every re-invocation/)
  })

  // REGRESSION (review round 4). No surface named the command that produces <pr-labels>,
  // and the helper normalised commas but not newlines — so the natural
  // `gh pr view --json labels -q '.labels[].name'` read silently refused every correctly
  // tagged PR, with a stderr denying a `light` tag the PR visibly carries.
  // REGRESSION (review round 12). Collapsing newlines AND commas into spaces made the
  // space-joined read the skill documented as PRIMARY lossy: a code-host label NAME may
  // itself contain spaces (`good first issue`, `help wanted`), so a single label named
  // `ui: light theme` was indistinguishable from the `light` TAG. On a repository that
  // declared the family and sets `required_approving_review_count >= 1`, a risk:green PR
  // carrying only that label reached `ready-to-merge`, the identity signed a native
  // APPROVE, and the audit comment named a `Tag: light` the PR does not carry.
  it('the skill names the UNAMBIGUOUS label read, and the helper matches whole fields', () => {
    // one name per line is now the documented primary read
    expect(REVIEW).toContain(`gh pr view <number> --json labels -q '.labels[].name'`)
    expect(REVIEW).toMatch(/legacy|ambiguous/i)
    // whole-FIELD matching for the two unambiguous shapes; the space split is the fallback
    expect(EVALUATOR).toMatch(/\[ "\$line" = light \]/)
    expect(EVALUATOR).toMatch(/legacy/i)
    expect(EVALUATOR).toMatch(/one name per LINE/i)
    // REGRESSION (review round 13). The two shapes were ONE case arm that translated
    // commas into newlines before splitting — so a comma inside a single label NAME
    // (`theme, light`, the same taxonomy shape as round 12's `ui: light theme`) was read
    // as two whole fields on the LINE form, the shape both skills document as EXACT.
    // A risk:green PR carrying only that label matched, and the identity signed a native
    // APPROVE off a label nobody applied as a tag. Each shape splits on its OWN delimiter.
    expect(EVALUATOR).not.toMatch(/\*\$'\\n'\* \| \*,\*\)/)
    expect(EVALUATOR).toMatch(/\*\$'\\n'\*\) fields="\$labels" ;;/)
    expect(EVALUATOR).toMatch(/\*,\*\) fields="\$\{labels\/\/,\/\$'\\n'\}" ;;/)
    // and the comment no longer claims the comma form is exact for every name
    expect(EVALUATOR).toMatch(/free of commas/i)
    // REGRESSION (review round 13). A string carrying NEITHER delimiter fell through to a
    // SPACE-SUBSTRING matcher — which is exactly what the LINE read emits for a PR carrying
    // ONE label, the shape the asset itself calls exact: `light_auto_approve_allowed
    // "ui: light theme" 1 green ready-to-merge` exited 0 (APPROVE). The no-delimiter case is
    // now ONE whole trimmed field, failing closed; the space-substring arm is gone.
    expect(EVALUATOR).not.toMatch(/case " \$labels " in \*" light "\*\)/)
    expect(EVALUATOR).toMatch(/\*\) fields="\$labels" ;;/)
    expect(EVALUATOR).toMatch(/FAILS[\s#]{0,12}CLOSED/i)
    // the skill states the joined shape fails closed rather than being "still accepted"
    expect(REVIEW).not.toMatch(/is still accepted as a \*\*legacy\*\* input/)
    expect(REVIEW).toMatch(/fails closed/i)
    // and the smoke scenario EXECUTES both no-delimiter directions
    expect(SMOKE).toMatch(/ONE multi-word label containing 'light', no delimiter/)
    expect(SMOKE).toMatch(/the LEGACY space-joined shape \(ambiguous ⇒ never approves\)/)
  })

  // REGRESSION (review round 13). Step 5.3's enumeration of the identity's host writes
  // ("the review, the check, the audit comment") omitted Step 5.4's `pr-state:*` label
  // write, which is also a host write in that range: the actor was unspecified, and if the
  // identity wrote it, the GitHub App baseline (no `issues` grant) makes `POST
  // /repos/{o}/{r}/issues/{n}/labels` answer 403 — colliding two shipped rules on ONE event,
  // "a 403/422 mid-write is a HALT" against the pre-existing "the label is non-blocking".
  it('names the label write actor and scopes the mid-write HALT to the identity writes', () => {
    const step = REVIEW.slice(REVIEW.indexOf('### Step 5.3'), REVIEW.indexOf('### Step 5.4b'))
    expect(step).toMatch(/is not one of them/i)
    expect(step).toMatch(/written by the \*\*session token\*\*/)
    expect(step).toMatch(/The rule is scoped to two of the three writes the identity performs/)
    expect(step).toMatch(/with the session token in every mode/i)
    // and the label's refusal stays the documented non-blocking case, not a HALT
    expect(step).toMatch(/pr-state label: not applied/)
    expect(GITHUB_GUIDE).toMatch(/pr-state label: not applied/)
  })

  it('reports the identity mode and the light-row outcome in the output block', () => {
    expect(REVIEW).toMatch(/├── Identity:/)
    expect(REVIEW).toMatch(/├── Light row:/)
  })

  // REGRESSION (review round 2). Step 5.4b's preamble said "skip the whole step in
  // `session` mode" while its step 2 and the Output Format block list `Light row:` as an
  // unconditional row. Two runs of the same skill on the same PR then emit different
  // report shapes — one with the row, one without it. Scope the skip to the AUDIT action.
  it('Step 5.4b scopes the session-mode skip to the audit, keeping the report row', () => {
    const step = REVIEW.slice(REVIEW.indexOf('### Step 5.4b'), REVIEW.indexOf('### Step 5.5'))
    expect(step).not.toMatch(/Skip the whole step in `session` mode/)
    expect(step).toMatch(/the \*\*audit action\*\* is skipped/)
    expect(step).toMatch(/report row is unconditional/i)
    // and the token step 2 reports is exactly the one the Output Format block lists
    expect(step).toContain('n-a — no identity (session mode)')
    expect(REVIEW).toContain('├── Light row:  [n-a — no identity (session mode)')
  })

  // REGRESSION (review round 3). The session bullet stated COMMENT as an unconditional
  // rule ("the reviewer is the author there"), which is true of self-review only. Scope it,
  // and keep the Graceful Degradation self-review bullet saying the same thing.
  it('the session bullet is scoped to SELF-review, not to the whole default mode', () => {
    expect(REVIEW).toMatch(/`session` \+ a NON-self-authored PR\*\* ⇒ the native `APPROVE`/)
    expect(REVIEW).toMatch(
      /`session` \+ a SELF-authored PR \(or unknown authorship\)\*\* ⇒ `event = COMMENT`/,
    )
    // the blanket rule is gone, not merely counter-argued elsewhere
    expect(REVIEW).not.toMatch(
      /\*\*`session`\*\* \(or any unresolved verdict\) ⇒ `event = COMMENT`/,
    )
    // and the flow says HOW self-authorship is resolved, fail-safe closed
    expect(REVIEW).toMatch(/Pass `0` only when they provably differ/)
  })

  // REGRESSION (review round 3). The same report row was spelled four ways, one of them
  // naming an `Identity approve:` row the Output Format block does not contain — so two
  // runs on the same PR emit structurally different reports and a consumer (the #219
  // automation loop) cannot key on either.
  it('the Light row is spelled with the Output Format block’s own strings, everywhere', () => {
    // the row that never existed in the output block is gone
    expect(REVIEW).not.toContain('Identity approve:')
    // REGRESSION (review round 5). The vocabulary had three values and the row is declared
    // unconditional — but identity mode + CHANGES-REQUESTED (the most common identity
    // action) and identity mode + an unresolved verdict match none of them: Step 5.3 step 3
    // never runs, so there is no unmet condition to name and the verdict was not a COMMENT.
    // A blocking review therefore had to fabricate one of the three.
    // REGRESSION (review round 15). The four values covered every case in which BOTH
    // HALT-bound identity writes succeed. They do not cover the window between them:
    // `identity` mode, sub-red, light declared and carried, state `ready-to-merge` — Step
    // 5.3 step 5 submits the native APPROVE (the PR is now mergeable with no human action
    // wherever required_approving_review_count >= 1), and if the audit comment of Step
    // 5.4b step 1 then meets a 403 the run HALTs with the APPROVE NOT rolled back. The
    // report had no value for an APPROVE whose audit comment never landed, so it had to
    // render `approved — … + audit comment posted`, asserting an artifact the PR does not
    // carry — the exact pairing Step 5.4b's Verify asserts and AC5 requires.
    const values = [
      'n-a — no identity (session mode)',
      'n-a — no approving verdict (row not consulted)',
      'not-authorized — <unmet condition>, verdict submitted as COMMENT',
      'approved — native APPROVE by the identity + audit comment posted',
      'approved — native APPROVE by the identity, audit comment NOT POSTED (<host error>) — HALT, the APPROVE stands',
    ]
    const step = REVIEW.slice(REVIEW.indexOf('### Step 5.4b'), REVIEW.indexOf('### Step 5.5'))
    const output = REVIEW.slice(REVIEW.indexOf('├── Light row:'), REVIEW.indexOf('├── Tier req.:'))
    for (const v of values) {
      expect(output, `the Output Format block must list: ${v}`).toContain(v)
      expect(step, `Step 5.4b must quote the output block verbatim: ${v}`).toContain(v)
    }
    // the degradation bullet fills the placeholder, keeping the same shape
    expect(REVIEW).toContain(
      'Light row: not-authorized — adoption declares no light family, verdict submitted as COMMENT',
    )
    // and the fourth value is bound to the case that produces it, not left for the reader
    // to guess: identity mode where Step 5.2 decided anything other than APPROVED.
    expect(step).toMatch(
      /row not consulted\)`\*\* — `identity` mode with a verdict that is not APPROVED/,
    )
  })

  // REGRESSION (review round 15). Two HALT-bound identity writes run review-then-comment
  // and the HALT does not undo the first: a 403 on the audit comment leaves an
  // auto-approved, merge-ready PR carrying an identity APPROVE with NO audit comment.
  // The order is a CHOICE (every input the comment renders is resolved before the review
  // is submitted), and the residual it carries was stated nowhere — unlike the
  // `pair-review` publication and `pr-state:*` label residuals, both named explicitly.
  it('the audit-comment order is justified and its residual is stated and reported', () => {
    const step53 = REVIEW.slice(REVIEW.indexOf('### Step 5.3'), REVIEW.indexOf('### Step 5.4:'))
    const step54b = REVIEW.slice(REVIEW.indexOf('### Step 5.4b'), REVIEW.indexOf('### Step 5.5'))
    // the order is named as deliberate, with the reason the reverse order is worse
    expect(step53).toMatch(/precedes Step 5\.4b's audit comment, deliberately/)
    expect(step53).toMatch(/the order is a choice, not a dependency/)
    // and the residual it buys is stated, not left for the reader to derive
    expect(step53).toMatch(/does \*\*not\*\* roll the first back/)
    expect(step53).toMatch(/required_approving_review_count >= 1/)
    // the audit write names itself as the second HALT-bound write and where to report it
    expect(step54b).toMatch(/second\*\* of the two HALT-bound identity writes/)
    expect(step54b).toMatch(/has \*\*already landed\*\*/)
    // the pairing invariant carries its one exception instead of being violable in silence
    expect(step54b).toMatch(/paired with its audit comment — \*\*except\*\*/)
    // the HALT entry no longer claims an unqualified "before any host write" for a write
    // that was interrupted mid-flight
    const halt = REVIEW.slice(REVIEW.indexOf('## HALT Conditions'), REVIEW.indexOf('On HALT:'))
    expect(halt).toMatch(/before any further host write/)
    expect(halt).toMatch(/already landed is not rolled back/)
    // and the decision + residual are recorded where the other two residuals are
    expect(ADR_018).toMatch(/HALT does not undo the review/)
    expect(ADR_018).toMatch(/audit comment NOT POSTED/)
  })

  // REGRESSION (review round 8). Step 5.3 step 7 made `Review: NOT SUBMITTED — <host error>`
  // a MANDATORY second value of the `Review:` report row (the read-back shows no review by
  // the resolved actor ⇒ the write was refused), but the Output Format block — the literal
  // rendering contract — still enumerated exactly one. An agent rendering the report from
  // the block therefore asserts "Submitted as native review body" on the very run the
  // read-back proved nothing landed: the same false green the read-back was added to
  // prevent, relocated from the check row to the report row. The trailing absolute is
  // false too — in identity mode Step 5.4b posts a REQUIRED audit comment on every action,
  // so what is absent is a separate VERDICT comment, not every comment.
  it('the Review row enumerates both submission outcomes, like its siblings', () => {
    const row = REVIEW.slice(REVIEW.indexOf('├── Review:'), REVIEW.indexOf('├── Identity:'))
    expect(row).toContain('NOT SUBMITTED — <host error>')
    expect(row).toContain('no separate VERDICT comment')
    // the absolute the mandatory Step 5.4b audit comment falsifies is gone
    expect(row).not.toMatch(/native review body — no separate comment/)
    // and the value the row offers is the one step 7 mandates, spelled the same way
    expect(REVIEW).toMatch(/Review: NOT SUBMITTED — <host error>/)
  })

  // REGRESSION (review round 9). The same class as the `Review:` row above, one row down.
  // Step 5.4 step 3 and Graceful Degradation BOTH mandate `pair-review: NOT PUBLISHED —
  // advisory` and both say CONTINUE, not HALT (session mode, an agent token without
  // `repo:status`, or a host with no statuses API) — while the `Check:` row enumerated only
  // success | failure | pending, every one of which asserts a `pair-review` check EXISTS on
  // the head commit. The agent renders the report from the Output Format block and writes
  // `Check: pair-review → success — published as commit status` on a head that carries no
  // such check: a green REQUIRED check that was never published, read by a human — and by
  // the supervisor loop keying on this row — as merge-satisfied.
  it('the Check row enumerates the NOT PUBLISHED outcome Step 5.4 mandates', () => {
    const row = REVIEW.slice(REVIEW.indexOf('├── Check:'), REVIEW.indexOf('├── Light row:'))
    expect(row).toContain('NOT PUBLISHED — advisory')
    // spelled exactly as the step that mandates it spells it
    expect(REVIEW).toMatch(/pair-review: NOT PUBLISHED — advisory/)
  })

  // REGRESSION (review round 9). Step 4 read `<self-authored>` by comparing the PR author
  // against the acting account and then exempted the App path in the same breath — "an App
  // installation is never a PR author". It can be: an App opens pull requests as
  // `<app-slug>[bot]`, which is how Dependabot appears in `.author.login`. On the exempted
  // path the agent left `self_authored` unset, the identity-mode default is deliberately
  // NOT-self-authored, so `identity_verdict_event` returned REQUEST_CHANGES and GitHub
  // answered `422 Can not request changes on your own pull request` — a mid-write HALT on
  // EVERY review of a project that provisioned ONE App as both PR publisher and reviewer.
  it('identity mode compares authorship for an App identity too — no exemption', () => {
    expect(REVIEW).not.toMatch(/an App installation is never a PR author/)
    // the App's acting login is derivable, and the skill says how
    expect(REVIEW).toMatch(/<app-slug>\[bot\]/)
  })

  // REGRESSION (review round 10). Step 4 instructed the agent to read the author with
  // `gh pr view --json author -q .author.login` and told it that for an App "that login is
  // <app-slug>[bot] ... exactly how Dependabot appears in .author.login". It is not: that
  // read is GraphQL and answers `app/<slug>` (measured — `gh pr view 14276 --repo cli/cli
  // --json author -q .author.login` ⇒ `app/dependabot`, while `gh api
  // repos/cli/cli/pulls/14276 --jq .user.login` ⇒ `dependabot[bot]`). An agent following the
  // instruction computed `self_authored=0` on a PR the identity DID author ⇒ REQUEST_CHANGES
  // ⇒ `422 Can not request changes on your own pull request`.
  it('the acting-login comparison names the shape each API actually returns', () => {
    expect(REVIEW).toMatch(/app\/<app-slug>/)
    expect(REVIEW).toMatch(/GraphQL/)
    expect(REVIEW).not.toMatch(/exactly how Dependabot appears in `\.author\.login`/)
  })
})

describe('publish-pr — the same adapter governs ITS host writes (AC1, AC4)', () => {
  it('reads the Review identity adoption key and composes the adapter', () => {
    expect(PUBLISH_PR).toContain('Review identity')
    expect(PUBLISH_PR).toContain('review-identity.sh')
    expect(PUBLISH_PR).toContain('resolve_identity_mode')
  })

  it('registers pair-review in the resolved form (check run vs commit status)', () => {
    expect(PUBLISH_PR).toContain('pair_review_publication_mode')
    expect(PUBLISH_PR).toMatch(
      /check run[\s\S]{0,120}commit status|commit status[\s\S]{0,120}check run/,
    )
  })

  it('AC4 — HALTs on configured-but-broken and never falls back to the session token', () => {
    expect(PUBLISH_PR).toMatch(/configured but unusable[\s\S]{0,400}HALT/i)
    expect(PUBLISH_PR).toMatch(/never[\s\S]{0,80}fall back to the session (user|token)/i)
  })

  // REGRESSION (review round 5). The HALT entry enumerated what does not happen as "the
  // check registration and the dispatch" — but the identity is resolved in Phase 5 step 3
  // and the `pr-state:to-be-reviewed` label is applied in step 5, i.e. after it. The PR is
  // left open and ready-for-review carrying NO `pr-state:*` label, while the model says a
  // PR carries exactly one; an operator reading the entry never thinks to look.
  it('the HALT entry enumerates the state label among what does not happen', () => {
    const halt = PUBLISH_PR.slice(PUBLISH_PR.indexOf('## HALT Conditions'))
    const entry = halt.slice(halt.indexOf('dedicated review identity is configured but unusable'))
    expect(entry.slice(0, 900)).toContain('pr-state:to-be-reviewed')
  })

  it('the two skills cannot disagree — the resolution is single-sourced in the adapter', () => {
    expect(PUBLISH_PR).toMatch(/never re-derived here|cannot disagree/i)
  })

  it('reports the identity on its own output row', () => {
    expect(PUBLISH_PR).toMatch(/├── Identity:/)
  })

  // REGRESSION (review round 11). Phase 5 step 3 resolved identity health and HALTed BEFORE
  // step 4 read `Review enforcement` (default `disabled`). With enforcement disabled this
  // phase performs NO identity host write at all — step 4's own text is "publish nothing
  // here" — yet a failed health probe aborted everything downstream anyway.
  // FAILURE: project `acme` sets `Review identity: app` and leaves `Review enforcement:
  // disabled` (the default; branch protection typically lands after the identity work). The
  // App private key lives in the CI secret store, the agent runs on a maintainer's laptop,
  // so the JWT→installation-token exchange cannot run ⇒ AUTH_OK unset ⇒
  // review_identity_health ⇒ 0 ⇒ resolve_identity_mode 1 0 ⇒ halt. The PR is created and
  // marked ready-for-review, then the flow stops: no `pr-state:to-be-reviewed` label (the PR
  // is invisible in the board view pr-states.md drives) and NO REVIEW DISPATCH — on every
  // story, indefinitely, for a credential that would not have written anything here. The
  // review re-resolves the identity at its own Step 5.4, where the writes happen, so halting
  // at publish time protects nothing. AC4 scopes the HALT to "when any identity action is
  // attempted"; with enforcement disabled none is.
  it('the identity HALT is scoped to a phase that actually writes as the identity', () => {
    const step3 = PUBLISH_PR.slice(
      PUBLISH_PR.indexOf('3. **Act — resolve WHO writes'),
      PUBLISH_PR.indexOf('4. **Act — register the check as pending'),
    )
    // the enforcement value is read BEFORE the halt decision, not after it in step 4
    expect(step3).toMatch(/Review enforcement/)
    // and the disabled branch continues to the label + the dispatch instead of halting
    expect(step3).toMatch(/no identity write in this phase/)
    expect(step3).toMatch(/continue to steps 5 and 6/)
    // the HALT entry carries the same scope, and the degradation lists the continue case
    const halt = PUBLISH_PR.slice(PUBLISH_PR.indexOf('## HALT Conditions'))
    const entry = halt.slice(halt.indexOf('dedicated review identity is configured but unusable'))
    expect(entry.slice(0, 1400)).toMatch(/Review enforcement/)
    const degradation = PUBLISH_PR.slice(PUBLISH_PR.indexOf('## Graceful Degradation'))
    expect(degradation).toMatch(/unusable and `Review enforcement` is `disabled`/)
    // the output row enumerates the value that case reports
    expect(PUBLISH_PR).toMatch(/├── Identity:.*Review enforcement disabled/)
  })
})

describe('pr-states.md — the model carries the identity and the light row (AC1, AC3)', () => {
  it('defines the three modes and no fourth', () => {
    expect(GUIDELINE).toMatch(/Dedicated review identity/)
    for (const mode of ['`session`', '`identity`', '`halt`']) expect(GUIDELINE).toContain(mode)
  })

  // REGRESSION (review round 13). Both model surfaces stated the halt rule ABSOLUTELY
  // ("configured but unusable … the flow HALTs"), while publish-pr Phase 5 step 3 carves out
  // `halt` + `Review enforcement: disabled` — the default everywhere — as NOT a HALT. The
  // carve-out existed only in the consumer skill, so a host adapter or a second consumer
  // written from the model halts EVERY publish on an enforcement-disabled project with a
  // half-provisioned identity: it cannot open a pull request at all.
  it('scopes the HALT to a phase that performs an identity host write', () => {
    const row = GUIDELINE.split('\n').find(l => l.startsWith('| `halt` |'))
    expect(row).toBeDefined()
    expect(row).toMatch(/binds a phase that actually performs an identity host write/i)
    expect(row).toMatch(/Review enforcement/)
    expect(row).toMatch(/reports the identity as unusable|reports .*unusable/i)
    expect(row).toMatch(/continues/i)
    // and the ADR amendment carries the same clause, not just the consumer skill
    expect(ADR_018).toMatch(/actually performs an identity host write/i)
    expect(ADR_018).toMatch(/Review enforcement: `?disabled`?/)
    // the consumer skill it was reconciled with is unchanged in intent
    expect(PUBLISH_PR).toMatch(/writes \*\*nothing\*\* as the identity/)
  })

  it('AC6 — states the one-line 🔴 rule verbatim enough to be unmissable', () => {
    expect(GUIDELINE).toMatch(/never counts as the explicit human approval/i)
    expect(GUIDELINE).toMatch(/user\.type == "User"/)
    expect(GUIDELINE).toMatch(/second human account/i)
  })

  it('carries the same residual as its two twins — the containment is CONDITIONAL', () => {
    expect(GUIDELINE).toMatch(/That containment is conditional/i)
    expect(GUIDELINE).toMatch(/merge-authorizing action/i)
    expect(DOCS_PAGE).toMatch(/merge-authorizing label/i)
    expect(DOCS_PAGE).toMatch(/nothing verifies \*who\* applied the tag/i)
  })

  it('AC3 — the light row is documented as adoption-gated and criteria-free', () => {
    expect(GUIDELINE).toMatch(/Adoption is the gate, the label is not/i)
    expect(GUIDELINE).toMatch(/Zero criteria[\s\S]{0,120}D18/i)
    expect(GUIDELINE).toMatch(/light_auto_approve_allowed/)
    expect(GUIDELINE).toMatch(/sibling/i)
  })

  it('adds the identity to the actor table as an ACTOR, never a decider', () => {
    expect(GUIDELINE).toMatch(/\*\*Dedicated review identity\*\*[\s\S]{0,200}actor/i)
  })

  it('host mechanics are deferred, not restated (R2.12)', () => {
    expect(GUIDELINE).toMatch(/github-implementation\.md\)? § "Dedicated review identity"/)
    expect(GUIDELINE).toMatch(/names no host/i)
  })

  it('links the adapter next to the evaluator it sits beside', () => {
    expect(GUIDELINE).toContain('review-identity.sh')
  })
})

describe('github-implementation.md — per-host setup lives here (AC1, AC4)', () => {
  it('documents BOTH forms, with the App recommended and the bot user as alternative', () => {
    expect(GITHUB_GUIDE).toMatch(/#### GitHub App \(recommended\)/)
    expect(GITHUB_GUIDE).toMatch(/#### Bot user \(alternative\)/)
  })

  it('states the least-privilege permission set for each form', () => {
    expect(GITHUB_GUIDE).toMatch(/pull_requests: write/)
    expect(GITHUB_GUIDE).toMatch(/checks: write/)
    expect(GITHUB_GUIDE).toMatch(/repo:status|Commit statuses: write/)
    // the identity must not be able to edit the protection that constrains it
    expect(GITHUB_GUIDE).toMatch(/Do \*\*not\*\* grant `administration`/)
  })

  it('keeps the credential out of the repository and points at the security guidelines', () => {
    expect(GITHUB_GUIDE).toMatch(/security-guidelines\.md/)
    expect(GITHUB_GUIDE).toMatch(/never enters the repository/i)
    expect(GITHUB_GUIDE).toMatch(/secret store/i)
  })

  it('carries the verification probes that produce the adapter’s health input', () => {
    expect(GITHUB_GUIDE).toMatch(/gh api user --jq/)
    expect(GITHUB_GUIDE).toMatch(/403[\s\S]{0,200}configured-but-broken/i)
  })

  it('AC1 — the App path publishes pair-review as a check run, single-variable form', () => {
    expect(GITHUB_GUIDE).toMatch(/repos\/\$REPO\/check-runs/)
    // the pre-existing invariant: never the two-variable form (404 for a copy-paster)
    expect(GITHUB_GUIDE).not.toMatch(/repos\/\$OWNER\/\$REPO/)
  })

  it('AC6 — the comparison table keeps the 🔴 row constant across all three modes', () => {
    expect(GITHUB_GUIDE).toMatch(/🔴 explicit approval[\s\S]{0,300}second \*\*human\*\*/)
  })

  it('states the bot-USER exclusion as a MECHANISM, not as advice', () => {
    // The footgun is that a machine USER account types as "User" and is therefore
    // indistinguishable from a human by the type clause. Prose telling a maintainer to
    // "keep it out of the human-reviewer set" is not a containment — the login clause is.
    expect(GITHUB_GUIDE).toMatch(/Only a GitHub \*\*App\*\* types as `"Bot"`/)
    expect(GITHUB_GUIDE).toMatch(/MANDATORY for this form — provision `REVIEW_IDENTITY_LOGIN`/)
    expect(GITHUB_GUIDE).toContain('gh variable set REVIEW_IDENTITY_LOGIN')
    expect(GITHUB_GUIDE).toContain('REVIEW_IDENTITY_LOGIN: ${{ vars.REVIEW_IDENTITY_LOGIN }}')
    expect(GITHUB_GUIDE).toMatch(/review_identity_exclusion_ok/)
  })

  it('AC3 — the light row section states both containments', () => {
    expect(GITHUB_GUIDE).toMatch(/The declaration is the gate, not the label/i)
    expect(GITHUB_GUIDE).toMatch(/It never touches 🔴/i)
  })

  // REGRESSION (review round 8). "Two containments are worth stating" was followed by
  // THREE bullets, the middle one labelled `Residual, once you HAVE declared it` — the
  // thing the containments explicitly do NOT cover. An adopter counting three under a
  // heading promising two reads the residual as a third containment, i.e. as reassurance,
  // and the one item in the section that demands an action outside pair (access-control
  // the `light` label before opting in) is the one that gets skipped. pr-states.md already
  // folds the residual INTO the declaration bullet; the host page must match.
  it('the containment enumeration matches its announced count', () => {
    const idx = GITHUB_GUIDE.indexOf('containments are worth stating on the host page')
    expect(idx).toBeGreaterThan(-1)
    const block = GITHUB_GUIDE.slice(
      idx,
      GITHUB_GUIDE.indexOf('### Provision the `pr-state:*` labels'),
    )
    expect(GITHUB_GUIDE).toMatch(/^Two containments are worth stating on the host page/m)
    expect(block.match(/^- \*\*/gm)?.length, 'two announced, two bullets').toBe(2)
    // the residual is no longer a peer bullet contradicting the count
    expect(block).not.toMatch(/^- \*\*Residual, once you HAVE declared it/m)
    // …and it is not lost either: it lives inside the declaration bullet, as in pr-states.md
    const declaration = block.slice(
      block.indexOf('- **The declaration is the gate'),
      block.indexOf('- **It never touches 🔴'),
    )
    expect(declaration).toMatch(/merge-authorizing/)
    expect(declaration).toMatch(/write or triage/i)
  })

  // REGRESSION (review round 2). "Adoption is the gate" contains the mis-tagging abuse
  // only on repositories that did NOT declare the family. On one that HAS — and that sets
  // required_approving_review_count >= 1 — any write/triage collaborator can label their
  // own PR `light` + `risk:green` and the identity's APPROVE satisfies the host rule with
  // no second human. Nothing verifies who applied the label; the adopter must be told.
  it('states the residual: once declared, `light` is a merge-authorizing capability', () => {
    expect(GITHUB_GUIDE).toMatch(/merge-authorizing capability/i)
    expect(GITHUB_GUIDE).toMatch(/write or triage/i)
    expect(GITHUB_GUIDE).toMatch(/Nothing in the flow verifies \*\*who\*\* applied the label/)
  })

  it('AC3 — and says WHY the row gates anything at all', () => {
    expect(GITHUB_GUIDE).toMatch(/Why it is this row and not every approving verdict/i)
    expect(GITHUB_GUIDE).toMatch(/third argument of `identity_verdict_event`/)
  })

  it('AC1 — the App path documents how to obtain the installation token it depends on', () => {
    // Step 4 declares GH_TOKEN to be the installation token; without the exchange a
    // maintainer following the recommended path end-to-end cannot complete it.
    expect(GITHUB_GUIDE).toMatch(/Mint the installation token/)
    expect(GITHUB_GUIDE).toMatch(/app\/installations\/\$INSTALLATION_ID\/access_tokens/)
    expect(GITHUB_GUIDE).toMatch(/actions\/create-github-app-token/)
  })

  // REGRESSION (review round 4). The exchange was documented as
  // `GH_TOKEN="$JWT" gh api -X POST app/installations/.../access_tokens`, i.e. it assumed
  // gh's own Authorization scheme is accepted for an App JWT. GitHub documents the
  // endpoint with an explicit `Authorization: Bearer <JWT>` header, and a 401 here is
  // indistinguishable from a bad signature — so an unverified scheme makes the whole App
  // identity unprovisionable by following the guide, and the failure lands at setup.
  it('the JWT → installation-token exchange uses the form GitHub documents', () => {
    expect(GITHUB_GUIDE).toContain('-H "Authorization: Bearer $JWT"')
    expect(GITHUB_GUIDE).toContain(
      '"https://api.github.com/app/installations/$INSTALLATION_ID/access_tokens"',
    )
    // the ambiguous form is gone, not merely commented on
    expect(GITHUB_GUIDE).not.toMatch(/GH_TOKEN="\$JWT" gh api/)
  })

  it('AC4 — the App health probes are ones an INSTALLATION token can actually serve', () => {
    // `gh api user` answers 403 for an installation token (it is not associated with a
    // user), so using it as the first probe fails a correctly-provisioned App and HALTs
    // every review on a setup that is in fact fine.
    expect(GITHUB_GUIDE).toMatch(/gh api \/installation\/repositories/)
    expect(GITHUB_GUIDE).toMatch(/`gh api user` does NOT work/)
    expect(GITHUB_GUIDE).toMatch(/403 Resource not accessible by integration/)
  })

  // REGRESSION (review round 9). The probe's own comment claimed "the credential
  // authenticates AND the identity is scoped to THIS repo" while the code tested
  // `.total_count` only — reachability, never membership. An installation token is valid
  // for the INSTALLATION (org-wide), so the endpoint answers 200 in a repository the App
  // was never installed on: health passed, the whole review executed, and the FIRST host
  // write 404'd into the mid-write HALT with a diagnostic blaming a revoked grant.
  it('AC4 — the AUTH probe tests MEMBERSHIP of this repo, not reachability', () => {
    expect(GITHUB_GUIDE).toMatch(
      /gh api \/installation\/repositories --paginate --jq '\.repositories\[\]\.full_name'/,
    )
    expect(GITHUB_GUIDE).not.toMatch(
      /gh api \/installation\/repositories --jq '\.total_count' >\/dev\/null 2>&1 && AUTH_OK=1/,
    )
    // REGRESSION (review round 10). `grep -qx` reads `$REPO` as a BASIC REGEX. Repository
    // names routinely contain `.`, so `$REPO=acme/pair.js` matches a listed `acme/pairXjs`
    // (measured: `printf 'acme/pairXjs\n' | grep -qx 'acme/pair.js'` exits 0, `grep -Fqx`
    // does not) ⇒ membership asserted on a repository the App was never installed on, and
    // the FIRST host write 404s into the mid-write HALT this probe exists to rule out.
    expect(GITHUB_GUIDE).toMatch(/grep -Fqx "\$REPO" && AUTH_OK=1/)
    expect(GITHUB_GUIDE).not.toMatch(/grep -qx "\$REPO"/)
  })

  // REGRESSION (review round 9). Probe 3 assigned `PR_AUTHOR` under the comment "it
  // catches the provisioning mistake before any host write" and then compared it to
  // nothing — a dead assignment, while the bot-user twin gates on it. And the MANDATORY
  // "must not open pull requests" rule lived under the *Bot user* heading only, so an
  // adopter following the RECOMMENDED App path never met it. One App used as both PR
  // publisher and reviewer therefore passed health and HALTed mid-write on every review.
  it('AC4 — the App author probe GATES, and the setup rule covers both forms', () => {
    // REGRESSION (review round 10). The round-9 gate was `[ "$PR_AUTHOR" =
    // "${APP_SLUG:-}[bot]" ]` against an author read with `gh pr view --json author`. That
    // read goes through GraphQL, where gh renders a Bot actor as `app/<slug>`; `<slug>[bot]`
    // is the REST shape (`.user.login`). MEASURED:
    //   gh pr view 14276 --repo cli/cli --json author -q .author.login  ⇒ app/dependabot
    //   gh api repos/cli/cli/pulls/14276 --jq .user.login               ⇒ dependabot[bot]
    // The comparison could therefore never be true and the gate was inert: a project using
    // ONE App both to publish PRs and as `Review identity: app` passed health, ran the whole
    // review, and got `422 Can not request changes on your own pull request` on the last
    // step — every review discarded mid-write. Both shapes are compared now.
    expect(GITHUB_GUIDE).toMatch(
      /"app\/\$\{APP_SLUG:-\}" \| "\$\{APP_SLUG:-\}\[bot\]"\)[\s\S]{0,400}?PERMS_OK=0/,
    )
    expect(GITHUB_GUIDE).toMatch(/GraphQL and answers\s+#\s+`app\/<slug>`/)
    expect(GITHUB_GUIDE).toMatch(/app\/dependabot/)
    // the slug is obtainable: `GET /app` is a JWT endpoint, so step 4 captures it
    expect(GITHUB_GUIDE).toMatch(/APP_SLUG=/)
    // and the rule is stated where BOTH forms read it, above the App section
    const shared = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('### Dedicated review identity'),
      GITHUB_GUIDE.indexOf('#### GitHub App (recommended)'),
    )
    expect(shared).toMatch(
      /the identity must NOT be an account that opens pull requests in this repository/,
    )
    expect(shared).toMatch(/<app-slug>\[bot\]/)
  })

  it('AC4 — the guide separates the setup probes from the per-run health check', () => {
    expect(GITHUB_GUIDE).toMatch(/5\. \*\*Verify ONCE, at setup\*\*/)
    expect(GITHUB_GUIDE).toMatch(/\*\*Run them once at setup, never per review\*\*/)
    expect(GITHUB_GUIDE).toMatch(/6\. \*\*Check the identity's health on EVERY run\*\*/)
    expect(GITHUB_GUIDE).toMatch(/cheap and artifact-free/)
    // the per-run App probes: an installation token can serve both
    expect(GITHUB_GUIDE).toMatch(/AUTH_OK=0/)
    expect(GITHUB_GUIDE).toMatch(/PERMS_OK=0/)
    // the write grant is proved by the MINT, which 422s when the grant is absent
    expect(GITHUB_GUIDE).toMatch(/"permissions":\{"pull_requests":"write","checks":"write"/)
    expect(GITHUB_GUIDE).toMatch(/422 when the installation/)
    // and the residual a read probe cannot cover
    expect(GITHUB_GUIDE).toMatch(/A `403`\/`422` met MID-WRITE is a HALT, not a fallback/)
  })

  it('AC4 — the probes cover pull_requests WRITE, not read only', () => {
    // a read-only grant passes every read probe and then 403s mid-flow, AFTER
    // pair-review was already published — the case the HALT exists to prevent
    expect(GITHUB_GUIDE).toMatch(/pull_requests: WRITE/)
    expect(GITHUB_GUIDE).toMatch(/gh api "repos\/\$REPO\/issues\/comments\/\$CID" -X DELETE/)
  })

  // REGRESSION (review round 10). This story made `pair-review` DUAL-FORM — a check run on
  // an `app` identity, a commit status otherwise — resolved independently by publish-pr at
  // PR creation and by review Step 5.4 later. Nothing reconciled the two forms on one head.
  // FAILURE: PR #100 is published while `Review identity: none`, so its head carries a
  // PENDING COMMIT STATUS named `pair-review`; the team then provisions an App and sets
  // `Review identity: app`; the review of #100 publishes a `success` CHECK RUN of the same
  // name. One required context, two independent records, and the stale pending status is
  // cleared by nothing in the flow — if branch protection honours it, #100 is permanently
  // unmergeable with a manual POST /repos/{owner}/{repo}/statuses/{sha} as the only exit.
  // The guide already stated this rule for the sibling context `pair-explicit-approval`
  // ("One producer per required context") and nowhere for this one.
  it('AC4 — switching `Review identity` with PRs open keeps one producer per context', () => {
    const shared = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('### Dedicated review identity'),
      GITHUB_GUIDE.indexOf('#### GitHub App (recommended)'),
    )
    expect(shared).toMatch(/CHANGING `Review identity`/)
    expect(shared).toMatch(/one required context/)
    // both exits are documented, and the recovery write is a concrete command
    expect(shared).toMatch(/[Dd]rain/)
    expect(shared).toMatch(/gh api "repos\/\$REPO\/statuses\/\$HEAD_SHA"/)
    expect(shared).toMatch(/superseded by the pair-review check run/)
    // and both publishers carry the rule, since both resolve the form independently
    expect(PUBLISH_PR).toMatch(/producer per required context/)
    expect(REVIEW).toMatch(/producer per required context/)
  })

  // REGRESSION (review round 11). The transition rule's SECOND exit 403s as documented, so
  // it silently fails to clear the stale record it exists to clear. Step 4 mints the
  // installation token with an EXPLICIT `permissions` payload, and an installation access
  // token carries ONLY the requested subset — the guide's own note says GitHub 422s a
  // permission the installation lacks, which makes the payload, not the grant, the authority
  // for what the token can do. Nothing in the App registration list or in step 4 ever
  // requested `statuses`.
  // FAILURE: project `acme` runs `Review identity: none` with PR #100 open, whose head
  // carries a PENDING COMMIT STATUS named `pair-review` from publish-pr. It provisions an
  // App, sets `Review identity: app` and takes the supersede exit, granting
  // `Commit statuses: write` exactly as the snippet said. The review mints GH_TOKEN
  // (pull_requests/checks/contents only), publishes the `pair-review` CHECK RUN, then runs
  // the supersede arm ⇒ `403 Resource not accessible by integration`. The stale pending
  // status survives; where branch protection honours it, #100 is permanently unmergeable
  // with a manual POST /statuses as the only exit — the outcome the rule was added to prevent.
  it('AC4 — the supersede exit names the MINT permission it needs, not only the App grant', () => {
    const shared = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('### Dedicated review identity'),
      GITHUB_GUIDE.indexOf('#### GitHub App (recommended)'),
    )
    // the snippet states the payload change, not just the registration grant
    expect(shared).toMatch(/"statuses":"write"/)
    expect(shared).toMatch(/permissions` payload/)
    // and why requesting it unconditionally is not the answer
    expect(shared).toMatch(/422/)
    // the App permission list cross-references it as conditional on that exit
    const appSetup = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('#### GitHub App (recommended)'),
      GITHUB_GUIDE.indexOf('5. **Verify ONCE, at setup**'),
    )
    expect(appSetup).toMatch(/`statuses: write`/)
    expect(appSetup).toMatch(/conditional, NOT part of the baseline/)
    expect(appSetup).toMatch(/supersede/)
    // and the mint payload itself says the subset it requests is the limit
    expect(appSetup).toMatch(/token carries ONLY this subset/)
  })

  it('the probe snippet is self-contained and declares the artifacts it leaves', () => {
    const probes = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('5. **Verify ONCE, at setup**'),
      GITHUB_GUIDE.indexOf("6. **Check the identity's health on EVERY run**"),
    )
    expect(probes).toMatch(/PR=<pr-number>/)
    expect(probes).toMatch(/HEAD_SHA="\$\(gh pr view "\$PR" --repo "\$REPO" --json headRefOid/)
    expect(probes).toMatch(/These probes leave artifacts on a real pull request/)
  })

  // REGRESSION (review round 2). Same defect class as the probe block, one section
  // later: with `$IDENTITY_CONFIGURED`/`$IDENTITY_HEALTHY`/`$IDENTITY_KIND` unset, the
  // copied block resolves `session` ⇒ `commit-status` and the App identity silently
  // publishes a commit status instead of the check run — no error, the wrong artifact.
  it('the App publication snippet assigns its three identity inputs from real sources', () => {
    const pub = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('7. **Publish `pair-review` as a check run**'),
      GITHUB_GUIDE.indexOf('#### Bot user (alternative)'),
    )
    // REGRESSION (review round 3). The round-2 assignment was anchored at
    // `^Review identity:` while adoption ships the key as a markdown bullet with bold
    // markers, so it matched NOTHING and every configured identity silently resolved
    // `none` ⇒ `session` ⇒ `commit-status`. The extraction must strip bullet, bold and
    // backticks — and it is EXECUTED against the real files by the smoke scenario, which
    // is what makes this a behavior contract rather than a string.
    expect(pub).toMatch(/IDENTITY_KIND="\$\(sed -n 's\/\^-\[\[:space:\]\]\*\\\*\\\*Review identity/)
    expect(SMOKE).toMatch(/KIND_EXTRACT="\$\(grep -m1 -F 'IDENTITY_KIND="\$\(sed -n'/)
    expect(SMOKE).toMatch(/extraction on THIS repo's way-of-working \(bullet form\) ⇒ none" none/)
    expect(SMOKE).toMatch(/a configured App adoption ⇒ app"\s+app/)
    // REGRESSION (review round 4). The round-3 extraction recognised ONLY the exact
    // bullet+bold form and degraded anything else to `none` = session mode — the
    // session-user fallback AC4 forbids, reached with no HALT because the flow never
    // learned an identity was configured. Presence is now detected format-agnostically
    // and the value is validated by the adapter.
    expect(pub).toMatch(/^\s+IDENTITY_KEY_PRESENT=0$/m)
    // REGRESSION (review round 6). PRESENCE was a bare `grep -qi 'Review identity'` over
    // the whole file, so ANY prose occurrence of the phrase set IDENTITY_KEY_PRESENT=1 and
    // the empty extraction then HALTed instead of resolving `none`. A project that runs no
    // identity, deletes the key and keeps one explanatory sentence ("we use no dedicated
    // review identity — reviews run with the session token") gets a permanent review
    // outage, with a HALT telling it to declare an identity it deliberately has not got.
    // The probe is anchored to the KEY SHAPE — phrase, then colon — and both prose shapes
    // are EXECUTED against it by the smoke scenario.
    // REGRESSION (review round 8). The round-6 anchor `(^|[^[:alnum:]])` matched the phrase
    // ANYWHERE in a line, so a colon-bearing SENTENCE — "A note on review identity: we
    // deliberately run none, reviews use the session token." — answered PRESENT on a
    // project that configured nothing. The extraction is empty, `review_identity_kind_ok ''`
    // fails, and the IDENTITY_KEY_PRESENT=1 branch exits 1: every review and every PR
    // publication on that repository HALTs, pointing the adopter at a key they never wrote.
    // Anchor at the start of the line, past optional list/bold decoration — the two shapes
    // the design MUST HALT on are line-leading keys and classify identically.
    // REGRESSION (review round 13). The class admitted ONLY `-`/`*` before the phrase while
    // the comment claimed to be "agnostic about DECORATION", so `## Review identity: app`
    // and `> - **Review identity**: app` answered present=0. The extraction is empty on
    // those shapes too, so the key read as genuinely ABSENT ⇒ `none` ⇒ mode `session`: the
    // review, and where the host counts it the APPROVE, written with the SESSION token on a
    // repository that DID configure an identity — with no HALT. Blockquote and ATX-heading
    // decoration are now in the class, and the accepted shapes are ENUMERATED in the comment
    // instead of claimed universal. Both new shapes are EXECUTED by the smoke scenario.
    expect(pub).toMatch(
      /^\s+grep -qiE '\^\[\[:space:\]\]\*\(>\[\[:space:\]\]\*\)\*\(#\{1,6\}\[\[:space:\]\]\*\)\?\[-\*\]\?\[\[:space:\]\]\*\\\*\{0,2\}Review identity/m,
    )
    expect(GITHUB_GUIDE).not.toMatch(/Format-agnostic about DECORATION/)
    expect(SMOKE).toMatch(/the key as an ATX HEADING ⇒ HALT/)
    expect(SMOKE).toMatch(/the key inside a BLOCKQUOTE ⇒ HALT/)
    // the two superseded forms survive only inside the comment explaining why they were wrong
    expect(pub).not.toMatch(/^\s+grep -qi 'Review identity' "\$WOW"/m)
    expect(pub).not.toMatch(/^\s+grep -qiE '\(\^\|\[\^\[:alnum:\]\]\)/m)
    expect(SMOKE).toMatch(/PROSE mentioning the phrase, no key ⇒ none \(never a HALT\)/)
    expect(SMOKE).toMatch(/PROSE with the phrase FOLLOWED BY A COLON mid-sentence ⇒ none/)
    expect(pub).toMatch(/^\s+if ! review_identity_kind_ok "\$IDENTITY_KIND"; then$/m)
    expect(pub).toMatch(/if \[ "\$IDENTITY_KEY_PRESENT" = 1 \]; then[\s\S]{0,400}exit 1/)
    // and the negative variants are EXECUTED by the smoke scenario, both directions
    expect(SMOKE).toMatch(/the key without the BOLD markers ⇒ HALT/)
    expect(SMOKE).toMatch(/the key without the leading BULLET ⇒ HALT/)
    expect(pub).toMatch(/^\s+IDENTITY_CONFIGURED=0$/m)
    expect(pub).toMatch(/^\s+IDENTITY_HEALTHY=0$/m)
    // and it names where the health flag comes from: THIS RUN's probes, through the
    // adapter entry point that folds in the exclusion check.
    expect(pub).toMatch(/review_identity_health "\$IDENTITY_KIND" "\$\{AUTH_OK:-0\}"/)
    // REGRESSION (review round 6). The inert `PROBES_PASSED=0  # set to 1 by whatever ran
    // step 5's probes` had NO writer anywhere in the corpus, and step 5's probes are
    // explicitly setup-time (they leave an undeletable check run). Following the guide
    // literally gave `resolve_identity_mode 1 0` ⇒ halt on EVERY review of a correctly
    // provisioned repository; following the skills gave a `pair-identity-probe` check run
    // branded on every reviewed head. The dead variable is gone, not merely explained.
    expect(pub).not.toMatch(/PROBES_PASSED/)
    expect(GITHUB_GUIDE).not.toMatch(/PROBES_PASSED/)
    // the kind is the adoption literal, forwarded — no undocumented mapping to invent
    expect(pub).toMatch(/forwarded VERBATIM/)
  })

  // REGRESSION (review round 2). The pre-existing "Token prerequisite" paragraph said a
  // check run "must happen inside a workflow holding `checks: write`, plus a relay" — the
  // opposite of the App path added below it, which mints an installation token agent-side.
  // A maintainer reading top-to-bottom would build a relay, or pick `bot-user` to avoid it.
  it('the token prerequisite is scoped to the session path and points at the App exception', () => {
    expect(GITHUB_GUIDE).toMatch(/whenever no dedicated review identity is configured/)
    expect(GITHUB_GUIDE).toMatch(/The App path is the documented exception, and it needs no relay/)
    expect(GITHUB_GUIDE).toContain('installation token** agent-side')
    // the contradicted claim is gone, not merely counter-argued elsewhere
    expect(GITHUB_GUIDE).not.toMatch(/plus a relay that carries the agent's verdict there/)
  })
})

describe('adoption — the identity is opt-in and the light row is inert here (AC3)', () => {
  it('the way-of-working TEMPLATE declares `Review identity`, defaulting to none', () => {
    expect(WOW_TEMPLATE).toMatch(/\*\*Review identity\*\*: `none` \(default\)/)
    expect(WOW_TEMPLATE).toMatch(/HALT\*{0,2}, never a silent fallback/i)
  })

  it('this repository declares it too, and still requires a second human at 🔴', () => {
    expect(ROOT_WOW).toMatch(/\*\*Review identity\*\*: `none` \(default\)/)
    expect(ROOT_WOW).toMatch(/second human account/i)
  })

  it('this repository declares NO light projection — the row ships inert (Assumption 6)', () => {
    expect(RISK_MATRIX).toMatch(/^Active: risk$/m)
    expect(RISK_MATRIX).not.toMatch(/^Active:.*light/m)
  })
})

describe('ADR-018 — the amendment records adoption AND the non-changes (AC6)', () => {
  it('is recorded as an amendment to the existing ADR, not a new one', () => {
    expect(ADR_018).toMatch(/### Amendment \(2026-08-28\)/)
    expect(ADR_018).toMatch(/Option 4/)
    expect(ADR_018).toContain('#218')
  })

  it('states what is adopted: identity + host-agnostic adapter + light row', () => {
    expect(ADR_018).toContain('review-identity.sh')
    expect(ADR_018).toContain('light_auto_approve_allowed')
    expect(ADR_018).toMatch(/host-agnostic adapter/i)
  })

  it('states what is NOT changed: the 🔴 predicate and resolve_pr_state’s table', () => {
    expect(ADR_018).toMatch(/user\.type == "User"/)
    expect(ADR_018).toMatch(/`resolve_pr_state`'?s table is untouched/i)
    expect(ADR_018).toMatch(/[Ll]ight applies \*\*below red only\*\*/)
  })

  it('supersedes the "identity stays out of scope" consequence instead of contradicting it', () => {
    expect(ADR_018).toMatch(/Superseded by the 2026-08-28 amendment/)
    // the half that still holds must be restated, not silently dropped
    expect(ADR_018).toMatch(/second human account remains the only way to satisfy 🔴/)
    // REGRESSION (review round 5). That restatement justified the 🔴 exclusion by account
    // type ALONE and claimed the amendment "does not touch that rule" — false for the
    // `bot-user` form, which types as "User", and the login clause IS the one shipped
    // predicate change in this amendment. An adopter reading Consequences concluded the
    // exclusion was automatic and skipped provisioning REVIEW_IDENTITY_LOGIN.
    const consequence = ADR_018.slice(
      ADR_018.indexOf('second human account remains the only way to satisfy 🔴'),
    ).slice(0, 600)
    expect(consequence).toContain('REVIEW_IDENTITY_LOGIN')
    expect(consequence).not.toMatch(/the amendment does not touch that rule/)
  })

  it('is honest about what is NOT yet verified on a live host (T11)', () => {
    expect(ADR_018).toMatch(/not\*\* yet observed on a live host|T11/)
  })

  // REGRESSION (review round 10). The amendment asserted the App-authorship containment as
  // shipped while naming only the REST login shape, matching a probe that compared the
  // GraphQL read against it and could never fire.
  it('names both login shapes in the App-authorship containment', () => {
    expect(ADR_018).toMatch(/app\/<app-slug>/)
    expect(ADR_018).toMatch(/<app-slug>\[bot\]/)
  })

  // REGRESSION (review round 10). `pair-review` is dual-form as of this amendment, and the
  // form is resolved INDEPENDENTLY by publish-pr (at PR creation) and by review Step 5.4.
  // A PR opened under `Review identity: none` carries a PENDING COMMIT STATUS named
  // `pair-review`; switch the project to `app` and the review of that same PR publishes a
  // CHECK RUN of the same name — two independent producers on one required context, with
  // the stale pending status cleared by nothing. If branch protection honours it the PR is
  // permanently unmergeable, recoverable only by a manual POST /statuses/{sha}.
  it('records the one-producer rule for a Review identity switch with PRs open', () => {
    expect(ADR_018).toMatch(/one producer/i)
    expect(ADR_018).toMatch(/drain/i)
  })

  it('records the adoption impact of the amendment', () => {
    expect(ADR_018).toMatch(/Added by the 2026-08-28 amendment/)
  })

  it('records the ONE predicate change honestly, as additive', () => {
    expect(ADR_018).toMatch(/enforced by two clauses, not one/i)
    expect(ADR_018).toContain('REVIEW_IDENTITY_LOGIN')
    expect(ADR_018).toMatch(
      /it is additive: with the variable unset the clause\n\s+matches nothing/,
    )
  })

  it('records that the light row is the sole authority for a native APPROVE', () => {
    expect(ADR_018).toMatch(
      /A native `APPROVE` \*by the identity\* is authorized by the light row and by nothing else/,
    )
    // and the amendment records why `session` mode is NOT uniformly a comment-form review
    expect(ADR_018).toMatch(/the comment form is the self-review case, not the mode/)
    expect(ADR_018).toMatch(/The PR-state synthesis is unconditional/)
    // ROUND 12: "all three modes" is false for `halt`, which ends the review before any
    // host write. The bullet's real claim is that the call is not nested in the
    // identity-only, APPROVED-only authority step.
    expect(ADR_018).not.toContain('all three modes and for every verdict')
    expect(ADR_018).toContain('both modes that continue (`session` and `identity`)')
    expect(ADR_018).toContain('identity_verdict_event')
  })

  it('points at the file that actually runs the offline matrix', () => {
    // the matrix lives in review-identity.sh, not pr-state-flow.sh — a reader auditing
    // what was verified must not be sent to a file that contains none of it
    expect(ADR_018).toMatch(
      /matrix runs offline in `scripts\/smoke-tests\/scenarios\/review-identity\.sh`/,
    )
  })
})

describe('verification split is real, not claimed (gate-tooling ADL)', () => {
  it('the shell behavior is smoke-tested, and the scenario runs in CI', () => {
    expect(CI_TESTS).toContain('"review-identity.sh"')
    expect(SMOKE).toMatch(/^OFFLINE_SAFE=true$/m)
  })

  it('the smoke scenario executes the adapter and the light row, not just greps them', () => {
    for (const fn of [
      'review_identity_kind_ok',
      'resolve_identity_mode',
      'identity_verdict_event',
      'pair_review_publication_mode',
      'identity_audit_comment',
      'light_auto_approve_allowed',
    ]) {
      expect(SMOKE).toContain(fn)
    }
    expect(SMOKE).toContain('human_approval_jq_filter')
  })

  it('the smoke scenario exercises the kind vocabulary the SKILLS pass, not only the short form', () => {
    // Round-1 smoke passed `user` on every call while labelling it "bot-user identity",
    // so the adoption literal the skills forward was never executed.
    expect(SMOKE).toMatch(
      /excluded\s+"bot-user \(the ADOPTION literal\)[^"]*"\s+bot-user acme-review-bot/,
    )
    expect(SMOKE).toMatch(/not_excluded "bot-user \(the ADOPTION literal\)[^"]*"\s+bot-user ''/)
    expect(SMOKE).toMatch(/pair_review_publication_mode identity bot-user/)
  })

  it('the smoke scenario pins the 🔴 regression against the committed fixture', () => {
    expect(SMOKE).toContain('github-pr-reviews.json')
    expect(SMOKE).toMatch(/does not satisfy the 🔴 predicate/)
  })

  it('the smoke scenario exercises a type:"User" MACHINE approval, not only type:"Bot"', () => {
    // Asserting that some non-User review exists in a fixture never exercises the
    // bot-user form, which is the one the type clause does not cover.
    expect(SMOKE).toMatch(/"login": "acme-review-bot", "type": "User"/)
    expect(SMOKE).toMatch(
      /bot-USER machine approval, login provisioned ⇒ does NOT satisfy the 🔴 gate" 0/,
    )
    expect(SMOKE).toMatch(/only a machine approval ⇒ still blocked" to-be-reviewed/)
    expect(SMOKE).toContain('review_identity_exclusion_ok')
  })

  it('the no-auto-approval guard asserts the RESOLVED EVENT, not a keyword in prose', () => {
    // A grep over skill prose passes on any wording that avoids the token, so it cannot
    // regress-protect the behavior it names. The event matrix can.
    expect(SMOKE).toMatch(/event_for\(\) \{/)
    expect(SMOKE).toMatch(
      /NO light tag ⇒ COMMENT \(this is the Major-finding regression\)" COMMENT/,
    )
    expect(SMOKE).toMatch(/DOCUMENTATION guard \(not behavioral/)
  })

  it('the docs page states the exclusion as two clauses and the APPROVE authority', () => {
    expect(DOCS_PAGE).toContain('REVIEW_IDENTITY_LOGIN')
    expect(DOCS_PAGE).toMatch(/A machine user is not a "Bot" to the API/)
    expect(DOCS_PAGE).toMatch(/only thing that authorizes the identity's approving review/i)
  })

  it('the smoke scenario asserts an INSTALLED project carries the adapter and the guide', () => {
    expect(SMOKE).toMatch(/run_pair install/)
    expect(SMOKE).toMatch(/installed project carries the light row/)
    expect(SMOKE).toMatch(/installed project carries the identity setup guide/)
  })
})

describe('docs site — the feature is documented where readers look', () => {
  it('has its own concept page naming the three modes', () => {
    expect(DOCS_PAGE).toMatch(/session/)
    expect(DOCS_PAGE).toMatch(/identity/)
    expect(DOCS_PAGE).toMatch(/halt/i)
  })

  it('AC6 — the page does not overclaim: 🔴 still needs a human', () => {
    expect(DOCS_PAGE).toMatch(/still needs a \*{0,2}(second )?human/i)
    expect(DOCS_PAGE).toMatch(/user\.type/)
  })

  it('AC3 — the page states the light row is off unless adoption declares it', () => {
    expect(DOCS_PAGE).toMatch(/Tag Projection/)
    expect(DOCS_PAGE).toMatch(/light/)
  })

  it('cross-links the PR state flow page it extends', () => {
    expect(DOCS_PAGE).toContain('/docs/concepts/pr-state-flow')
  })

  // REGRESSION (review round 3). The list said "Three properties" and carried four — on a
  // page whose subject is that the four conditions are exhaustive.
  it('the property list announces the number of items it actually has', () => {
    const intro = DOCS_PAGE.match(/(\w+) properties are worth stating plainly:/)
    expect(intro?.[1]).toBe('Four')
    const listed = DOCS_PAGE.slice(DOCS_PAGE.indexOf('properties are worth stating plainly:'))
      .split('\n\n')[1]
      .split('\n')
      .filter(l => l.startsWith('- **')).length
    expect(listed).toBe(4)
  })

  // REGRESSION (review round 3). The page presented the comment-form verdict as what
  // `session` mode always does; it is the SELF-review case only.
  it('scopes the comment-form verdict to self-review, not to the whole default mode', () => {
    expect(DOCS_PAGE).toMatch(/when the account running the flow authored the pull request/i)
    expect(DOCS_PAGE).toMatch(/reviewing someone else's pull request/i)
  })
})

describe('review round 14 — the fixes for the fourteenth review of PR #466', () => {
  const MERGE_STEP = read(join(DATASET, '.skills/process/implement/post-review-merge.md'))

  // REGRESSION (review round 14, Major). `human_approval_jq_filter`'s login clause is armed
  // by an ENVIRONMENT variable, and only ONE of its two consumers was ever told to populate
  // it: the CI job (`REVIEW_IDENTITY_LOGIN: ${{ vars.REVIEW_IDENTITY_LOGIN }}`). The AGENT
  // evaluates the same filter at review Step 5.3 step 2, Step 5.4 step 5 and /implement's
  // post-review merge precondition, in a shell where nothing exports it — so the clause
  // reads `.user.login != ""`, true for every account, and a `bot-user` identity's own
  // APPROVED review (type "User", cast outside the flow) counts as the non-author HUMAN
  // approval: `resolve_pr_state` answers ready-to-merge, `merge_allowed` passes, and a
  // risk:red PR merges with zero human approval. Measured on the shipped filter, one
  // APPROVED review by `acme-bot` plus one by `human`, HEAD_SHA=abc PR_AUTHOR=rucka:
  //   variable UNSET      -> qualifying review ids `1 2`  (the bot's own approval counts)
  //   variable=acme-bot   -> qualifying review ids `2`
  // The CI job catches it only where `Review enforcement: enabled` AND branch protection is
  // applied — not the default, and not pair's own current state.
  it('every AGENT-side evaluation of the filter mandates exporting REVIEW_IDENTITY_LOGIN', () => {
    const synth = REVIEW.slice(
      REVIEW.indexOf('2. **Act — synthesize the PR state, once, here**'),
      REVIEW.indexOf('3. **Act — resolve whether an APPROVING review is authorized**'),
    )
    expect(synth).toMatch(/`REVIEW_IDENTITY_LOGIN` is EXPORTED/)
    expect(synth).toMatch(/actions\/variables\/REVIEW_IDENTITY_LOGIN/)
    expect(synth).toMatch(/login clause is inert without it/i)
    // and the parenthetical that claimed the exclusion unconditionally now scopes it
    expect(REVIEW).toMatch(/was exported into the shell that evaluated the filter/)
    // the author-side merge path evaluates the same filter and carries the same mandate
    expect(MERGE_STEP).toMatch(/`REVIEW_IDENTITY_LOGIN` EXPORTED/)
    expect(MERGE_STEP).toMatch(/actions\/variables\/REVIEW_IDENTITY_LOGIN/)
    expect(MERGE_STEP).toMatch(/login clause is inert without it/i)
    // the behavioral half is executed in smoke: the filter, unexported, on the bot fixture
    expect(SMOKE).toMatch(/env -u REVIEW_IDENTITY_LOGIN/)
    expect(SMOKE).toMatch(/the login clause is INERT when the variable is not exported/)
    // REGRESSION (review round 16, Minor). The FOURTH evaluator is the CI job, and the skill
    // that GENERATES it enumerated exactly three properties that must survive generation
    // "unmodified" (trusted ref, head-SHA pinning, pending-first) — the env thread was not
    // among them, so an agent generating the job "from the host guide's template" reads the
    // omitted line as optional config while three neighbours are called out as load-bearing.
    // Same defect class, same measured outcome as the three agent-side sites above.
    const bullet = SETUP_GATES.slice(
      SETUP_GATES.indexOf('- **`pair-explicit-approval`**'),
      SETUP_GATES.indexOf('- Also state the **approval count**'),
    )
    expect(bullet).toMatch(/unmodified in four respects/)
    expect(bullet).toMatch(/REVIEW_IDENTITY_LOGIN: \$\{\{ vars\.REVIEW_IDENTITY_LOGIN \}\}/)
    expect(bullet).toMatch(/`\.user\.login != ""`/)
  })

  // REGRESSION (review round 14, Minor). Two mandated behaviors for ONE event: Step 5.3
  // step 1 listed the `pair-review` publication among the writes whose mid-write 403/422 is
  // a HALT, while Step 5.4 step 3 and Graceful Degradation both mandate
  // `pair-review: NOT PUBLISHED — advisory` and CONTINUE. Concrete: identity mode, App
  // path, `checks: write` revoked after the probe — the native review lands, the check-run
  // POST answers 403, and an implementer picks either rule, so two runs of the same flow on
  // the same event produce different artifacts (one PR labelled + reported, one stopped
  // with neither). The author's intent is on record as CONTINUE.
  it('the mid-write HALT excludes the pair-review publication, in both skills', () => {
    const step = REVIEW.slice(REVIEW.indexOf('### Step 5.3'), REVIEW.indexOf('### Step 5.4b'))
    expect(step).toMatch(/two of the three writes the identity performs/)
    expect(step).toMatch(/advisory-continue exception/)
    // the enumeration no longer names the publication among the HALT-bound writes
    expect(step).not.toMatch(/scoped to the three writes the identity performs/)
    // and the review's own HALT-conditions entry carries the same carve-out
    expect(REVIEW).toMatch(/on the review or the audit comment \(a refused `pair-review`/)
    // publish-pr repeats the pair verbatim; its step 3 and HALT entry are scoped too
    expect(PUBLISH_PR).toMatch(
      /except the `pair-review` publication itself, the documented advisory-continue case/,
    )
    expect(PUBLISH_PR).toMatch(/other than the `pair-review` publication/)
    // …and the host guide's generic statement of the same rule names the exception
    expect(GITHUB_GUIDE).toMatch(/The one exception is the `pair-review` publication itself/)
  })

  // REGRESSION (review round 14, Minor). The comma branch splits a label NAME that legally
  // contains a comma, on input that arrived through the LINE read the same comment calls
  // exact. `LABELS="$(gh pr view <n> --json labels -q '.labels[].name')"` for a PR carrying
  // ONE label named `theme, light` strips the trailing newline, so the string reaches the
  // comma branch, is cut into `theme` + `light`, matches, and the identity signs a native
  // APPROVE with an audit comment naming a `Tag: light` the PR does not carry. Measured,
  // declared + green + ready-to-merge: `"theme, light"` -> exit 0, `$'theme, light\n'` ->
  // exit 1. Not reachable through this row today (a sub-red tier needs a `risk:*` label,
  // hence a second field and a newline), so what is fixed is the false exactness claim and
  // the latent trap; both shapes are now pinned in smoke.
  it('the LINE-form exactness claim is scoped, and the comma-in-a-name residual is stated', () => {
    expect(EVALUATOR).toMatch(/whenever the\n\s*#\s*string ACTUALLY carries a newline/)
    expect(EVALUATOR).toMatch(/RESIDUAL, single label \+ a comma in its NAME/)
    expect(EVALUATOR).toMatch(/strips the trailing newline/)
    // the unqualified claim the finding measured against is gone
    expect(EVALUATOR).not.toMatch(/EXACT for every label name, because a/)
    // and both shapes are EXECUTED against the real asset
    expect(SMOKE).toMatch(/one comma-carrying label name WITH its trailing newline/)
    expect(SMOKE).toMatch(/newline STRIPPED ⇒ documented residual/)
  })

  // REGRESSION (review round 14, Minor). Both authorship probes treated an UNREADABLE
  // author as "not the author", while the sibling unknown-input arm ($APP_SLUG unset) in
  // the same block does the opposite. Concrete: `acme-bot` publishes the PR and is declared
  // `Review identity: bot-user` (the misconfiguration the section calls likeliest), plus a
  // transient failure of `gh pr view --json author` — health resolved 1, mode `identity`,
  // and the host refused the native review with `422 Can not request changes on your own
  // pull request`: a mid-write HALT with the check left pending and no review submitted,
  // the exact outcome the probe promises to prevent before any host write.
  it('an unreadable PR author is unknown health, on both probes', () => {
    const app = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf("# 3. The identity must not be the PR's own AUTHOR"),
      GITHUB_GUIDE.indexOf('**A `403`/`422` met MID-WRITE is a HALT'),
    )
    expect(app).toMatch(
      /if ! PR_AUTHOR="\$\(gh pr view "\$PR" --repo "\$REPO" --json author -q \.author\.login\)" \|\| \[ -z "\$PR_AUTHOR" \]; then/,
    )
    expect(app).toMatch(/author could not be read/)
    expect(app).toMatch(/unknown authorship is unknown health/)
    // the bot-user twin had no unknown arm at all
    const bot = GITHUB_GUIDE.slice(GITHUB_GUIDE.indexOf('ACTING="$(gh api user'))
    expect(bot).toMatch(
      /if ! PR_AUTHOR="\$\(gh pr view "\$PR" --repo "\$REPO" --json author -q \.author\.login\)" \|\| \[ -z "\$PR_AUTHOR" \]; then/,
    )
    expect(bot).toMatch(/unknown authorship is unknown health/)
    // the silent comparison the finding measured is gone
    expect(GITHUB_GUIDE).not.toMatch(/if \[ "\$ACTING" = "\$\(gh pr view "\$PR" --json author/)
    // and both are EXECUTED under a stub whose author read fails
    expect(SMOKE).toMatch(/App author probe: the author read FAILED/)
    expect(SMOKE).toMatch(/bot probe: the author read FAILED/)
  })

  // REGRESSION (review round 14, Minor). On the DEFAULT path — the `Review identity` key
  // genuinely absent, every project that has not opted in — `IDENTITY_KIND` is empty, so
  // `review_identity_kind_ok ""` was called and its stderr fired before the fallback
  // assigned `none`: "'empty' is not a Review identity value … HALT and fix the key, never
  // treat it as 'none'". Every review and every publish on an unconfigured repository
  // therefore emitted a HALT-flavoured diagnostic naming a key the project deliberately
  // does not have, contradicting its own `Identity: session` on the one path the design
  // calls the zero-configuration default.
  it('the kind validator runs only when the key is present', () => {
    const read1c = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('# 1c. PRESENT BUT UNPARSEABLE IS NOT `none`'),
      GITHUB_GUIDE.indexOf('# 2. IDENTITY_CONFIGURED'),
    )
    // presence is the OUTER condition; the validator is inside it
    expect(read1c).toMatch(
      /if \[ "\$IDENTITY_KEY_PRESENT" = 1 \]; then\n\s*if ! review_identity_kind_ok "\$IDENTITY_KIND"; then/,
    )
    expect(read1c).toMatch(/else\n\s*IDENTITY_KIND=none\n\s*fi/)
    expect(read1c).toMatch(/ORDER THE CHECK ON PRESENCE/)
    // the value-first order the finding measured is gone
    expect(read1c).not.toMatch(
      /if ! review_identity_kind_ok "\$IDENTITY_KIND"; then\n\s*if \[ "\$IDENTITY_KEY_PRESENT" = 1 \]/,
    )
    // and the silence is EXECUTED, not asserted: the shipped lines against real fixtures
    expect(SMOKE).toMatch(/no diagnostic on the default path/)
  })
})

describe('review round 16 — the fixes for the sixteenth review of PR #466', () => {
  // REGRESSION (review round 16, Minor). Both per-run authorship probes read the PR author
  // with an UNPINNED `gh pr view "$PR" --json author`, while every other host call in the
  // same two snippets pins the repository (`gh api /installation/repositories`,
  // `gh api "repos/$REPO/collaborators/..."`, `gh api "repos/$REPO/actions/variables/..."`).
  // CONCRETE: the probe runs from a cwd whose `origin` is a DIFFERENT repository — pair's
  // own orchestrator runs skills from `../pair-worktrees/<id>`, and a harness may invoke
  // from a parent directory — so `gh pr view 466` resolves PR 466 of THAT repo and returns
  // an unrelated author. The `case` / `[ "$ACTING" = "$PR_AUTHOR" ]` comparison finds no
  // match, PERMS_OK stays 1, health resolves `identity`, and the one-credential
  // misconfiguration the probe exists to catch reaches the native review and dies on
  // `422 Can not request changes on your own pull request` mid-write. NOT symmetric with a
  // failed read: a read that FAILS is handled (PERMS_OK=0); a read that SUCCEEDS against the
  // wrong repository silently passes.
  it('both authorship probes pin the author read to $REPO', () => {
    expect(GITHUB_GUIDE).not.toMatch(/gh pr view "\$PR" --json author/)
    const pinned = GITHUB_GUIDE.match(
      /gh pr view "\$PR" --repo "\$REPO" --json author -q \.author\.login/g,
    )
    expect(pinned).toHaveLength(2)
    // the behavioral half is EXECUTED in smoke: the shipped lines under a stub whose
    // unpinned read resolves a foreign repository's PR and answers `unrelated-human`
    expect(SMOKE).toMatch(/App author probe: the author read is PINNED to \\\$REPO/)
    expect(SMOKE).toMatch(/bot probe: the author read is PINNED to \\\$REPO/)
  })

  // REGRESSION (review round 16, Minor). The idempotency contract had no item for the audit
  // comment, and its one sentence about comment artifacts was false in `identity` mode:
  // "The report is always the review body, never a separate comment — so no duplicate
  // comment artifact is created." But Step 5.4 step 2 narrows the already-published skip to
  // "steps 3-5 only" so it lands on Step 5.4b, and Step 5.3 step 6 submits a FRESH native
  // review every time — so Step 5.4b step 1 posts a fresh audit comment every time.
  // CONCRETE: `identity` mode, adoption declares `light`, PR carries `light`, tier green,
  // state ready-to-merge; three re-invocations on an unchanged head leave three byte-
  // identical audit comments while a maintainer reading §5 is told the opposite.
  it('the idempotency contract carries the audit comment, and §5 is scoped to the report', () => {
    const idem = REVIEW.slice(
      REVIEW.indexOf('## Idempotent Re-invocation'),
      REVIEW.indexOf('## Graceful Degradation'),
    )
    expect(idem).toMatch(/Identity audit comment/)
    expect(idem).toMatch(/re-posted on \*\*every\*\* re-invocation, deliberately/)
    // the unqualified claim the finding measured is gone; the surviving one names the report
    expect(idem).not.toMatch(/so no duplicate comment artifact is created/)
    expect(idem).toMatch(/the report creates no duplicate comment artifact/)
  })

  // REGRESSION (review round 16, Minor). The `action` vocabulary passed to
  // `identity_audit_comment` had no token for an unresolved verdict, though both shipped
  // assets carry explicit fail-safe arms for one (`identity_verdict_event`'s `*` arm ⇒
  // COMMENT; `review_check_conclusion` ⇒ pending). A COMMENT-form review by the identity
  // lands, so it IS an identity action and "the audit is not optional" — but its `action`
  // matched none of the three definitions and the agent had to invent the token, turning a
  // deterministic projection into an improvised one. Step 5.4b step 2's fourth value models
  // the case explicitly ("CHANGES-REQUESTED, or any unresolved verdict"), so the two steps
  // disagreed about whether an unresolved verdict is a modelled case.
  it('the audit action vocabulary covers an unresolved verdict', () => {
    const step1 = REVIEW.slice(
      REVIEW.indexOf('1. **Act — audit, on every identity action'),
      REVIEW.indexOf("2. **Act — report the row's outcome"),
    )
    expect(step1).toMatch(/or an unresolved verdict\*\* — both published as a COMMENT-form review/)
    // and the executed fail-safe it names is real: an unresolved verdict yields COMMENT
    expect(SMOKE).toMatch(/identity \+ unknown verdict ⇒ COMMENT/)
  })
})
