import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

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
