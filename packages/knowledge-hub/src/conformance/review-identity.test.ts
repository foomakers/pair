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
const WOW_TEMPLATE = read(join(DATASET, '.pair/adoption/tech/way-of-working.md'))
const ROOT_WOW = read(join(REPO, '.pair/adoption/tech/way-of-working.md'))
const ADR_018 = read(join(REPO, '.pair/adoption/tech/adr/adr-018-pr-state-flow-required-checks.md'))
const RISK_MATRIX = read(join(REPO, '.pair/adoption/tech/risk-matrix.md'))
const DOCS_PAGE = read(join(REPO, 'apps/website/content/docs/concepts/review-identity.mdx'))
const SMOKE = read(join(REPO, 'scripts/smoke-tests/scenarios/review-identity.sh'))
const CI_TESTS = read(join(REPO, 'scripts/smoke-tests/lib/ci-tests.sh'))

describe('review-identity.sh — the host-agnostic identity adapter (AC1, AC4)', () => {
  it('exposes the five entry points the flow composes', () => {
    for (const fn of [
      'resolve_identity_mode',
      'review_identity_exclusion_ok',
      'identity_verdict_event',
      'pair_review_publication_mode',
      'identity_audit_comment',
    ]) {
      expect(ADAPTER).toContain(`${fn}()`)
    }
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

  it('carries no classification criteria — it reads configuration, never the change (D18)', () => {
    expect(ADAPTER).toMatch(/D18/)
    expect(ADAPTER).not.toMatch(/git diff|--numstat|files?[- ]changed|\bmigration\b/i)
  })
})

describe('review-identity.sh — the identity must be excluded from the 🔴 gate to act (AC3, AC6)', () => {
  it('review_identity_exclusion_ok distinguishes the App form from the bot-USER form', () => {
    expect(ADAPTER).toMatch(/review_identity_exclusion_ok\(\)/)
    // app ⇒ excluded by account type, nothing to configure
    expect(ADAPTER).toMatch(/app\)\n\s+# `user\.type == "Bot"`/)
    // user ⇒ excluded ONLY by login, so an unset login is a not-healthy identity
    expect(ADAPTER).toMatch(/bot-USER identity types as user\.type == \\"User\\"/)
    expect(ADAPTER).toMatch(/Treat this identity as NOT healthy until it is set/)
    // unknown kind is fail-safe NOT excluded
    expect(ADAPTER).toMatch(/fail-safe: not excluded/)
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
      /self_authored\s+: `session` mode only — 0 when the acting session account is/,
    )
    // fail-safe: unknown authorship is treated as self-authored
    expect(ADAPTER).toMatch(/anything else \(empty, absent, unknown\) is treated as SELF-authored/)
    // the light row governs the IDENTITY's approval, so it is inert in session mode
    expect(ADAPTER).toMatch(/Read in `identity` mode ONLY/)
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
    expect(step53).toMatch(/in \*\*all three modes and for every verdict\*\*/)
    // the `session` skip belongs to the authority step, never to the synthesis
    expect(step53).toMatch(/In `session` mode skip this entirely: `approve-authorized = 0`/)
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
    expect(REVIEW).toMatch(/light_auto_approve_allowed[\s\S]{0,400}approve-authorized/)
    expect(REVIEW).toMatch(/APPROVED \+ not authorized\*\* ⇒ `event = COMMENT`/)
    // and every auto-approval mention in the skill is qualified by "light"
    for (const line of REVIEW.split('\n').filter(l => /auto-approv/i.test(l))) {
      expect(line, `unqualified auto-approval mention: ${line.slice(0, 90)}`).toMatch(/light/i)
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
    expect(REVIEW).toMatch(/pass `0` only when they provably differ/)
  })

  // REGRESSION (review round 3). The same report row was spelled four ways, one of them
  // naming an `Identity approve:` row the Output Format block does not contain — so two
  // runs on the same PR emit structurally different reports and a consumer (the #219
  // automation loop) cannot key on either.
  it('the Light row is spelled with the Output Format block’s own strings, everywhere', () => {
    // the row that never existed in the output block is gone
    expect(REVIEW).not.toContain('Identity approve:')
    const values = [
      'n-a — no identity (session mode)',
      'not-authorized — <unmet condition>, verdict submitted as COMMENT',
      'approved — native APPROVE by the identity + audit comment posted',
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

  it('the two skills cannot disagree — the resolution is single-sourced in the adapter', () => {
    expect(PUBLISH_PR).toMatch(/never re-derived here|cannot disagree/i)
  })

  it('reports the identity on its own output row', () => {
    expect(PUBLISH_PR).toMatch(/├── Identity:/)
  })
})

describe('pr-states.md — the model carries the identity and the light row (AC1, AC3)', () => {
  it('defines the three modes and no fourth', () => {
    expect(GUIDELINE).toMatch(/Dedicated review identity/)
    for (const mode of ['`session`', '`identity`', '`halt`']) expect(GUIDELINE).toContain(mode)
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

  it('AC4 — the App health probes are ones an INSTALLATION token can actually serve', () => {
    // `gh api user` answers 403 for an installation token (it is not associated with a
    // user), so using it as the first probe fails a correctly-provisioned App and HALTs
    // every review on a setup that is in fact fine.
    expect(GITHUB_GUIDE).toMatch(/gh api \/installation\/repositories --jq '\.total_count'/)
    expect(GITHUB_GUIDE).toMatch(/`gh api user` does NOT work/)
    expect(GITHUB_GUIDE).toMatch(/403 Resource not accessible by integration/)
  })

  it('AC4 — the probes cover pull_requests WRITE, not read only', () => {
    // a read-only grant passes every read probe and then 403s mid-flow, AFTER
    // pair-review was already published — the case the HALT exists to prevent
    expect(GITHUB_GUIDE).toMatch(/pull_requests: WRITE/)
    expect(GITHUB_GUIDE).toMatch(/gh api "repos\/\$REPO\/issues\/comments\/\$CID" -X DELETE/)
  })

  it('the probe snippet is self-contained and declares the artifacts it leaves', () => {
    const probes = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('5. **Verify**, before relying on it'),
      GITHUB_GUIDE.indexOf('6. **Publish `pair-review` as a check run**'),
    )
    expect(probes).toMatch(/PR=<pr-number>/)
    expect(probes).toMatch(/HEAD_SHA="\$\(gh pr view "\$PR" --json headRefOid/)
    expect(probes).toMatch(/These probes leave artifacts on a real pull request/)
  })

  // REGRESSION (review round 2). Same defect class as the probe block, one section
  // later: with `$IDENTITY_CONFIGURED`/`$IDENTITY_HEALTHY`/`$IDENTITY_KIND` unset, the
  // copied block resolves `session` ⇒ `commit-status` and the App identity silently
  // publishes a commit status instead of the check run — no error, the wrong artifact.
  it('the App publication snippet assigns its three identity inputs from real sources', () => {
    const pub = GITHUB_GUIDE.slice(
      GITHUB_GUIDE.indexOf('6. **Publish `pair-review` as a check run**'),
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
    expect(pub).toMatch(/^\s+IDENTITY_CONFIGURED=0$/m)
    expect(pub).toMatch(/^\s+IDENTITY_HEALTHY=0$/m)
    // and it names where the health flag comes from: the probes AND the exclusion check
    expect(pub).toMatch(/review_identity_exclusion_ok "\$IDENTITY_KIND"/)
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
  })

  it('is honest about what is NOT yet verified on a live host (T11)', () => {
    expect(ADR_018).toMatch(/not\*\* yet observed on a live host|T11/)
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
