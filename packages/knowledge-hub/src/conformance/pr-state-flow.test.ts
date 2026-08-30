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
// verify-quality.test.ts, quality-model.test.ts). The *behavior* of the
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
const IMPLEMENT_PATH = join(DATASET, '.skills/process/implement/SKILL.md')
const IMPLEMENT = readFileSync(IMPLEMENT_PATH, 'utf-8')

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

  // Updated by #398: the review path still needs a second human account — what changed
  // is that a solo repository now has a *named, weaker* alternative instead of nothing.
  it('states plainly that the REVIEW path needs a SECOND human account (the author cannot approve)', () => {
    expect(GUIDELINE).toMatch(/second human/i)
    expect(GUIDELINE).toMatch(/solo[\s\S]{0,400}(cannot|impossible|no 🔴)/i)
    // and never sells the solo fallback as the same thing
    expect(GUIDELINE).not.toMatch(/token[\s\S]{0,60}(is|counts as|means) independent review/i)
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
  it('exposes the five entry points the flow composes', () => {
    for (const fn of [
      'resolve_pr_state',
      'merge_allowed',
      'explicit_approval_required',
      'review_check_conclusion',
      'human_approval_jq_filter',
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
    // the predicate itself lives in the shipped evaluator (round 3), not inline here
    expect(GITHUB_GUIDE).toMatch(/human_approval_jq_filter/)
    expect(EVALUATOR).toMatch(/user\.type\s*==\s*"User"/)
    expect(EVALUATOR).toMatch(/commit_id\s*==\s*env\.HEAD_SHA/)
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

// --- review round 2 on PR #390 -------------------------------------------------
// The authorization control must not be readable from the PR's own tree, the
// required contexts must land on the commit branch protection evaluates, and the
// review dispatch must be executable (no nested delegation) and non-mergeable.

describe('pair-explicit-approval runs from a TRUSTED ref (round 2)', () => {
  it('triggers on pull_request_target, never on plain pull_request (the PR cannot ship its own gate)', () => {
    expect(GITHUB_GUIDE).toMatch(/^\s*pull_request_target:/m)
    // a bare `pull_request:` trigger would run the PR's own workflow file
    expect(GITHUB_GUIDE).not.toMatch(/^\s{2}pull_request:\s*$/m)
  })

  it('pins the checkout to the BASE sha, never to the PR head, and disables credentials', () => {
    // #398 added an `issue_comment` trigger, whose payload carries no `pull_request`
    // object — hence the API-resolved BASE fallback. Still the base, never the head.
    expect(GITHUB_GUIDE).toMatch(
      /ref:\s*\$\{\{\s*github\.event\.pull_request\.base\.sha(\s*\|\|\s*steps\.pr\.outputs\.base)?\s*\}\}/,
    )
    expect(GITHUB_GUIDE).not.toMatch(
      /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.(sha|ref)\s*\}\}/,
    )
    expect(GITHUB_GUIDE).toMatch(/persist-credentials:\s*false/)
  })

  it('explains the tampering threat the trusted ref defends against, and the fork caveat', () => {
    expect(GITHUB_GUIDE).toMatch(/tamper/i)
    expect(GITHUB_GUIDE).toMatch(/(self-grant|self-approve|bypass)/i)
    expect(GITHUB_GUIDE).toMatch(/fork/i)
    // the inline alternative for projects that refuse pull_request_target
    expect(GITHUB_GUIDE).toMatch(/inline/i)
  })

  it('publishes pair-explicit-approval as a commit status pinned to the PR HEAD sha', () => {
    expect(GITHUB_GUIDE).toMatch(/statuses\/\$HEAD_SHA[\s\S]{0,400}pair-explicit-approval/)
    expect(GITHUB_GUIDE).toMatch(/statuses:\s*write/)
  })

  it('states WHY the status is posted explicitly: the run’s own SHA is not the PR head', () => {
    expect(GITHUB_GUIDE).toMatch(
      /(GITHUB_SHA|the run'?s? (own )?(head )?sha)[\s\S]{0,320}(base|not the (PR )?head)/i,
    )
    expect(GITHUB_GUIDE).toMatch(/pull_request_review[\s\S]{0,400}head (commit|sha)/i)
  })
})

describe('copy-pasteable host recipe is actually runnable (round 2)', () => {
  it('defines the repository variables once and uses ONE form (repos/$REPO/...)', () => {
    expect(GITHUB_GUIDE).toMatch(/REPO="\$\(gh repo view --json nameWithOwner/)
    // no mixed `repos/$OWNER/$REPO/` form in the new section
    expect(GITHUB_GUIDE).not.toMatch(/repos\/\$OWNER\/\$REPO/)
  })

  it('ships enforce_admins FALSE in the payload, pointing at the step that flips it', () => {
    expect(GITHUB_GUIDE).toMatch(/"enforce_admins": false/)
    expect(GITHUB_GUIDE).not.toMatch(/"enforce_admins": true/)
  })

  it('paginates the reviews query — an approval on page 2 must not read as zero', () => {
    expect(GITHUB_GUIDE).toMatch(/--paginate[^\n]*pulls\/\$PR\/reviews/)
    expect(GITHUB_GUIDE).not.toMatch(/reviews\?per_page=100/)
  })

  it('ordering step 2 covers the approval-time re-run, not only PR open', () => {
    expect(GITHUB_GUIDE).toMatch(/### Ordering/)
    expect(GITHUB_GUIDE).toMatch(/(approv|review submission)[\s\S]{0,240}head (commit|sha)/i)
  })
})

describe('pr-states.md does not restate tier thresholds (round 2)', () => {
  it('links quality-model §4 instead of copying reviewer/SLA/checklist values', () => {
    expect(GUIDELINE).not.toMatch(/1 working day/)
    expect(GUIDELINE).not.toMatch(/2 working days/)
    expect(GUIDELINE).not.toMatch(/extended checklist/i)
    expect(GUIDELINE).toMatch(/quality-model\.md/)
  })
})

describe('review dispatch is executable and never merges (round 2)', () => {
  it('publish-pr emits a review-dispatch-required signal instead of nesting a subagent', () => {
    expect(PUBLISH_PR).toMatch(/review-dispatch-required/)
    expect(PUBLISH_PR).toMatch(/nest(ed|ing)?[\s\S]{0,200}subagent|subagent[\s\S]{0,200}nest/i)
  })

  it('the dispatch prompt forbids the merge phase (phases 1–5 only)', () => {
    expect(PUBLISH_PR).toMatch(/never merge|do not merge|phases 1–5 only/i)
    expect(PUBLISH_PR).toMatch(/Phase 6/)
  })

  it('implement Step 3.3 is the actor that dispatches the review when the signal comes back', () => {
    expect(IMPLEMENT).toMatch(/review-dispatch-required/)
    expect(IMPLEMENT).toMatch(/\/review \$pr=/)
    expect(IMPLEMENT).toMatch(/never merge|do not merge|phases 1–5 only/i)
  })

  it('review defines NON-INTERACTIVE behaviour for the two human prompts when dispatched', () => {
    expect(REVIEW).toMatch(/dispatched/i)
    // Step 1.4 confirmation is skipped rather than stalling
    expect(REVIEW).toMatch(/Proceed with review\?[\s\S]{0,600}(dispatched|non-interactive)/i)
    // Step 5.5 never self-answers "merge now"
    expect(REVIEW).toMatch(
      /(dispatched|non-interactive)[\s\S]{0,400}(never|does not)[\s\S]{0,80}Phase 6/i,
    )
  })
})

describe('"extended" checklist depth is defined, not decorative (round 2)', () => {
  it('quality-model §4 defines what standard vs extended checklist depth means', () => {
    expect(QUALITY_MODEL).toMatch(/checklist depth/i)
    expect(QUALITY_MODEL).toMatch(/extended[\s\S]{0,400}(no section skipped|every section)/i)
    expect(QUALITY_MODEL).toMatch(/code-review-template\.md/)
  })

  it('review Step 5.4 reads that definition instead of naming a non-existent artifact', () => {
    expect(REVIEW).toMatch(/checklist depth[\s\S]{0,300}quality-model/i)
  })
})

// --- review round 3 on PR #390 -------------------------------------------------
// A required status context is writable by any push-access principal, so the
// authorization context must pin its producer and fail closed when interrupted; and
// the docs must not claim more than the mechanism delivers. Both merge paths — not
// only the reviewer's — must carry the synthesis precondition.

const POST_REVIEW_MERGE_PATH = join(DATASET, '.skills/process/implement/post-review-merge.md')
const POST_REVIEW_MERGE = readFileSync(POST_REVIEW_MERGE_PATH, 'utf-8')
const ADR_018 = readFileSync(
  join(__dirname, '../../../../.pair/adoption/tech/adr/adr-018-pr-state-flow-required-checks.md'),
  'utf-8',
)
const DOCS_PAGE = readFileSync(
  join(__dirname, '../../../../apps/website/content/docs/concepts/pr-state-flow.mdx'),
  'utf-8',
)
const ROOT_WOW = readFileSync(
  join(__dirname, '../../../../.pair/adoption/tech/way-of-working.md'),
  'utf-8',
)

describe('the authorization context pins its producer (round 3)', () => {
  it('uses the checks form with an app_id, never the legacy unpinned contexts array', () => {
    expect(GITHUB_GUIDE).toMatch(/"checks":\s*\[/)
    expect(GITHUB_GUIDE).toMatch(/"context":\s*"pair-explicit-approval",\s*"app_id"/)
    expect(GITHUB_GUIDE).not.toMatch(/"contexts":\s*\[/)
    expect(GITHUB_GUIDE).toMatch(/\/apps\/github-actions/)
  })

  it('setup-gates wires the pin and the pending-first property, not just the contexts', () => {
    expect(SETUP_GATES).toMatch(/app_id/)
    expect(SETUP_GATES).toMatch(/pending result as its first step/)
    expect(SETUP_GATES).toMatch(/anti-accident/)
  })

  it('states the companion repository settings that shrink the residual', () => {
    expect(GITHUB_GUIDE).toMatch(/read-only/i)
    expect(GITHUB_GUIDE).toMatch(/CODEOWNERS/)
    expect(GITHUB_GUIDE).toMatch(/require_code_owner_reviews/)
  })

  it('records that pair-review is anti-accident, NOT authorization (and names the unforgeable form)', () => {
    for (const doc of [GITHUB_GUIDE, GUIDELINE, ADR_018]) {
      expect(doc).toMatch(/anti-accident/i)
      expect(doc).toMatch(/forgeable/i)
    }
    expect(GITHUB_GUIDE).toMatch(/App[\s\S]{0,120}check-run|check-run[\s\S]{0,120}App/i)
    expect(DOCS_PAGE).toMatch(/anti-accident/i)
  })

  it('publishes a pending status FIRST, so an interrupted evaluation fails closed', () => {
    const pendingAt = GITHUB_GUIDE.indexOf("state='pending' -f context='pair-explicit-approval'")
    const checkoutAt = GITHUB_GUIDE.indexOf('uses: actions/checkout')
    const resolveAt = GITHUB_GUIDE.indexOf('TIER="$(resolve_tier')
    expect(pendingAt).toBeGreaterThan(-1)
    expect(pendingAt).toBeLessThan(checkoutAt)
    expect(pendingAt).toBeLessThan(resolveAt)
    expect(GITHUB_GUIDE).toMatch(/cancel|interrupt/i)
  })
})

describe('the 🔴 approval predicate is shipped once, not transliterated (round 3)', () => {
  it('lives in pr-state.sh and is consumed by name in the workflow snippet', () => {
    expect(EVALUATOR).toMatch(/human_approval_jq_filter\(\)/)
    expect(GITHUB_GUIDE).toMatch(/--jq "\$\(human_approval_jq_filter\)"/)
  })
})

describe('BOTH merge paths carry the synthesis precondition (round 3)', () => {
  it('implement Phase 4 Step 4.1 re-synthesizes and HALTs instead of counting approvals', () => {
    expect(POST_REVIEW_MERGE).toContain('merge_allowed')
    expect(POST_REVIEW_MERGE).toContain('resolve_pr_state')
    expect(POST_REVIEW_MERGE).toContain('ready-to-merge')
    expect(POST_REVIEW_MERGE).toContain('human_approval_jq_filter')
    expect(POST_REVIEW_MERGE).toMatch(/HALT/)
    expect(POST_REVIEW_MERGE).not.toMatch(/at least one approval/i)
  })

  it('review Phase 6 keeps the same precondition (the reviewer-side path)', () => {
    expect(MERGE_CASCADE).toContain('merge_allowed')
    expect(MERGE_CASCADE).toMatch(/HALT/)
  })

  it('pr-states.md names /implement Phase 4 in the actor table', () => {
    expect(GUIDELINE).toMatch(/`\/implement` Phase 4/)
  })

  it('implement links the state model instead of restating it', () => {
    assertLinksResolve(POST_REVIEW_MERGE, POST_REVIEW_MERGE_PATH, ['pr-states.md', 'pr-state.sh'])
  })
})

describe('the solo-maintainer token is citable everywhere it is referenced (round 3)', () => {
  it('cites #398 in the model, the ADR, the docs page and this repo’s way-of-working', () => {
    expect(GUIDELINE).toContain('#398')
    expect(ADR_018).toContain('#398')
    expect(DOCS_PAGE).toContain('398')
    expect(ROOT_WOW).toContain('#398')
  })

  it('drops the "does not exist in this flow" phrasing in favour of the tracked issue', () => {
    expect(GUIDELINE).not.toMatch(/it does not exist in this flow/)
  })
})

// --- story #398: the solo-maintainer explicit-approval token -------------------
// A repository with one human account cannot produce the non-author approving review
// the 🔴 rule asks for, so the rule was unusable there. The token is an ALTERNATIVE
// satisfaction path — deliberate, auditable, head-bound — and explicitly NOT
// independent review. The authorization-relevant part is that the actor is resolved
// from host-asserted fields, never from the body the applier writes.

/**
 * The token PREDICATE ITSELF — the single `printf` line inside
 * `human_token_approval_select`, not the file that contains it.
 *
 * Scoping matters (review round 1): asserted against the whole evaluator, a check
 * like `/\.user\.type=="User"/` is satisfied by the REVIEW predicate this story does
 * not touch, and `/[Bb]ot/` by the prose comment above it — so deleting the bot
 * exclusion from the token predicate left both AC-named tests green.
 */
const TOKEN_PREDICATE = ((): string => {
  const m = EVALUATOR.match(/human_token_approval_select\(\)\s*\{\s*\n\s*printf\s+'%s'\s+'([^']*)'/)
  expect(m, 'human_token_approval_select must ship as one printf-ed predicate').not.toBeNull()
  return (m as RegExpMatchArray)[1] as string
})()

describe('the token predicate ships in the evaluator (#398)', () => {
  it('exposes the token entry points next to the review predicate it does not replace', () => {
    for (const fn of [
      'human_token_approval_jq_filter',
      'human_token_approval_login_jq_filter',
      'human_token_approval_actor_jq_filter',
      'token_permission_sufficient',
      'token_approver_login',
      'solo_approval_token_body',
    ]) {
      expect(EVALUATOR).toContain(fn)
    }
    // AC4 regression: the review predicate is untouched — still APPROVED, on the
    // current head, by a human who is not the author.
    expect(EVALUATOR).toContain(
      '.state=="APPROVED" and .commit_id==env.HEAD_SHA and .user.type=="User" and .user.login!=env.PR_AUTHOR',
    )
  })

  it('AC2 — resolves the actor from host-asserted fields, never from the applier’s body', () => {
    expect(TOKEN_PREDICATE).toContain('.user.type=="User"')
    expect(TOKEN_PREDICATE).toContain('performed_via_github_app')
    expect(TOKEN_PREDICATE).toContain('author_association')
    // the body is read for the COMMAND + the SHA only, never for an actor field
    expect(TOKEN_PREDICATE).not.toMatch(/\.body[\s\S]{0,120}(login|actor|user\.type)/)
  })

  it('AC2/AC3 — the token is bound to the current head SHA and never satisfiable unbound', () => {
    expect(TOKEN_PREDICATE).toContain('env.HEAD_SHA')
    // HEAD_SHA is concatenated INTO a regex, so a length check is not enough: 40
    // metacharacters would make the predicate match any `/approve <40 chars>`.
    expect(TOKEN_PREDICATE).toContain('test("^[0-9a-f]{40}$")')
    expect(TOKEN_PREDICATE).not.toMatch(/\(env\.HEAD_SHA\|length\)==40/)
  })

  it('AC5 — bots and app-attributed comments are excluded by construction', () => {
    expect(TOKEN_PREDICATE).toContain('.user.type=="User"')
    expect(TOKEN_PREDICATE).toContain('(.performed_via_github_app|not)')
  })

  it('excludes the PR author unless the repository declared itself single-human', () => {
    expect(TOKEN_PREDICATE).toContain('env.SOLO_APPROVAL_TOKEN=="true"')
    expect(TOKEN_PREDICATE).toContain('.user.login != env.PR_AUTHOR')
  })

  it('anchors the command to its own line, so a quote-reply never approves', () => {
    // `(^|\s)…` matched the newline before `> ` in GitHub's own Quote reply output.
    expect(TOKEN_PREDICATE).toContain(String.raw`test("(^|\\n)/approve`)
    // no leading-whitespace tolerance either: an indented code block must not approve
    expect(TOKEN_PREDICATE).toContain(String.raw`(\\n|$)")`)
    expect(TOKEN_PREDICATE).not.toContain(String.raw`(^|\\s)/approve`)
  })

  it('strips FENCED regions before the anchor — a fence puts the command at column 0', () => {
    // Round 2: the line anchor rejects `> `, 4-space indents and inline backticks,
    // and accepts a ```-fenced command — the shape a maintainer produces to SHOW the
    // token, including in this repo's own guide. Stripping happens before `test(…)`.
    const stripAt = TOKEN_PREDICATE.indexOf('split("```")')
    const testAt = TOKEN_PREDICATE.indexOf('test("(^|\\\\n)/approve')
    expect(stripAt, 'the predicate must strip backtick fences').toBeGreaterThan(-1)
    expect(TOKEN_PREDICATE, 'and tilde fences too').toContain('split("~~~")')
    expect(stripAt).toBeLessThan(testAt)
    // the ODD segments (inside the fences) are the ones dropped
    expect(TOKEN_PREDICATE).toContain('map(select(.key % 2 == 0) | .value)')
  })

  it('makes the server-side permission read the authorization, not the association', () => {
    // `MEMBER` is "in the owning org", not "has push access here" — so the
    // association may only ever be a pre-filter.
    expect(EVALUATOR).toMatch(/admin \| maintain \| write\) return 0/)
    expect(EVALUATOR).toMatch(/collaborators\/\{login\}\/permission/)
    expect(EVALUATOR).toMatch(/pre-filter, not the authorization/i)
  })

  it('bounds the audit line under the 140-char status-description cap', () => {
    // The full 40-char head put a 24+ character login over the API cap.
    expect(EVALUATOR).toContain('env.HEAD_SHA[0:12]')
    expect(EVALUATOR).toMatch(/140/)
  })

  it('states the guarantee in the settled words, inside the executable projection', () => {
    expect(EVALUATOR).toMatch(/confirmation, not independent review/)
  })

  it('builds every projection from ONE predicate text (count + audit line cannot drift)', () => {
    expect(EVALUATOR).toMatch(/human_token_approval_select/)
    for (const proj of [
      'human_token_approval_jq_filter',
      'human_token_approval_login_jq_filter',
      'human_token_approval_actor_jq_filter',
    ]) {
      const body = EVALUATOR.slice(EVALUATOR.indexOf(`${proj}() {`))
      expect(body.slice(0, 300), `${proj} must be built from the shared select`).toContain(
        '$(human_token_approval_select)',
      )
    }
  })
})

describe('the host job wires the token as the ALTERNATIVE path (#398)', () => {
  it('AC1 — the job succeeds on either a human non-author review OR an accepted token', () => {
    expect(GITHUB_GUIDE).toMatch(/human_token_approval_jq_filter/)
    expect(GITHUB_GUIDE).toMatch(/issues\/\$PR\/comments/)
  })

  it('AC4 — the review path is queried first; the token is only the fallback', () => {
    const reviewAt = GITHUB_GUIDE.indexOf('pulls/$PR/reviews')
    const tokenAt = GITHUB_GUIDE.indexOf('issues/$PR/comments')
    expect(reviewAt).toBeGreaterThan(-1)
    expect(tokenAt).toBeGreaterThan(reviewAt)
    expect(GITHUB_GUIDE).toMatch(/(preferred|primary|only if|fallback)[\s\S]{0,400}token/i)
  })

  it('paginates the comments query — a token on page 2 is not "no token"', () => {
    expect(GITHUB_GUIDE).toMatch(/--paginate[^\n]*issues\/\$PR\/comments/)
  })

  it('keeps the authorization properties: trusted ref, head-pinned status, producer pin', () => {
    expect(GITHUB_GUIDE).toMatch(
      /ref:\s*\$\{\{\s*github\.event\.pull_request\.base\.sha(\s*\|\|\s*steps\.pr\.outputs\.base)?\s*\}\}/,
    )
    // the fallback is the resolved BASE of the same PR — never the head, on any trigger
    expect(GITHUB_GUIDE).not.toMatch(/ref:[^\n]*steps\.pr\.outputs\.head/)
    expect(GITHUB_GUIDE).toMatch(/"context":\s*"pair-explicit-approval",\s*"app_id"/)
    expect(GITHUB_GUIDE).toMatch(/statuses\/\$HEAD_SHA[\s\S]{0,400}pair-explicit-approval/)
  })

  it('re-evaluates on the comment event, otherwise the token never reaches the check', () => {
    expect(GITHUB_GUIDE).toMatch(/issue_comment:/)
  })

  it('authorizes the actor server-side — the association is only a pre-filter', () => {
    expect(GITHUB_GUIDE).toMatch(/collaborators\/\$1\/permission/)
    expect(GITHUB_GUIDE).toMatch(/token_approver_login/)
    expect(GITHUB_GUIDE).toMatch(/human_token_approval_login_jq_filter/)
    // the audit line is drawn only for the actor stage 2 authorized
    expect(GITHUB_GUIDE).toMatch(/grep "\^\$APPROVER approved head "/)
  })

  it('threads the single-human opt-in, so the author exclusion is live by default', () => {
    expect(GITHUB_GUIDE).toMatch(/SOLO_APPROVAL_TOKEN: \$\{\{ vars\.PAIR_SOLO_APPROVAL_TOKEN \}\}/)
    expect(GITHUB_GUIDE).toMatch(/PAIR_SOLO_APPROVAL_TOKEN[\s\S]{0,600}author/i)
  })

  it('body-filters the created comment, but never the withdrawal events', () => {
    expect(GITHUB_GUIDE).toMatch(/contains\(github\.event\.comment\.body, '\/approve'\)/)
    // an edited-away or deleted token no longer CONTAINS the command and must still
    // re-evaluate, so only `created` may be filtered
    expect(GITHUB_GUIDE).toMatch(/github\.event\.action != 'created' \|\|/)
  })

  it('tells the adopter exactly what to post, and what it does NOT mean', () => {
    expect(GITHUB_GUIDE).toMatch(/\/approve <head-sha>|\/approve \$HEAD_SHA/)
    expect(GITHUB_GUIDE).toMatch(/confirmation, not independent review/)
  })

  it('lets a comment run QUEUE — `concurrency` outranks the job `if:` (round 2)', () => {
    // `concurrency` is evaluated at RUN level, before any job condition, so the `if:`
    // cannot stop a comment event from cancelling an in-flight evaluation; the run
    // that cancelled it is then skipped and nothing publishes, leaving the required
    // context pending forever on a chatty thread.
    expect(GITHUB_GUIDE).toMatch(
      /cancel-in-progress: \$\{\{ github\.event_name != 'issue_comment' \}\}/,
    )
    expect(GITHUB_GUIDE).not.toMatch(/cancel-in-progress: true/)
    // and the bullet no longer claims an ordinary comment cannot cancel anything
    expect(GITHUB_GUIDE).not.toMatch(/neither spends Actions minutes nor cancels/)
  })

  it('reports a permission-lookup failure as itself, not as "no token was posted"', () => {
    expect(GITHUB_GUIDE).toMatch(/TOKEN_PERMISSION_UNKNOWN/)
    expect(GITHUB_GUIDE).toMatch(/HTTP 404/)
    expect(GITHUB_GUIDE).toMatch(/token_denied_desc/)
    // the collaborators endpoint is not covered by the job's four permissions
    expect(GITHUB_GUIDE).toMatch(/administration: read/)
    expect(EVALUATOR).toMatch(/TOKEN_PERMISSION_UNKNOWN/)
    expect(EVALUATOR).toMatch(/token_denied_desc/)
  })

  it('stops claiming the token branch is free for a multi-human repository', () => {
    for (const doc of [GITHUB_GUIDE, ADR_018]) {
      expect(doc).not.toMatch(/pays no (extra|additional) API call/i)
      expect(doc).not.toMatch(/unchanged, byte for byte/i)
    }
  })
})

describe('the docs claim exactly what the token provides (#398)', () => {
  it('AC8 — pr-states.md names the three properties and the one it does not have', () => {
    expect(GUIDELINE).toMatch(/deliberate/i)
    expect(GUIDELINE).toMatch(/audit/i)
    expect(GUIDELINE).toMatch(/confirmation, not independent review/)
    expect(GUIDELINE).toMatch(/\/approve/)
  })

  it('AC6 — the ADR records the forgery-resistance limit and the #218 dependency', () => {
    expect(ADR_018).toMatch(/confirmation, not independent review/)
    expect(ADR_018).toMatch(/#218/)
    expect(ADR_018).toMatch(/forgery-resistance/i)
    // the grep-verifiable per-identity statement the DoD asks for, literally
    expect(ADR_018).toMatch(
      /shared credentials[\s\S]{0,600}dedicated identity|dedicated identity[\s\S]{0,600}shared credentials/i,
    )
  })

  it('AC6 — and states WHICH shape of #218 recovers it (a machine user account does not)', () => {
    // The claim only holds for an App/Bot identity: a machine USER account with a
    // PAT is `user.type == "User"` with no App attribution, so the predicate ACCEPTS
    // the agent and nothing is recovered.
    expect(ADR_018).toMatch(/machine user account/i)
    expect(ADR_018).toMatch(/GitHub App or Bot account/i)
    expect(ADR_018).toMatch(/deny-list/i)
    expect(DOCS_PAGE).toMatch(/machine \*?user\*? account/i)
  })

  it('records the author exclusion and its single-human opt-in as the decision it is', () => {
    for (const doc of [ADR_018, GITHUB_GUIDE, GUIDELINE, DOCS_PAGE]) {
      expect(doc).toMatch(/PAIR_SOLO_APPROVAL_TOKEN/)
    }
    expect(ADR_018).toMatch(/author exclusion/i)
    expect(GITHUB_GUIDE).toMatch(/pre-filter/i)
    expect(GUIDELINE).toMatch(/pre-filter/i)
  })

  it('corrects the "write-level association" claim on every surface that made it', () => {
    for (const doc of [EVALUATOR, GITHUB_GUIDE, GUIDELINE, ADR_018, DOCS_PAGE, ROOT_WOW]) {
      expect(doc).not.toMatch(/write-level association/i)
      expect(doc).not.toMatch(/write-level `?author_association`?/i)
    }
    for (const doc of [GITHUB_GUIDE, GUIDELINE, DOCS_PAGE, ROOT_WOW]) {
      expect(doc).toMatch(/collaborators API|collaborators\/|admin.*maintain.*write/i)
    }
  })

  it('AC7 — the tier REQUIREMENT is untouched: quality-model §4 and D10 still demand it', () => {
    expect(QUALITY_MODEL).toMatch(/explicit approval required/i)
    // the token changes how the rule is satisfied, never what it demands
    expect(ADR_018).toMatch(/satisfaction path|how the rule is satisfied/i)
    expect(ADR_018).not.toMatch(/🔴 no longer requires|drops the explicit-approval requirement/i)
  })

  it('AC8 — the deferral wording is gone everywhere it used to point at #398', () => {
    for (const doc of [GUIDELINE, ADR_018, ROOT_WOW]) {
      expect(doc).toContain('#398')
    }
    expect(GUIDELINE).not.toMatch(/deliberately not part of this flow/)
    expect(ADR_018).not.toMatch(/intentionally absent here rather than\s*\n?\s*half-specified/)
    expect(DOCS_PAGE).toMatch(/\/approve/)
  })
})

describe('doc coherence, round 3', () => {
  it('the way-of-working TEMPLATE carries the approval-time re-run and links the ordering steps', () => {
    expect(WOW_TEMPLATE).toMatch(/same head SHA/)
    expect(WOW_TEMPLATE).toMatch(/github-implementation\.md/)
  })

  it('publish-pr documents /implement’s closing phase as a current caller, not a future one', () => {
    expect(PUBLISH_PR).not.toMatch(/future closing phase/)
    expect(PUBLISH_PR).not.toMatch(/wired in #256/)
    expect(PUBLISH_PR).toMatch(/closing phase \(Step 3\.3\)/)
  })

  it('the host evidence table says what kind of artifact it is (point-in-time, re-runnable)', () => {
    expect(GITHUB_GUIDE).toMatch(/point-in-time/i)
    expect(GITHUB_GUIDE).toMatch(/re-running the ordering steps/i)
    expect(ADR_018).toMatch(/point-in-time/i)
  })
})
