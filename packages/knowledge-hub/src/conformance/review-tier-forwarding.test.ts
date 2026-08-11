import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Story #382 — /review tells verify-quality WHICH PR to resolve the tier from.
//
// The forwarded thing is a PR IDENTIFIER, never a tier value: the code host's PR
// labels stay the single source of truth (the same source CI gates on), so no
// second source and no widen-only guard of its own is needed. Reusing `$story`
// was the cheap option and is forbidden — the story card carries the REFINEMENT
// tier, and review confirms-or-raises (D17), so a review-raised PR would run a
// NARROWER set than CI: an under-check.
//
// Content invariants on the source-of-record SKILL.md files (dataset), asserted
// the way the rest of the skill corpus is (see verify-quality-gate-matrix.test.ts).
// The generated `.claude/skills/**` mirrors are guarded separately, byte-for-byte,
// by skill-md-mirror.test.ts — not restated here.

const DATASET = join(__dirname, '../../dataset/.skills')
const VQ = readFileSync(join(DATASET, 'capability/verify-quality/SKILL.md'), 'utf-8')
const REVIEW = readFileSync(join(DATASET, 'process/review/SKILL.md'), 'utf-8')

/** The body of a `## `/`### ` section, up to the next heading of the same level. */
const section = (doc: string, heading: string): string => {
  const start = doc.indexOf(heading)
  expect(start, `section not found: ${heading}`).toBeGreaterThan(-1)
  const level = (heading.match(/^#+/) as RegExpMatchArray)[0]
  const rest = doc.slice(start + heading.length)
  const next = rest.search(new RegExp(`^${level} `, 'm'))
  return next === -1 ? rest : rest.slice(0, next)
}

describe('verify-quality — optional $pr argument: which PR the tier is read from (#382)', () => {
  it('AC1 — the Arguments table documents `$pr` as optional', () => {
    const args = section(VQ, '## Arguments')
    expect(args).toMatch(/\|\s*`\$pr`\s*\|\s*No\s*\|/)
  })

  it('AC2 — `$pr` names WHICH PR; the tier is read from that PR labels, never carried as a value', () => {
    expect(VQ).toMatch(/read, never carried|never a tier value|not a tier value/i)
    expect(VQ).toMatch(/`\$pr`[\s\S]{0,400}labels/)
  })

  it('states the resolution precedence explicitly: `$pr` → current-branch PR → `$story` → fail-safe', () => {
    expect(VQ).toMatch(
      /`\$pr`[^\n]*→[^\n]*current-branch PR[^\n]*→[^\n]*`\$story`[^\n]*→[^\n]*fail-safe/i,
    )
  })

  it('AC3 — the standalone on-branch and pre-publish paths are unchanged (no-arg PR read, then the story card)', () => {
    expect(VQ).toContain('gh pr view --json labels')
    expect(VQ).toContain('gh issue view')
    expect(VQ).toMatch(/no `\$pr`|without `\$pr`|`\$pr` (is )?(absent|omitted)/i)
  })

  it('AC4 — a passed PR with no resolvable tag ⇒ fail-safe 🔴, reason distinguishing "reachable, no tag" from "unreadable"', () => {
    expect(VQ).toMatch(/PR[^\n]*reachable[^\n]*no risk:\*/i)
    expect(VQ).toMatch(/PR[^\n]*unreadable/i)
    expect(VQ).toMatch(/fail-safe/)
  })

  it('a passed `$pr` never falls back to the story card — the refinement tier would be an under-check (D17)', () => {
    expect(VQ).toMatch(/`\$pr`[\s\S]{0,300}(never|not)[\s\S]{0,80}story card/i)
    expect(VQ).toMatch(/under-check/i)
    expect(VQ).toMatch(/D17/)
  })

  it('AC5 — the report states the tier SOURCE and the TREE the suites ran against, separately', () => {
    const out = section(VQ, '## Output Format')
    expect(out).toMatch(/Tier source/i)
    expect(out).toMatch(/Tree/i)
    expect(VQ).toMatch(
      /tier[^.\n]*exact[\s\S]{0,200}tree|tree[^\n]*(differs|not)[\s\S]{0,200}(branch|PR)/i,
    )
  })

  it('AC6 — the argument is optional and additive: callers that omit it are unchanged', () => {
    expect(VQ).toMatch(/optional[^\n]*additive|additive[^\n]*optional/i)
  })

  it('the stale boundary note is gone — no "PR number is never needed", no "belongs to /review"', () => {
    expect(VQ).not.toMatch(/PR number is never needed/i)
    expect(VQ).not.toMatch(/belongs to `?\/review`?/i)
    expect(VQ).not.toMatch(/out of scope for this skill/i)
  })
})

describe('review Step 2.1 — forwards the PR under review to verify-quality (#382)', () => {
  const step21 = section(REVIEW, '### Step 2.1: Quality Gates')

  it('AC1 — composes verify-quality with `$scope = all` AND the PR under review', () => {
    expect(step21).toMatch(/\$scope = all/)
    expect(step21).toMatch(/\$pr/)
  })

  it('forwards an identifier, not the tier it resolved in Phase 1 (no second source of truth)', () => {
    expect(step21).toMatch(/(reads|resolves)[^\n]*(labels|PR)|which PR/i)
    expect(step21).not.toMatch(/pass(es|ing)? the (resolved )?tier|forward[^\n]*tier value/i)
  })

  it('documents the post-2.1 raise: the set that ran stays Phase 1 tier, widen-only ⇒ re-run', () => {
    expect(step21).toMatch(/2\.4/)
    expect(step21).toMatch(/re-run/i)
    expect(step21).toMatch(/widen-only|never lower|D17/i)
  })
})
