import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rewriteSkillReferences, rewriteSkillLinkPaths } from '@pair/content-ops'
import { buildDatasetSkillNameMap, buildSkillLinkPathMap } from '../tools/skills-guide-mirror'

const SECRET_SCANNING = readFileSync(
  join(
    __dirname,
    '../../dataset/.pair/knowledge/guidelines/quality-assurance/security/secret-scanning.md',
  ),
  'utf-8',
)
const SECURITY_README = readFileSync(
  join(__dirname, '../../dataset/.pair/knowledge/guidelines/quality-assurance/security/README.md'),
  'utf-8',
)
const GITLEAKS_EXAMPLE = readFileSync(
  join(__dirname, '../../dataset/.pair/knowledge/assets/gitleaks-example.toml'),
  'utf-8',
)

// repo root, for reading the root .pair/knowledge/ mirror (installed copy, not the dataset source)
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

describe('secret-scanning.md — structure', () => {
  it('has the expected title', () => {
    expect(SECRET_SCANNING).toMatch(/^# Secret Scanning — Deterministic CI Layer/m)
  })

  it('states this is CI config, not a skill, with no LLM involved (R6.5, D24)', () => {
    expect(SECRET_SCANNING).toMatch(/not\*\* a skill/)
    expect(SECRET_SCANNING).toContain('no LLM involved')
    expect(SECRET_SCANNING).toContain('R6.5')
    expect(SECRET_SCANNING).toContain('D24')
  })

  it('names gitleaks as the KB default and states adoption can swap it', () => {
    expect(SECRET_SCANNING).toMatch(/\*\*gitleaks\*\* is the KB default/)
    expect(SECRET_SCANNING).toMatch(/Swapping the Scanner/)
  })

  it('provides a CI job template using gitleaks-action', () => {
    expect(SECRET_SCANNING).toContain('gitleaks/gitleaks-action@v2')
    expect(SECRET_SCANNING).toContain('secret-scan:')
  })

  it('documents the org-license requirement for the Action and a license-free binary option', () => {
    // gitleaks-action@v2 fails before scanning on org-owned repos without a license —
    // the template must surface GITLEAKS_LICENSE, and offer the no-license binary form.
    expect(SECRET_SCANNING).toContain('GITLEAKS_LICENSE')
    expect(SECRET_SCANNING).toMatch(/org-owned repos/)
    expect(SECRET_SCANNING).toMatch(/gitleaks detect --source \. --config \.gitleaks\.toml/)
  })

  it('states the fail-closed requirement — scanner unavailable is a failure, not a skip', () => {
    expect(SECRET_SCANNING).toMatch(/Fail-Closed Requirement/)
    expect(SECRET_SCANNING).toMatch(/never silently pass/)
    expect(SECRET_SCANNING).not.toContain('continue-on-error: true')
  })

  it('documents the allowlist mechanism as adoption-controlled, not a per-run flag', () => {
    expect(SECRET_SCANNING).toMatch(/Allowlist Mechanism \(Adoption-Controlled\)/)
    expect(SECRET_SCANNING).toContain('[allowlist]')
    expect(SECRET_SCANNING).toMatch(/never a per-run flag/)
  })

  it('applies at every tier, unlike tier-scoped gates', () => {
    expect(SECRET_SCANNING).toMatch(/applies at \*\*every\*\* tier/)
  })

  it('states it never overlaps with /assess-security (deterministic vs judgment split)', () => {
    expect(SECRET_SCANNING).toMatch(/never scans for secrets/)
    expect(SECRET_SCANNING).toContain('`/assess-security`')
  })

  it('includes a reproducible verification with real exit codes', () => {
    expect(SECRET_SCANNING).toMatch(/gitleaks detect --source/)
    expect(SECRET_SCANNING).toMatch(/leaks found: 1[^\n]*exit: 1/)
    expect(SECRET_SCANNING).toMatch(/no leaks found[^\n]*exit: 0/)
  })

  it('references the gitleaks-example.toml asset', () => {
    expect(SECRET_SCANNING).toContain('gitleaks-example.toml')
  })
})

describe('security/README.md — indexes secret-scanning.md', () => {
  it('lists secret-scanning.md under a deterministic-layer section', () => {
    expect(SECURITY_README).toMatch(/Deterministic CI Layer/)
    expect(SECURITY_README).toMatch(/secret-scanning\.md/)
  })
})

describe('gitleaks-example.toml', () => {
  it('extends the default ruleset and declares an allowlist', () => {
    expect(GITLEAKS_EXAMPLE).toMatch(/useDefault = true/)
    expect(GITLEAKS_EXAMPLE).toMatch(/\[allowlist\]/)
  })
})

/**
 * Root-mirror parity for THIS story's files specifically.
 *
 * Scoped narrowly (not a general dataset<->root parity gate — see PR #341's
 * round-3 review): a root mirror of secret-scanning.md went missing entirely
 * in round 2, and gitleaks-example.toml's root mirror had spurious extra
 * blank lines in round 3. Both slipped through undetected because no
 * automated check compares the root .pair/knowledge/ mirror against the
 * dataset for these files. This locks in exact parity for the files this
 * story actually mirrors, so neither regression class can recur silently.
 *
 * Parity here is `root === realTransform(dataset)`, NOT byte-identity: the
 * `pair-cli update` copy pipeline applies the real content-ops skill transforms
 * (`rewriteSkillReferences` for `/command` tokens, `rewriteSkillLinkPaths`
 * for SKILL.md link paths) to every `.pair/knowledge/` file. secret-scanning.md
 * references `/setup-gates` and `/assess-security`, which are prefixed in the
 * installed root — so its mirror is the transform of the dataset, not a byte
 * copy. The other files carry no skill refs, so their transform is identity.
 */
describe('root .pair/knowledge/ mirror byte parity (this story files)', () => {
  const SKILLS_DIR = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')
  const skillNameMap = buildDatasetSkillNameMap(SKILLS_DIR)
  const linkPathMap = buildSkillLinkPathMap(SKILLS_DIR)
  const realTransform = (content: string): string =>
    rewriteSkillLinkPaths(rewriteSkillReferences(content, skillNameMap), linkPathMap)

  const MIRRORED_FILES = [
    'guidelines/quality-assurance/security/secret-scanning.md',
    'guidelines/quality-assurance/security/README.md',
    'assets/gitleaks-example.toml',
    'guidelines/quality-assurance/quality-model.md',
  ] as const

  it.each(MIRRORED_FILES)(
    '%s root mirror equals the dataset run through the real transform',
    relPath => {
      const datasetContent = readFileSync(
        join(__dirname, '../../dataset/.pair/knowledge', relPath),
        'utf-8',
      )
      const rootContent = readFileSync(join(REPO_ROOT, '.pair/knowledge', relPath), 'utf-8')
      expect(rootContent).toBe(realTransform(datasetContent))
    },
  )
})
