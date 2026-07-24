import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'

// Story #259 — verify-quality integrated with the tier gate matrix (local = CI).
// The skill must resolve the item/PR classification tags and run locally exactly
// the checks the CI gate would run for that tier — reading TAGS + the KB gate
// matrix only (D18), never classifying itself. These are content invariants on
// the source-of-record SKILL.md (dataset), asserted the same way the rest of the
// KB/skill corpus is tested (see quality-model.test.ts). The executable parity
// (verify-quality resolving suites through the *same* tier-resolve.sh helper CI
// uses) is additionally smoke-tested in scripts/smoke-tests/scenarios/tier-aware-gate.sh
// per the gate-tooling ADL (scripts are smoke-tested, not vitest-unit-tested).

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
