import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildMirrorTransform, assertMirrorMatches, KB_MIRROR } from '../tools/mirror-guard'

// Conformance guards for the three code-review checklist artifacts — the template, the
// review skill, and how-to-11 — in both corpora (dataset source + installed root mirror).
// Two families live here, per ADL 2026-07-18 (one file per target KB artifact, not per
// introducing story): the verdict-first structure (#228, below) and the bug-fix
// red-test-before-fix check (further down).
//
// #228: the code-review template is verdict-first (D22, R6.6)
// and carries the seven required assessment sections — input validation, output
// handling, authentication, authorization, introduced vulnerabilities, cost,
// architecture (coupling) — each a 1-line verdict + <details>. The review artifact is
// the NATIVE GitHub review body (verdict = the review action), not a separate comment
// (decision Q5, AC2). /pair-process-review composes /assess-cost, surfaces the
// architecture/coupling verdict (assess-coupling, "not assessed" until #263), keeps
// the review-time classification a floor (raise-only, D17) and emits the
// "Classification changed" drift note upward only. Asserted on BOTH the dataset
// (source of truth) and the installed root mirror, name-mapped — the drift class this
// repo's parity guards exist to catch.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')
const DATASET_TEMPLATES = join(
  __dirname,
  '../../dataset/.pair/knowledge/guidelines/collaboration/templates',
)
const MIRROR_TEMPLATES = join(
  __dirname,
  '../../../../.pair/knowledge/guidelines/collaboration/templates',
)
const DATASET_HOWTO = join(__dirname, '../../dataset/.pair/knowledge/how-to')
const MIRROR_HOWTO = join(__dirname, '../../../../.pair/knowledge/how-to')

/** KB-relative identity of the template, as the KB mirror guard addresses it. */
const TEMPLATE_KB_REL = 'guidelines/collaboration/templates/code-review-template.md'

const TEMPLATE_DATASET = readFileSync(join(DATASET_TEMPLATES, 'code-review-template.md'), 'utf-8')
const TEMPLATE_MIRROR = readFileSync(join(MIRROR_TEMPLATES, 'code-review-template.md'), 'utf-8')
const REVIEW_DATASET = readFileSync(join(DATASET_SKILLS, 'process/review/SKILL.md'), 'utf-8')
const REVIEW_MIRROR = readFileSync(join(MIRROR_SKILLS, 'pair-process-review/SKILL.md'), 'utf-8')
const HOWTO11_DATASET = readFileSync(join(DATASET_HOWTO, '11-how-to-code-review.md'), 'utf-8')
const HOWTO11_MIRROR = readFileSync(join(MIRROR_HOWTO, '11-how-to-code-review.md'), 'utf-8')

// The seven required assessment sections (AC1), matched case-insensitively as `###` headings.
const REQUIRED_SECTIONS = [
  'Input validation',
  'Output handling',
  'Authentication',
  'Authorization',
  'Introduced vulnerabilities',
  'Cost',
  'Architecture',
] as const

const TEMPLATE_VARIANTS = [
  ['dataset', TEMPLATE_DATASET],
  ['mirror', TEMPLATE_MIRROR],
] as const

describe('code-review-template — verdict-first reading budget (AC3, D22) (#228)', () => {
  for (const [label, content] of TEMPLATE_VARIANTS) {
    it(`${label} opens with a Verdict section carrying risk tier + cost class + decision`, () => {
      // Verdict must be the first `##` section so the reader hits it in ~30s.
      const firstSection = content.slice(content.search(/^##\s+/m)).split(/\n## /)[0]
      expect(firstSection).toMatch(/##\s+Verdict/)
      expect(firstSection).toMatch(/risk:/)
      expect(firstSection).toMatch(/cost:/)
      expect(firstSection).toMatch(/APPROVED|CHANGES-REQUESTED/)
      // No TECH-DEBT verdict ON THE VERDICT LINE ITSELF: ADL
      // 2026-08-21-review-severity-classification-and-convergence.md retires it as an option —
      // Minor findings block merge exactly like Major. Scoped to the `risk:`/`cost:` line, not the
      // whole section, because the explanatory HTML comment right below it legitimately mentions
      // the retired token by name to explain why it is gone.
      const verdictLine = firstSection
        .split('\n')
        .find(line => line.includes('risk:') && line.includes('cost:'))
      expect(verdictLine, 'verdict line not found').toBeDefined()
      expect(verdictLine).not.toMatch(/TECH-DEBT/)
    })

    it(`${label} states the ~30-second reading budget (D22, R6.6)`, () => {
      expect(content).toMatch(/D22/)
      expect(content).toMatch(/30\s*[- ]?\s*second|~?30s/i)
    })

    it(`${label} declares it is the native review body, not a separate comment (AC2, Q5)`, () => {
      expect(content.toLowerCase()).toMatch(/native (github )?review/)
      expect(content.toLowerCase()).toMatch(/no separate.*comment|not a separate.*comment/)
    })
  }
})

describe('code-review-template — seven verdict-first assessment sections (AC1) (#228)', () => {
  for (const [label, content] of TEMPLATE_VARIANTS) {
    for (const section of REQUIRED_SECTIONS) {
      it(`${label} has a "${section}" section that is 1-line verdict + <details>`, () => {
        const re = new RegExp(`^###\\s+.*${section}`, 'im')
        const idx = content.search(re)
        expect(idx).toBeGreaterThan(-1)
        // Slice to the next `###`/`##` heading — isolate this section only.
        const body = content
          .slice(idx)
          .replace(re, '')
          .split(/\n#{2,3}\s/)[0]
        // A 1-line verdict marker...
        expect(body).toMatch(/\*\*Verdict:\*\*|Verdict:/i)
        // ...backed by a collapsed details block.
        expect(body).toContain('<details>')
      })
    }

    it(`${label} shows an unavailable assessment as "not assessed" explicitly (edge case)`, () => {
      expect(content.toLowerCase()).toContain('not assessed')
    })
  }
})

const REVIEW_VARIANTS = [
  { label: 'dataset', content: REVIEW_DATASET, cost: '/assess-cost', coupling: '/assess-coupling' },
  {
    label: 'mirror',
    content: REVIEW_MIRROR,
    cost: '/pair-capability-assess-cost',
    coupling: '/pair-capability-assess-coupling',
  },
] as const

describe('review skill — composes assess-cost into the review (AC1 #228, AC3 #226)', () => {
  for (const v of REVIEW_VARIANTS) {
    it(`${v.label} lists assess-cost as a composed skill`, () => {
      const row = v.content
        .split('\n')
        .find(line => line.includes(`\`${v.cost}\``) && line.includes('Capability'))
      expect(row).toBeDefined()
    })

    it(`${v.label} composes assess-cost against the diff and shows the cost class 1-line + collapsed`, () => {
      expect(v.content).toContain(`Compose \`${v.cost}\``)
      expect(v.content).toMatch(/D22/)
    })

    it(`${v.label} surfaces the architecture/coupling verdict, "not assessed" until assess-coupling ships`, () => {
      expect(v.content).toContain(v.coupling)
      // Architecture/coupling degrades to "not assessed" when the capability is absent.
      const gd = v.content.slice(v.content.indexOf('## Graceful Degradation'))
      expect(gd.toLowerCase()).toContain('not assessed')
    })
  }
})

describe('review skill — review-time classification is a floor, drift note fires upward (AC3 #226, #228)', () => {
  for (const v of REVIEW_VARIANTS) {
    it(`${v.label} keeps the review matrix raise-only (never lowers the tier, D17)`, () => {
      expect(v.content).toMatch(/never\s+lower|raise-only|raise only/i)
      expect(v.content).toMatch(/D17/)
    })

    it(`${v.label} emits a "Classification changed" drift note when review-time differs`, () => {
      expect(v.content).toMatch(/Classification changed/)
    })

    it(`${v.label} applies the projected classification tags on the PR (not only the story)`, () => {
      expect(v.content.toLowerCase()).toMatch(/tag.*on the pr|label.*on the pr|re-apply.*tag/)
    })
  }
})

describe('review skill — review IS the native review body, no separate comment (AC2, Q5) (#228)', () => {
  for (const v of REVIEW_VARIANTS) {
    it(`${v.label} submits the report as the native review body, not a separate PR comment`, () => {
      const post = v.content.slice(v.content.indexOf('### Step 5.3'))
      expect(post.toLowerCase()).toMatch(/native (github )?review|review body/)
      expect(post.toLowerCase()).not.toMatch(/post the review report as a pr comment/)
      // Positive behavioral invariant (not just the absence of one phrasing): the report
      // is delivered via a native-review EVENT + a body-file, so a differently worded
      // "post as a separate comment" reintroduction still fails this guard.
      expect(post).toMatch(/APPROVE|REQUEST_CHANGES/)
      expect(post.toLowerCase()).toMatch(
        /--body-file|as (the |its )?(native )?(github )?review body|report .*as .*body/,
      )
    })
  }
})

describe('how-to-11 — aligned to native-review-body verdict (AC2) (#228)', () => {
  for (const [label, content] of [
    ['dataset', HOWTO11_DATASET],
    ['mirror', HOWTO11_MIRROR],
  ] as const) {
    it(`${label} no longer instructs a separate "post report as PR comment"`, () => {
      expect(content.toLowerCase()).not.toMatch(/post report as pr comment/)
    })
  }
})

// The TDD bug-fix check — "red test before fix".
//
// Test-first bug fixing is already POLICY (`AGENTS.md` § Bug Resolution Workflow). Policy
// nobody verifies is decoration, so the check lives in the review checklist: one
// bug-fix-conditional assessment section in the template — same verdict-first shape as the
// seven above — evaluated by the review flow on bug fixes and written out as **not
// applicable** on features (a feature carries no test-first obligation; the exemption is part
// of the rule, not a gap in it).
//
// What each guard below is protecting, and why it is a real regression class:
// - the section EXISTS and is 1-line verdict + collapsed `<details>` — a wall-of-text item is
//   the one that gets skipped inside the 30-second reading budget the rest of this file pins;
// - the item asks for EVIDENCE (which test, failing-before / passing-after) rather than a
//   yes/no — a tick with no named test is the rubber stamp this check exists to prevent;
// - the feature EXEMPTION and the untestable-fix RATIONALE escape hatch are both explicit —
//   without them the item either blocks work it was never meant to (a doc typo "fix") or gets
//   quietly ignored, which retires the check in practice;
// - a missing reproducing test is a FINDING carried into the decision, not a silent pass.
//
// Lives here rather than in its own file per ADL 2026-07-18 (conformance tests are organized
// per target KB artifact, not per introducing story): these are the same three artifacts the
// blocks above assert on.

/** The bug-fix assessment section's heading, matched as a `###` heading. */
const RED_TEST_HEADING = /^###\s+.*Red test before fix/im

/** That section's body, from its heading up to the next `##`/`###` heading. */
const redTestSection = (content: string): string => {
  const idx = content.search(RED_TEST_HEADING)
  expect(idx, 'no "Red test before fix" assessment section').toBeGreaterThan(-1)
  return content
    .slice(idx)
    .replace(RED_TEST_HEADING, '')
    .split(/\n#{2,3}\s/)[0]
}

describe('code-review-template — bug-fix red-test assessment section', () => {
  for (const [label, content] of TEMPLATE_VARIANTS) {
    it(`${label} carries the section as a 1-line verdict + collapsed details`, () => {
      const body = redTestSection(content)
      expect(body).toMatch(/\*\*Verdict:\*\*/)
      expect(body).toContain('<details>')
    })

    it(`${label} is bug-fix-conditional and exempts feature PRs explicitly`, () => {
      const body = redTestSection(content).toLowerCase()
      expect(body).toMatch(/bug fix|bug-fix/)
      // The exemption is WRITTEN OUT as a verdict value, never a dropped section.
      expect(body).toMatch(/not applicable\s*—\s*not a bug fix/)
    })

    it(`${label} asks for the evidence (which test + failing-before/passing-after), not a yes/no`, () => {
      const body = redTestSection(content).toLowerCase()
      expect(body).toMatch(/which test/)
      expect(body).toMatch(/failing[- ]before/)
    })

    it(`${label} allows a recorded rationale for a genuinely untestable fix`, () => {
      expect(redTestSection(content).toLowerCase()).toMatch(/rationale/)
    })

    it(`${label} makes a missing reproducing test a finding, never a silent pass`, () => {
      expect(redTestSection(content)).toMatch(/Major/)
    })
  }
})

describe('review skill — evaluates the bug-fix red-test check', () => {
  for (const v of REVIEW_VARIANTS) {
    /** The step that evaluates the check, from its heading to the next `##`/`###`. */
    const step = (): string => {
      const re = /^###\s+Step 2\.7:.*$/im
      const idx = v.content.search(re)
      expect(idx, 'no Step 2.7 evaluating the bug-fix red test').toBeGreaterThan(-1)
      return v.content.slice(idx).split(/\n#{2,3}\s/)[0]
    }

    it(`${v.label} has a Phase 2 step for the red-test check`, () => {
      expect(step().toLowerCase()).toMatch(/red test/)
    })

    it(`${v.label} keys the step on the review type — applies to bugs, skips features`, () => {
      const body = step()
      expect(body).toMatch(/Step 1\.3/)
      expect(body.toLowerCase()).toMatch(/not applicable\s*—\s*not a bug fix/)
    })

    it(`${v.label} defaults to applying the check when classification is ambiguous`, () => {
      expect(step().toLowerCase()).toMatch(/ambiguous/)
    })

    it(`${v.label} demands named evidence and stays reviewer judgment, not a commit-order analyzer`, () => {
      const body = step().toLowerCase()
      expect(body).toMatch(/which test/)
      expect(body).toMatch(/failing[- ]before/)
      expect(body).toMatch(/reviewer judgment/)
      expect(body).toMatch(/commit-order/)
    })

    it(`${v.label} covers the mixed bug-fix + feature PR and the untestable-fix rationale`, () => {
      const body = step().toLowerCase()
      expect(body).toMatch(/mixed/)
      expect(body).toMatch(/rationale/)
    })

    it(`${v.label} raises a Major finding when a bug fix has no reproducing test`, () => {
      const body = step()
      expect(body).toMatch(/Major/)
      expect(body.toLowerCase()).toMatch(/no reproducing test/)
    })

    it(`${v.label} lists the section among the compiled assessments (Step 5.1)`, () => {
      const compile = v.content.slice(v.content.indexOf('### Step 5.1')).split(/\n### Step 5\.2/)[0]
      expect(compile.toLowerCase()).toMatch(/red test before fix/)
      expect(compile).toMatch(/Step 2\.7/)
    })

    it(`${v.label} carries the missing-red-test finding into the decision (Step 5.2)`, () => {
      const decision = v.content
        .slice(v.content.indexOf('### Step 5.2'))
        .split(/\n### Step 5\.3/)[0]
      expect(decision.toLowerCase()).toMatch(/no reproducing test/)
    })

    it(`${v.label} reports the verdict in the review output`, () => {
      expect(v.content.toLowerCase()).toMatch(/red test:/)
    })
  }
})

describe('how-to-11 — the human checklist carries the red-test step', () => {
  for (const [label, content] of [
    ['dataset', HOWTO11_DATASET],
    ['mirror', HOWTO11_MIRROR],
  ] as const) {
    it(`${label} tells the reviewer to verify a reproducing test on a bug fix`, () => {
      expect(content.toLowerCase()).toMatch(/red test/)
      expect(content.toLowerCase()).toMatch(/reproduc/)
    })
  }
})

describe('code-review-template — root/dataset structural parity (#228)', () => {
  const headings = (content: string) => content.match(/^##+ .*$/gm) ?? []
  it('has the same number of section headings in root and dataset', () => {
    expect(headings(TEMPLATE_MIRROR).length).toBe(headings(TEMPLATE_DATASET).length)
  })

  // Count parity proves structure, not content. Content equality is asserted
  // against the TRANSFORM of the dataset, never against the dataset itself (#393):
  // `pair-cli update` rewrites every skill reference in the installed KB
  // (`/assess-cost` -> `/pair-capability-assess-cost`), so the byte-equality
  // this guard originally carried was asserting that no transform exists. It held
  // only because this file was the ONE mirror in the whole KB tree left
  // untransformed — i.e. it froze the defect (an installed template naming
  // commands the reader's assistant does not expose) into an invariant, and turned
  // every `pair-cli update` run into a red test.
  //
  // The protection it was introduced for is preserved in full: a body-only drift
  // in the mirror still fails, it just has to match the TRANSFORMED body. The
  // shared `assertMirrorMatches` (same helper the whole-tree KB mirror guard
  // uses) is what fails, with a message naming what it compares.
  //
  // Called directly rather than wrapped in `expect().not.toThrow()`, so vitest's
  // failure headline IS the guard's message (the wrapper truncates it inside
  // "expected [Function] to not throw an error but '...' was thrown").
  it('equals the TRANSFORM of its dataset source, not the raw dataset (#393)', () => {
    const transform = buildMirrorTransform(DATASET_SKILLS)
    assertMirrorMatches(KB_MIRROR, TEMPLATE_KB_REL, transform(TEMPLATE_DATASET), TEMPLATE_MIRROR)
  })
})
