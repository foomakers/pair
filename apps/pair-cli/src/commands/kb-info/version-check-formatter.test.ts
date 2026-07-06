import { describe, it, expect } from 'vitest'
import { formatVersionCheckHuman, formatVersionCheckJSON } from './version-check-formatter'
import { compareVersions } from './version-check'

describe('formatVersionCheckJSON', () => {
  it('round-trips a drift result as valid JSON with the expected shape', () => {
    const result = compareVersions(
      { version: '1.1.0' },
      { sourceKind: 'registry', version: '1.2.0', available: true, stable: true },
    )

    const parsed = JSON.parse(formatVersionCheckJSON(result))

    expect(parsed).toMatchObject({
      status: 'drift',
      installed: { version: '1.1.0' },
      current: { version: '1.2.0', sourceKind: 'registry', available: true },
      migrationUrl: expect.stringContaining('v1.1.0-to-v1.2.0'),
    })
  })
})

describe('formatVersionCheckHuman', () => {
  it('shows up-to-date status', () => {
    const result = compareVersions(
      { version: '1.2.0' },
      { sourceKind: 'registry', version: '1.2.0', available: true, stable: true },
    )

    const output = formatVersionCheckHuman(result)
    expect(output).toContain('Up to date')
    expect(output).toContain('1.2.0')
  })

  it('shows the migration guide URL for drift', () => {
    const result = compareVersions(
      { version: '1.1.0' },
      { sourceKind: 'registry', version: '1.2.0', available: true, stable: true },
    )

    const output = formatVersionCheckHuman(result)
    expect(output).toContain('Migration guide')
    expect(output).toContain('v1.1.0-to-v1.2.0')
  })

  it('suggests re-install/update for unknown installed version', () => {
    const result = compareVersions(
      { version: null },
      { sourceKind: 'registry', version: '1.2.0', available: true, stable: true },
    )

    const output = formatVersionCheckHuman(result)
    expect(output).toContain('Unknown installed version')
    expect(output.toLowerCase()).toContain('install')
  })

  it('points to the migrations index when current is unavailable', () => {
    const result = compareVersions(
      { version: '1.1.0' },
      { sourceKind: 'remote', version: null, available: false, stable: false, error: 'offline' },
    )

    const output = formatVersionCheckHuman(result)
    expect(output).toContain('Current version unavailable')
    expect(output).toContain('https://pair.foomakers.com/docs/guides/migrations')
  })

  it('labels non-stable current versions', () => {
    const result = compareVersions(
      { version: '1.1.0' },
      { sourceKind: 'registry', version: '1.2.0-beta.1', available: true, stable: false },
    )

    const output = formatVersionCheckHuman(result)
    expect(output).toContain('non-stable')
  })
})
