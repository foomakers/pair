import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Story #218 — dedicated review identity + adoption-gated light auto-approval.
//
// This story EXTENDS the shipped PR state flow (#234/#390, ADR-018 Option 3). It
// rebuilds nothing: `resolve_pr_state`'s table is untouched, the required-check
// enforcement is untouched, and the 🔴 human-approval predicate is untouched. What is
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
  it('exposes the four entry points the flow composes', () => {
    for (const fn of [
      'resolve_identity_mode',
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

  it('the 🔴 approval predicate is unchanged by this story', () => {
    expect(EVALUATOR).toMatch(/user\.type=="User"/)
    expect(EVALUATOR).toMatch(/commit_id==env\.HEAD_SHA/)
    expect(EVALUATOR).toMatch(/user\.login!=env\.PR_AUTHOR/)
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
})

describe('review — the light row is wired, gated and audited (AC2, AC3, AC5)', () => {
  it('Step 5.4b evaluates the shipped helper instead of deciding anything itself', () => {
    expect(REVIEW).toContain('Step 5.4b')
    expect(REVIEW).toContain('light_auto_approve_allowed')
    expect(REVIEW).toMatch(/Tag Projection/)
  })

  it('AC3 — it states there is no auto-approval path outside the light row', () => {
    expect(REVIEW).toMatch(/no auto-approval path outside this light row/i)
    // and every auto-approval mention in the skill is qualified by "light"
    for (const line of REVIEW.split('\n').filter(l => /auto-approv/i.test(l))) {
      expect(line, `unqualified auto-approval mention: ${line.slice(0, 90)}`).toMatch(/light/i)
    }
  })

  it('AC5 — every identity approval AND every identity block writes the audit comment', () => {
    expect(REVIEW).toContain('identity_audit_comment')
    expect(REVIEW).toMatch(/every identity approval AND every identity block/i)
  })

  it('AC2/AC5 — the pr-state:* label mechanics of Step 5.4 are explicitly unchanged', () => {
    expect(REVIEW).toMatch(
      /label[\s\S]{0,120}unchanged by this step|label mechanics are Step 5\.4/i,
    )
  })

  it('AC3 — at 🔴 the row never fires, and the identity never satisfies the human gate', () => {
    expect(REVIEW).toMatch(/At 🔴 nothing here ever fires/)
    expect(REVIEW).toMatch(/user\.type == "User"/)
  })

  it('reports the identity mode and the light-row outcome in the output block', () => {
    expect(REVIEW).toMatch(/├── Identity:/)
    expect(REVIEW).toMatch(/├── Light row:/)
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
    expect(GITHUB_GUIDE).toMatch(/🔴 explicit approval[\s\S]{0,200}second \*\*human\*\*/)
    expect(GITHUB_GUIDE).toMatch(/excluded \*\*by construction\*\*/)
  })

  it('warns about the bot-USER footgun (it types as "User" on the reviews API)', () => {
    expect(GITHUB_GUIDE).toMatch(/keep it out of the repository'?s human-reviewer set/i)
  })

  it('AC3 — the light row section states both containments', () => {
    expect(GITHUB_GUIDE).toMatch(/The declaration is the gate, not the label/i)
    expect(GITHUB_GUIDE).toMatch(/It never touches 🔴/i)
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

  it('the smoke scenario pins the 🔴 regression against the committed fixture', () => {
    expect(SMOKE).toContain('github-pr-reviews.json')
    expect(SMOKE).toMatch(/does not satisfy the 🔴 predicate/)
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
})
