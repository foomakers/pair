import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'

// Story #234 — PR state flow (gate ≠ review) + pair review as a required check.
//
// The flow is: mechanical gates first, judgment review only at green gates, and the
// synthesis of (gates × review verdict × tier × explicit approval) IS the PR state
// (`to-be-reviewed` → `ready-to-merge` / `not-approved`). Merge is mechanically blocked
// by REQUIRED code-host checks, never by a label — so the review can never be skipped.
//
// These are content invariants on the sources of record (dataset KB + dataset skills),
// asserted the same way the rest of the KB/skill corpus is tested (see
// verify-quality-gate-matrix.test.ts, quality-model.test.ts). The *behavior* of the
// shipped synthesis evaluator (pr-state.sh) is executed end-to-end by
// scripts/smoke-tests/scenarios/pr-state-flow.sh per the gate-tooling ADL
// (2026-07-13: shell assets are smoke-tested, never vitest-unit-tested).

const DATASET = join(__dirname, '../../dataset')
const GUIDELINE_PATH = join(
  DATASET,
  '.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md',
)
const GUIDELINE = readFileSync(GUIDELINE_PATH, 'utf-8')
const EVALUATOR_PATH = join(DATASET, '.pair/knowledge/assets/pr-state.sh')
const EVALUATOR = readFileSync(EVALUATOR_PATH, 'utf-8')
const GITHUB_GUIDE = readFileSync(
  join(
    DATASET,
    '.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md',
  ),
  'utf-8',
)
const PUBLISH_PR_PATH = join(DATASET, '.skills/capability/publish-pr/SKILL.md')
const PUBLISH_PR = readFileSync(PUBLISH_PR_PATH, 'utf-8')
const REVIEW_PATH = join(DATASET, '.skills/process/review/SKILL.md')
const REVIEW = readFileSync(REVIEW_PATH, 'utf-8')
const MERGE_CASCADE = readFileSync(
  join(DATASET, '.skills/process/review/merge-and-cascade.md'),
  'utf-8',
)
const SETUP_GATES_PATH = join(DATASET, '.skills/capability/setup-gates/SKILL.md')
const SETUP_GATES = readFileSync(SETUP_GATES_PATH, 'utf-8')
const QUALITY_MODEL = readFileSync(
  join(DATASET, '.pair/knowledge/guidelines/quality-assurance/quality-model.md'),
  'utf-8',
)
const CANONICAL_STATES = readFileSync(
  join(
    DATASET,
    '.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md',
  ),
  'utf-8',
)
const HOW_TO_CODE_REVIEW = readFileSync(
  join(DATASET, '.pair/knowledge/how-to/11-how-to-code-review.md'),
  'utf-8',
)
const WOW_TEMPLATE = readFileSync(join(DATASET, '.pair/adoption/tech/way-of-working.md'), 'utf-8')

/** Every relative markdown link in `content` resolves to a file on disk. */
const assertLinksResolve = (content: string, fromPath: string, targets: string[]): void => {
  const dir = dirname(fromPath)
  for (const t of targets) {
    const m = content.match(new RegExp(`\\]\\(([^)]*${t.replace(/\./g, '\\.')})\\)`))
    expect(m, `${fromPath} must link to ${t}`).not.toBeNull()
    const linkPath = (m as RegExpMatchArray)[1] as string
    expect(
      existsSync(resolve(dir, linkPath.split('#')[0] as string)),
      `link to ${t} must resolve`,
    ).toBe(true)
  }
}

describe('pr-states.md — the PR state flow model (#234)', () => {
  it('names exactly the three PR states of the flow', () => {
    expect(GUIDELINE).toContain('to-be-reviewed')
    expect(GUIDELINE).toContain('ready-to-merge')
    expect(GUIDELINE).toContain('not-approved')
  })

  it('states gate ≠ review: gates are mechanical/zero-judgment, review is judgment/zero-checks', () => {
    expect(GUIDELINE).toMatch(/gate\s*≠\s*review|gate is not (a )?review/i)
    expect(GUIDELINE).toMatch(/zero judgment/i)
    expect(GUIDELINE).toMatch(/zero mechanical/i)
  })

  it('AC2 — the gate is the FIRST filter: a red gate never yields a merge-enabling state (R5.4)', () => {
    expect(GUIDELINE).toMatch(/first filter/i)
    expect(GUIDELINE).toMatch(/R5\.4/)
    expect(GUIDELINE).toMatch(
      /(red|failing) gate[\s\S]{0,200}never[\s\S]{0,80}(merge-enabling|ready-to-merge)/i,
    )
  })

  it('AC3 — synthesis: green gates AND approved review ⇒ ready-to-merge; not-approved routes to a human', () => {
    expect(GUIDELINE).toMatch(/## Synthesis/i)
    expect(GUIDELINE).toMatch(
      /green gates[\s\S]{0,160}approved review[\s\S]{0,200}ready-to-merge|ready-to-merge[\s\S]{0,200}approved/i,
    )
    expect(GUIDELINE).toMatch(/not-approved[\s\S]{0,160}human/i)
  })

  it('AC4 — 🔴 red additionally requires explicit human approval before merge (D10)', () => {
    expect(GUIDELINE).toMatch(/explicit approval/i)
    expect(GUIDELINE).toMatch(/D10/)
    expect(GUIDELINE).toMatch(/risk:red/)
  })

  it('AC5 — the pair review is a REQUIRED check; missing/failed ⇒ code host blocks the merge (R5.7)', () => {
    expect(GUIDELINE).toContain('pair-review')
    expect(GUIDELINE).toMatch(/required (status )?check/i)
    expect(GUIDELINE).toMatch(/R5\.7/)
    expect(GUIDELINE).toMatch(/(missing|absent)[\s\S]{0,200}block/i)
  })

  it('labels are a VIEW; the required checks are the authority (a stale label cannot enable a merge)', () => {
    expect(GUIDELINE).toMatch(/pr-state:/)
    expect(GUIDELINE).toMatch(
      /label[\s\S]{0,300}(never|cannot|not)[\s\S]{0,120}(enable|authoritative|authority)/i,
    )
  })

  it('fail-safe: an untagged / malformed tier is treated as 🔴 (consistent with #258)', () => {
    expect(GUIDELINE).toMatch(/fail-safe/i)
    expect(GUIDELINE).toMatch(/untagged[\s\S]{0,160}red/i)
  })

  it('reads TAGS only — contains no classification criteria (D18)', () => {
    expect(GUIDELINE).toMatch(/no classification criteria|contains no[^\n]*criteria/i)
    expect(GUIDELINE).toMatch(/D18/)
  })

  it('covers the four edge cases: tier raise, review crash/timeout, force-push, host without required-check API', () => {
    expect(GUIDELINE).toMatch(/rais(e|ed)[\s\S]{0,200}re-?block|re-?block[\s\S]{0,200}rais/i)
    expect(GUIDELINE).toMatch(/(crash|timeout)[\s\S]{0,240}(pending|blocked)/i)
    expect(GUIDELINE).toMatch(/force-push[\s\S]{0,240}(invalidat|re-?run)/i)
    expect(GUIDELINE).toMatch(/degraded[\s\S]{0,400}manual/i)
  })

  it('defers per-tier requirements to quality-model §4 (single source) instead of restating thresholds', () => {
    assertLinksResolve(GUIDELINE, GUIDELINE_PATH, [
      'quality-model.md',
      'pr-state.sh',
      'tier-resolve.sh',
    ])
  })

  // --- review round 1 on PR #390 ---

  it('states plainly that a 🔴 merge needs a SECOND human account (the author cannot approve)', () => {
    expect(GUIDELINE).toMatch(/second human/i)
    expect(GUIDELINE).not.toMatch(/what a solo maintainer satisfies deliberately/i)
    expect(GUIDELINE).toMatch(/solo[\s\S]{0,400}(cannot|impossible|no 🔴)/i)
  })

  it('maps 🟡’s "reviewer approval" onto the pair review explicitly (no two readings)', () => {
    expect(GUIDELINE).toMatch(/pair review[\s\S]{0,120}satisfies[\s\S]{0,80}reviewer approval/i)
  })

  it('says the post-force-push review re-run is skill/human triggered, not automatic', () => {
    expect(GUIDELINE).toMatch(/re-?run is[\s\S]{0,120}(triggered|manual)/i)
  })

  it('carries a non-blocking degradation for a missing pr-state label family', () => {
    expect(GUIDELINE).toMatch(/label[\s\S]{0,240}(non-blocking|not applied)/i)
  })
})

describe('pr-state.sh — the deterministic synthesis evaluator (#234)', () => {
  it('exposes the four entry points the flow composes', () => {
    for (const fn of [
      'resolve_pr_state',
      'merge_allowed',
      'explicit_approval_required',
      'review_check_conclusion',
    ]) {
      expect(EVALUATOR).toContain(fn)
    }
  })

  it('is provider-agnostic and reads state signals + tags only — no classification criteria (D18)', () => {
    expect(EVALUATOR).toMatch(/D18/)
    expect(EVALUATOR).not.toMatch(/git diff|--numstat|files?-changed|\bmigration\b/i)
  })

  it('documents the fail-safe defaults (unknown tier ⇒ red, non-pass gates ⇒ not merge-enabling)', () => {
    expect(EVALUATOR).toMatch(/fail-safe/i)
  })
})

describe('publish-pr — review at PR creation (AC1)', () => {
  it('registers the pair-review check and enters to-be-reviewed at creation', () => {
    expect(PUBLISH_PR).toContain('pair-review')
    expect(PUBLISH_PR).toContain('to-be-reviewed')
    expect(PUBLISH_PR).toMatch(/pending/i)
  })

  it('runs the review through a clean-context (handoff-only, anonymous) subagent', () => {
    expect(PUBLISH_PR).toMatch(/subagent/i)
    expect(PUBLISH_PR).toMatch(/clean context|anonymous/i)
    expect(PUBLISH_PR).toMatch(/\/review|process-review/)
  })

  it('never merges and never approves its own PR — the review verdict is the reviewer flow’s', () => {
    expect(PUBLISH_PR).toMatch(/never merges/i)
  })

  it('degrades: no subagent ⇒ documented fallback; the check still blocks the merge meanwhile', () => {
    expect(PUBLISH_PR).toMatch(/subagent[\s\S]{0,300}(unavailable|not available)/i)
  })

  it('links the state-flow model instead of restating it', () => {
    assertLinksResolve(PUBLISH_PR, PUBLISH_PR_PATH, ['pr-states.md'])
  })

  // --- review round 1 on PR #390 ---

  it('degrades when the status publication is refused (advisory, reported — never assumed)', () => {
    expect(PUBLISH_PR).toMatch(/(status|publication)[\s\S]{0,200}refused[\s\S]{0,300}advisory/i)
  })

  it('degrades non-blocking when the pr-state:* label family is absent', () => {
    expect(PUBLISH_PR).toMatch(
      /pr-state[^\n]*label[\s\S]{0,240}(absent|missing|not found)[\s\S]{0,300}non-blocking/i,
    )
  })
})

describe('review — gate-first, synthesis, and the merge precondition (AC2, AC3, AC4)', () => {
  it('AC2 — a red gate caps the decision: no merge-enabling verdict while gates are red', () => {
    expect(REVIEW).toMatch(/first filter|gate[\s\S]{0,80}before[\s\S]{0,40}review/i)
    expect(REVIEW).toMatch(
      /(red|failing) gate[\s\S]{0,300}(never|cannot)[\s\S]{0,120}(APPROVED|merge-enabling|ready-to-merge)/i,
    )
  })

  it('AC3/AC4 — computes the PR state via the shipped evaluator and applies the pr-state label', () => {
    expect(REVIEW).toContain('pr-state.sh')
    expect(REVIEW).toContain('resolve_pr_state')
    expect(REVIEW).toContain('ready-to-merge')
    expect(REVIEW).toContain('not-approved')
  })

  it('AC5 — publishes the pair-review check conclusion from the verdict', () => {
    expect(REVIEW).toContain('pair-review')
    expect(REVIEW).toContain('review_check_conclusion')
  })

  it('AC4 — 🔴 red: reviewer/SLA/extended-checklist/explicit-approval requirements are read, never invented', () => {
    expect(REVIEW).toMatch(/extended checklist/i)
    expect(REVIEW).toMatch(/explicit approval/i)
    expect(REVIEW).toMatch(/quality-model/)
  })

  it('merge is gated on ready-to-merge — Phase 6 HALTs on any other state', () => {
    expect(MERGE_CASCADE).toContain('ready-to-merge')
    expect(MERGE_CASCADE).toMatch(/HALT/)
    expect(MERGE_CASCADE).toContain('merge_allowed')
  })

  it('links the state-flow model instead of restating it', () => {
    assertLinksResolve(REVIEW, REVIEW_PATH, ['pr-states.md'])
  })

  // --- review round 1 on PR #390 ---

  it('publishes pair-review as a COMMIT STATUS (the check-runs API is GitHub-App only)', () => {
    expect(REVIEW).toMatch(/commit status/i)
    expect(REVIEW).toMatch(/(status|publication)[\s\S]{0,200}refused[\s\S]{0,300}advisory/i)
  })

  it('degrades non-blocking when the pr-state:* label family is absent', () => {
    expect(REVIEW).toMatch(
      /pr-state[^\n]*label[\s\S]{0,240}(absent|missing|not found)[\s\S]{0,300}non-blocking/i,
    )
  })
})

describe('setup-gates — pair review + explicit approval as required checks (AC5)', () => {
  it('wires the pair-review and explicit-approval required checks on the protected branch', () => {
    expect(SETUP_GATES).toContain('pair-review')
    expect(SETUP_GATES).toContain('pair-explicit-approval')
    expect(SETUP_GATES).toMatch(/branch protection/i)
  })

  it('is host-agnostic: host mechanics are deferred to the implementation guide (R2.12)', () => {
    assertLinksResolve(SETUP_GATES, SETUP_GATES_PATH, ['pr-states.md'])
  })

  it('documents the degraded mode when the host has no required-check API', () => {
    expect(SETUP_GATES).toMatch(/degraded[\s\S]{0,300}(manual|required-check)/i)
  })
})

describe('github-implementation.md — host mechanics for the required checks (R2.12)', () => {
  it('carries the concrete check-run + branch-protection recipe', () => {
    expect(GITHUB_GUIDE).toContain('pair-review')
    expect(GITHUB_GUIDE).toContain('pair-explicit-approval')
    expect(GITHUB_GUIDE).toMatch(/required_status_checks/)
    expect(GITHUB_GUIDE).toMatch(/dismiss_stale_reviews/)
  })

  it('the 🔴 explicit-approval check demands a HUMAN approval, not the pair review itself', () => {
    expect(GITHUB_GUIDE).toMatch(/human[\s\S]{0,200}approv/i)
  })

  // --- review round 1 on PR #390: every host command must be runnable with the
  // token the skills actually hold. Verified against the live API. ---

  it('publishes pair-review through the commit-statuses API, never POST /check-runs (403, App-only)', () => {
    expect(GITHUB_GUIDE).toMatch(/statuses\/\$HEAD_SHA/)
    expect(GITHUB_GUIDE).toMatch(/context=('|")?pair-review/)
    // the prose may NAME the Checks API to explain why it is unusable; no command may call it
    expect(GITHUB_GUIDE).not.toMatch(/repos\/\$OWNER\/\$REPO\/check-runs/)
    expect(GITHUB_GUIDE).toMatch(/GitHub App/)
    expect(GITHUB_GUIDE).toMatch(/repo:status/)
  })

  it('guards the pending verdict in the copy-pasteable snippet (pending is not a publishable state)', () => {
    expect(GITHUB_GUIDE).toMatch(/=\s*pending\s*\][\s\S]{0,160}exit 0/)
  })

  it('queries approvals via the REST reviews endpoint — `author.is_bot` does not exist', () => {
    expect(GITHUB_GUIDE).not.toMatch(/is_bot/)
    expect(GITHUB_GUIDE).toMatch(/pulls\/\$PR\/reviews/)
    expect(GITHUB_GUIDE).toMatch(/user\.type\s*==\s*"User"/)
    expect(GITHUB_GUIDE).toMatch(/commit_id\s*==/)
  })

  it('provisions the pr-state:* label family (labels never autocreate)', () => {
    for (const state of ['to-be-reviewed', 'ready-to-merge', 'not-approved']) {
      expect(GITHUB_GUIDE).toMatch(new RegExp(`gh label create ["']?pr-state:${state}`))
    }
  })

  it('states required_approving_review_count explicitly and justifies the strict choice', () => {
    expect(GITHUB_GUIDE).toMatch(/"required_approving_review_count": 0/)
    expect(GITHUB_GUIDE).toMatch(/"strict": false/)
    expect(GITHUB_GUIDE).toMatch(/strict[\s\S]{0,400}(per head|head commit|up to date)/i)
  })

  it('pins least-privilege permissions on the workflow template', () => {
    expect(GITHUB_GUIDE).toMatch(/permissions:[\s\S]{0,200}pull-requests: read/)
  })

  it('records the ordering constraint (add job → observe the contexts → protect) and the enforce_admins trap', () => {
    expect(GITHUB_GUIDE).toMatch(/## Ordering|### Ordering/i)
    expect(GITHUB_GUIDE).toMatch(/enforce_admins[\s\S]{0,400}(after|escape|bypass)/i)
    expect(GITHUB_GUIDE).toMatch(/second human/i)
  })

  it('documents the three independent degradations: status publication, label API, branch protection', () => {
    expect(GITHUB_GUIDE).toMatch(/NOT PUBLISHED/)
    expect(GITHUB_GUIDE).toMatch(/label API/i)
    expect(GITHUB_GUIDE).toMatch(/branch protection[\s\S]{0,300}advisory/i)
  })
})

describe('doc coherence & cross-links for the PR state flow (#234)', () => {
  it('quality-model §4 points at pr-states.md for the red-gate refinement (no contradictory reading)', () => {
    expect(QUALITY_MODEL).toMatch(
      /red gate[\s\S]{0,200}(no merge-enabling|never[\s\S]{0,40}merge-enabling)/i,
    )
  })

  it('canonical-states.md back-links the PR state flow companion', () => {
    expect(CANONICAL_STATES).toMatch(/pr-states\.md/)
  })

  it('how-to-11’s decision table points at the merge precondition (required checks, merge_allowed)', () => {
    expect(HOW_TO_CODE_REVIEW).toMatch(/merge_allowed|pr-states\.md/)
  })

  it('the way-of-working TEMPLATE carries a status placeholder, not an applied-as-fact claim', () => {
    expect(WOW_TEMPLATE).toMatch(/Status: \[applied \| not yet applied\]/)
  })
})
