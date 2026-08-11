import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'

// Conformance home for dataset/.skills/capability/verify-quality/SKILL.md.
//
// One file per TARGET artifact, not per introducing story (ADL 2026-07-18); each
// story extends this file with its own `describe`. Caller-side assertions about a
// skill that COMPOSES verify-quality live here too, next to the contract they
// depend on — the corpus precedent is classify.test.ts / assess-security.test.ts,
// which hold their own "/review composes X" describes rather than a second file.
//
// Story #259 — verify-quality integrated with the tier gate matrix (local = CI).
// The skill must resolve the item/PR classification tags and run locally exactly
// the checks the CI gate would run for that tier — reading TAGS + the KB gate
// matrix only (D18), never classifying itself. These are content invariants on
// the source-of-record SKILL.md (dataset), asserted the same way the rest of the
// KB/skill corpus is tested (see quality-model.test.ts). The parity claim is
// verified transitively, in two layers, by scripts/smoke-tests/scenarios/tier-aware-gate.sh
// per the gate-tooling ADL (scripts are smoke-tested, not vitest-unit-tested):
// (a) the smoke test asserts this SKILL.md *references* the shared tier-resolve.sh
//     helper (resolve_tier / required_suites_for_tier / require_suite) — i.e. it
//     composes the same resolver CI uses rather than re-implementing a matrix; and
// (b) that helper's own tier/suite resolution is behaviorally *executed* there (the
//     pre-existing #258 block). The skill is prose, so its resolution is not itself
//     executed here — parity rests on it composing the behaviorally-tested helper.

const SKILL_PATH = join(__dirname, '../../dataset/.skills/capability/verify-quality/SKILL.md')
const SKILL = readFileSync(SKILL_PATH, 'utf-8')

const RESOLVER = readFileSync(
  join(__dirname, '../../dataset/.pair/knowledge/assets/tier-resolve.sh'),
  'utf-8',
)

describe('verify-quality SKILL.md — tier gate matrix integration (#259)', () => {
  it('frames itself as mirroring the CI gate for the resolved tier (local = CI)', () => {
    expect(SKILL).toMatch(/gate matrix/i)
    expect(SKILL).toMatch(/local[^\n]*\bCI\b|mirror[^\n]*\bCI\b|\bCI\b[^\n]*parity/i)
  })

  it('AC1 — 🟢 green runs base only (install + lint + type + build), same set CI would run', () => {
    expect(SKILL).toMatch(/risk:green/)
    // base spelled out as the green check set
    expect(SKILL).toMatch(/install[^\n]*lint[^\n]*type[^\n]*build/i)
  })

  it('AC2 — the check set widens per tier: +unit from 🟡, +integration/E2E on 🔴', () => {
    expect(SKILL).toMatch(/risk:yellow/)
    expect(SKILL).toMatch(/risk:red/)
    expect(SKILL).toMatch(/\bunit\b/)
    expect(SKILL).toMatch(/integration/i)
    expect(SKILL).toMatch(/e2e/i)
  })

  it('AC3 — fail-safe: no resolvable tags ⇒ full 🔴 set, stated explicitly in the report', () => {
    expect(SKILL).toMatch(/fail-safe/i)
    expect(SKILL).toMatch(/red/i)
    // explicit report line, not a silent widening
    expect(SKILL).toMatch(/no[^\n]*tag[\s\S]{0,120}(red|full)/i)
  })

  it('AC4 — any failing check ⇒ red verdict with the failing command output surfaced', () => {
    expect(SKILL).toMatch(/failing command output|surface[^\n]*output|command output/i)
    // Pin the behavioral linkage (failing check ⇒ red verdict ⇒ output surfaced):
    // the red-verdict wording must co-occur with the failing-output phrase, so a
    // future edit can't drop the "red verdict" half and still pass.
    expect(SKILL).toMatch(
      /red verdict[\s\S]{0,120}(failing command output|command output)|(failing command output|command output)[\s\S]{0,120}red verdict/i,
    )
  })

  it('reads the risk:* tag from the PR, and pre-publish from the story card (never classifies)', () => {
    expect(SKILL).toMatch(/gh pr view/)
    expect(SKILL).toMatch(/story card|from the story/i)
  })

  it('contains NO classification criteria — reads tags + the KB matrix only (D18)', () => {
    expect(SKILL).toMatch(/no classification criteria|contains no[^\n]*criteria/i)
    expect(SKILL).toMatch(/D18/)
  })

  it('delegates tier + suite resolution to the shipped tier-resolve.sh helper (single source, not re-implemented)', () => {
    expect(SKILL).toContain('tier-resolve.sh')
    expect(SKILL).toContain('resolve_tier')
    expect(SKILL).toContain('required_suites_for_tier')
    expect(SKILL).toContain('require_suite')
  })

  it('preserves the opt-in tiering flag: tiering disabled ⇒ full suite (CI parity, current behavior)', () => {
    expect(SKILL).toContain('Pre-merge tiering')
    expect(SKILL).toMatch(/disabled[\s\S]{0,160}full suite|full suite[\s\S]{0,160}disabled/i)
  })

  it('a suite required by the tier but absent locally ⇒ explicit "suite missing — CI will fail", never a silent pass', () => {
    expect(SKILL).toMatch(/suite missing|missing suite/i)
    expect(SKILL).toMatch(/CI will fail/i)
    expect(SKILL).toMatch(/not[^\n]*silent|never[^\n]*silent/i)
  })

  it('matrix/KB not found ⇒ falls back to all adopted gates with a notice', () => {
    expect(SKILL).toMatch(/fall[- ]?back[\s\S]{0,160}(all[^\n]*gates|adopted gates)/i)
    expect(SKILL).toMatch(/notice/i)
  })

  it('preserves idempotency (already-passing gates skipped) and adoption command overrides', () => {
    expect(SKILL).toMatch(/already[- ]passing|not already passing|skip/i)
    expect(SKILL).toMatch(/way-of-working/)
  })

  it('links to the matrix single source (quality-model §4) and the delivery wiring (tier-aware-pipeline)', () => {
    const dir = dirname(SKILL_PATH)
    const targets = ['quality-model.md', 'tier-aware-pipeline.md', 'tier-resolve.sh']
    for (const t of targets) {
      const m = SKILL.match(new RegExp(`\\]\\(([^)]*${t.replace('.', '\\.')})\\)`))
      expect(m, `SKILL.md must link to ${t}`).not.toBeNull()
      const linkPath = (m as RegExpMatchArray)[1] as string
      expect(
        existsSync(resolve(dir, linkPath.split('#')[0] as string)),
        `link to ${t} must resolve`,
      ).toBe(true)
    }
  })
})

describe('verify-quality — matrix parity with tier-resolve.sh (the executable source)', () => {
  // The skill must not restate an independent matrix. The per-tier suite keys the
  // helper exposes are the single source; the skill documents the increments and
  // defers the mapping to required_suites_for_tier. Parity guard: the suite keys
  // named in the helper are exactly the ones the skill's tier prose references.
  const helperKeys = ['install', 'lint', 'type', 'build', 'unit', 'integration', 'e2e']

  it('the helper exposes the four required-suite entry points the skill composes', () => {
    for (const fn of ['resolve_tier', 'required_suites_for_tier', 'require_suite']) {
      expect(RESOLVER).toContain(fn)
    }
  })

  it('every suite key in the helper matrix is referenced by the skill (no drift)', () => {
    for (const key of helperKeys) {
      expect(SKILL.toLowerCase()).toContain(key)
    }
  })
})

// --- Story #382 — /review tells verify-quality WHICH PR to resolve the tier from. ---
//
// The forwarded thing is a PR IDENTIFIER, never a tier value: the code host's PR
// labels stay the single source of truth (the same source CI gates on), so no
// second source and no widen-only guard of its own is needed. Reusing `$story`
// was the cheap option and is forbidden — the story card carries the REFINEMENT
// tier, and review confirms-or-raises (D17), so a review-raised PR would run a
// NARROWER set than CI: an under-check.
//
// The caller-side block below reads process/review/SKILL.md because the invariant
// IS the composition contract of this skill (see the file header).

const REVIEW = readFileSync(
  join(__dirname, '../../dataset/.skills/process/review/SKILL.md'),
  'utf-8',
)

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
    const args = section(SKILL, '## Arguments')
    expect(args).toMatch(/\|\s*`\$pr`\s*\|\s*No\s*\|/)
  })

  it('AC2 — `$pr` names WHICH PR; the tier is read from that PR labels, never carried as a value', () => {
    expect(SKILL).toMatch(/read, never carried|never a tier value|not a tier value/i)
    expect(SKILL).toMatch(/`\$pr`[\s\S]{0,400}labels/)
  })

  it('states the resolution precedence explicitly: `$pr` → current-branch PR → `$story` → fail-safe', () => {
    expect(SKILL).toMatch(
      /`\$pr`[^\n]*→[^\n]*current-branch PR[^\n]*→[^\n]*`\$story`[^\n]*→[^\n]*fail-safe/i,
    )
  })

  it('AC3 — the standalone on-branch and pre-publish paths are unchanged (no-arg PR read, then the story card)', () => {
    expect(SKILL).toContain('gh pr view --json labels')
    expect(SKILL).toContain('gh issue view')
    expect(SKILL).toMatch(/no `\$pr`|without `\$pr`|`\$pr` (is )?(absent|omitted)/i)
  })

  it('AC4 — a passed PR with no resolvable tag ⇒ fail-safe 🔴, reason distinguishing "reachable, no tag" from "unreadable"', () => {
    expect(SKILL).toMatch(/PR[^\n]*reachable[^\n]*no risk:\*/i)
    expect(SKILL).toMatch(/PR[^\n]*unreadable/i)
    expect(SKILL).toMatch(/fail-safe/)
  })

  it('AC4 — "no tag" is decided by TAG PRESENCE, not by empty labels (a PR labelled pr-state:* still reports its own reason)', () => {
    // An `[ -z "$LABELS" ]` test only fires on a PR with NO labels at all, so the common
    // shape (pr-state:*/cost:*/type labels, no risk:*) would silently emit the generic
    // fail-safe line the skill forbids. The guard is a risk:*-prefix test.
    expect(SKILL).toMatch(/grep -q '\^risk:'/)
    expect(SKILL).toMatch(/has_risk_tag/)
    expect(SKILL).not.toMatch(/elif \[ -z "\$LABELS" \]/)
    // and the same rule on the story-card branch — one spelling of the rule, not two
    expect(SKILL).toMatch(
      /has_risk_tag[\s\S]{0,600}story card reachable but carries no risk:\* tag/,
    )
  })

  it('a passed `$pr` never falls back to the story card — the refinement tier would be an under-check (D17)', () => {
    expect(SKILL).toMatch(/`\$pr`[\s\S]{0,300}(never|not|NO)[\s\S]{0,80}story.card/i)
    expect(SKILL).toMatch(/under-check/i)
    expect(SKILL).toMatch(/D17/)
  })

  it('AC5 — the report states the tier SOURCE and the TREE the suites ran against, separately', () => {
    const out = section(SKILL, '## Output Format')
    expect(out).toMatch(/Tier source/i)
    expect(out).toMatch(/Tree/i)
    expect(SKILL).toMatch(
      /tier[^.\n]*exact[\s\S]{0,200}tree|tree[^\n]*(differs|not)[\s\S]{0,200}(branch|PR)/i,
    )
  })

  it('AC5 — the `Tree:` row is PRODUCED by Step 1.5, and detached checkouts compare COMMITS not branch names', () => {
    // Without this the ⚠️ arm is not deterministically reachable: a review worktree is
    // usually DETACHED, where `git rev-parse --abbrev-ref HEAD` echoes "HEAD" and a naive
    // name comparison mislabels a correct PR-head checkout as a mismatch.
    expect(SKILL).toMatch(/headRefName/)
    expect(SKILL).toMatch(/headRefOid/)
    expect(SKILL).toMatch(/git rev-parse --abbrev-ref HEAD/)
    expect(SKILL).toMatch(/TREE_MATCH/)
    expect(SKILL).toMatch(/detached/i)
  })

  it('AC5 — report rows are column-aligned: every value bracket sits at the same offset', () => {
    const out = section(SKILL, '## Output Format')
    const offsets = out
      .split('\n')
      .filter(l => /^[├└]── /.test(l))
      .map(l => l.indexOf('['))
    expect(offsets.length).toBeGreaterThan(5)
    expect(new Set(offsets).size, `misaligned report rows: ${offsets.join(',')}`).toBe(1)
  })

  it('AC6 — the argument is optional and additive: callers that omit it are unchanged', () => {
    expect(SKILL).toMatch(/optional[^\n]*additive|additive[^\n]*optional/i)
  })

  it('the stale boundary note is gone — no "PR number is never needed", no "belongs to /review"', () => {
    expect(SKILL).not.toMatch(/PR number is never needed/i)
    expect(SKILL).not.toMatch(/belongs to `?\/review`?/i)
    expect(SKILL).not.toMatch(/out of scope for this skill/i)
  })

  it('ships no story-local (ACn) markers — the corpus installs into downstream projects with no referent', () => {
    expect(SKILL).not.toMatch(/\(AC\d\)/)
  })
})

describe('review Step 2.1 — forwards the PR under review to verify-quality (#382)', () => {
  const step21 = section(REVIEW, '### Step 2.1: Quality Gates')

  it('AC1 — composes verify-quality with `$scope = all` AND the PR under review', () => {
    expect(step21).toMatch(/\$scope = all/)
    expect(step21).toMatch(/\$pr/)
  })

  it('forwards an identifier, not the tier it resolved in Phase 1 (no second source of truth)', () => {
    // Positive form first: `$pr` is named as WHICH PR, and the tier is read from labels.
    expect(step21).toMatch(/which PR/i)
    expect(step21).toMatch(/identifier/i)
    expect(step21).toMatch(/reads[^\n]*labels|labels[^\n]*read/i)
    // Negative, narrowed to the stale phrasing actually banned: an AFFIRMATIVE instruction
    // to hand the tier VALUE over. A correct sentence ("Forward the identifier, never the
    // resolved tier") must stay green, so a negated occurrence is not an offender.
    const handsOverTier =
      /\b(?:pass|passes|passing|forward|forwards|forwarding)\b[^.\n]{0,40}\btier\b/i
    const negated = /\b(?:never|not|no|rather than|instead of)\b/i
    const offenders = step21
      .split(/(?<=\.)\s+/)
      .filter(s => handsOverTier.test(s) && !negated.test(s))
    expect(
      offenders,
      `Step 2.1 must not instruct passing the tier value: ${offenders.join(' | ')}`,
    ).toEqual([])
  })

  it('a tree-mismatched local run is ADVISORY — CI on the PR head is authoritative for the state synthesis', () => {
    expect(step21).toMatch(/advisory/i)
    expect(step21).toMatch(/resolve_pr_state|5\.4/)
    expect(step21).toMatch(/head commit|PR head/i)
  })

  it('the tag read is qualified by the Tag Projection declaration, not promised unconditionally', () => {
    expect(step21).toMatch(/Tag Projection/)
  })

  it('documents the post-2.1 raise: the set that ran stays Phase 1 tier, widen-only ⇒ re-run', () => {
    expect(step21).toMatch(/2\.4/)
    expect(step21).toMatch(/re-run/i)
    expect(step21).toMatch(/widen-only|never lower|D17/i)
  })
})
