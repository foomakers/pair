import { describe, it, expect } from 'vitest'
import { buildMigrationUrl, migrationsIndexUrl } from './migration-url'

describe('buildMigrationUrl', () => {
  it('builds a docs URL for the version jump', () => {
    expect(buildMigrationUrl('1.1.0', '1.2.0')).toBe(
      'https://pair.foomakers.com/docs/migrations/v1.1.0-to-v1.2.0',
    )
  })

  it('strips a leading v from either version', () => {
    expect(buildMigrationUrl('v1.1.0', 'v1.2.0')).toBe(
      'https://pair.foomakers.com/docs/migrations/v1.1.0-to-v1.2.0',
    )
  })

  it('is nested under the migrations index URL', () => {
    const url = buildMigrationUrl('1.0.0', '2.0.0')
    expect(url.startsWith(migrationsIndexUrl())).toBe(true)
  })
})

describe('migrationsIndexUrl', () => {
  it('returns the docs migrations index', () => {
    expect(migrationsIndexUrl()).toBe('https://pair.foomakers.com/docs/migrations')
  })
})
