import { describe, it, expect } from 'vitest'
import { compareVersions } from './version-check'
import type { CurrentVersionResult, InstalledVersionResult } from './version-resolver'

function current(overrides: Partial<CurrentVersionResult> = {}): CurrentVersionResult {
  return {
    sourceKind: 'registry',
    version: '1.2.0',
    available: true,
    stable: true,
    ...overrides,
  }
}

function installed(overrides: Partial<InstalledVersionResult> = {}): InstalledVersionResult {
  return { version: '1.2.0', ...overrides }
}

describe('compareVersions', () => {
  it('reports up-to-date when versions match (match fixture)', () => {
    const result = compareVersions(installed({ version: '1.2.0' }), current({ version: '1.2.0' }))

    expect(result.status).toBe('up-to-date')
    expect(result.migrationUrl).toBeUndefined()
  })

  it('reports drift with a migration URL when versions differ (drift fixture)', () => {
    const result = compareVersions(installed({ version: '1.1.0' }), current({ version: '1.2.0' }))

    expect(result.status).toBe('drift')
    expect(result.migrationUrl).toBe(
      'https://pair.foomakers.com/docs/migrations/v1.1.0-to-v1.2.0',
    )
  })

  it('reports drift WITHOUT a migration URL on downgrade (installed newer than current)', () => {
    const result = compareVersions(installed({ version: '1.3.0' }), current({ version: '1.2.0' }))

    expect(result.status).toBe('drift')
    // A downgrade has no v{newer}-to-v{older} migration page.
    expect(result.migrationUrl).toBeUndefined()
  })

  it('reports drift WITHOUT a migration URL when a pre-release is involved', () => {
    const result = compareVersions(
      installed({ version: '1.2.0' }),
      current({ version: '1.3.0-beta.1', stable: false }),
    )

    expect(result.status).toBe('drift')
    // Pre-release ordering is not defined for migration pages.
    expect(result.migrationUrl).toBeUndefined()
  })

  it('reports unknown-installed when no installed version is recorded (legacy fixture)', () => {
    const result = compareVersions(installed({ version: null }), current({ version: '1.2.0' }))

    expect(result.status).toBe('unknown-installed')
    expect(result.migrationUrl).toBeUndefined()
  })

  it('reports current-unavailable when current cannot be resolved (offline fixture)', () => {
    const result = compareVersions(
      installed({ version: '1.1.0' }),
      current({ version: null, available: false, error: 'network unreachable' }),
    )

    expect(result.status).toBe('current-unavailable')
    expect(result.migrationUrl).toBeUndefined()
  })

  it('reports unknown-installed even when current is also unavailable', () => {
    const result = compareVersions(
      installed({ version: null }),
      current({ version: null, available: false }),
    )

    expect(result.status).toBe('unknown-installed')
  })

  it('treats pre-release versions as drift when they differ verbatim (non-stable label)', () => {
    const result = compareVersions(
      installed({ version: '1.2.0' }),
      current({ version: '1.3.0-beta.1', stable: false }),
    )

    expect(result.status).toBe('drift')
    expect(result.current.stable).toBe(false)
  })
})
