import { describe, it, expect } from 'vitest'
import { verifyManifest } from './manifest-check'
import type { ManifestMetadata } from '../../package/metadata'

describe('verifyManifest', () => {
  it('returns PASS when all required fields are valid', () => {
    const manifest: ManifestMetadata = {
      name: 'test-package',
      version: '1.0.0',
      created_at: '2025-01-01',
      registries: ['knowledge', 'adoption'],
    }

    const result = verifyManifest(manifest)

    expect(result.status).toBe('PASS')
    expect(result.errors).toEqual([])
  })

  it('returns FAIL when manifest is not an object', () => {
    const result = verifyManifest(null)

    expect(result.status).toBe('FAIL')
    expect(result.errors).toContain('Manifest is not a valid object')
  })

  it('returns FAIL when manifest is undefined', () => {
    const result = verifyManifest(undefined)

    expect(result.status).toBe('FAIL')
    expect(result.errors).toContain('Manifest is not a valid object')
  })

  it('returns FAIL when manifest is a primitive', () => {
    const result = verifyManifest('not an object')

    expect(result.status).toBe('FAIL')
    expect(result.errors).toContain('Manifest is not a valid object')
  })

  it('returns FAIL when name is missing', () => {
    const manifest = {
      version: '1.0.0',
      created_at: '2025-01-01',
      registries: ['knowledge'],
    }

    const result = verifyManifest(manifest)

    expect(result.status).toBe('FAIL')
    expect(result.errors).toContain('Missing or invalid field: name')
  })

  it('returns FAIL when name is not a string', () => {
    const manifest = {
      name: 123,
      version: '1.0.0',
      created_at: '2025-01-01',
      registries: ['knowledge'],
    }

    const result = verifyManifest(manifest)

    expect(result.status).toBe('FAIL')
    expect(result.errors).toContain('Missing or invalid field: name')
  })

  it('returns FAIL when version is missing', () => {
    const manifest = {
      name: 'test',
      created_at: '2025-01-01',
      registries: ['knowledge'],
    }

    const result = verifyManifest(manifest)

    expect(result.status).toBe('FAIL')
    expect(result.errors).toContain('Missing or invalid field: version')
  })

  it('returns FAIL when created_at is missing', () => {
    const manifest = {
      name: 'test',
      version: '1.0.0',
      registries: ['knowledge'],
    }

    const result = verifyManifest(manifest)

    expect(result.status).toBe('FAIL')
    expect(result.errors).toContain('Missing or invalid field: created_at')
  })

  it('returns FAIL when registries is missing', () => {
    const manifest = {
      name: 'test',
      version: '1.0.0',
      created_at: '2025-01-01',
    }

    const result = verifyManifest(manifest)

    expect(result.status).toBe('FAIL')
    expect(result.errors).toContain('Missing or invalid field: registries (must be an array)')
  })

  it('returns FAIL when registries is not an array', () => {
    const manifest = {
      name: 'test',
      version: '1.0.0',
      created_at: '2025-01-01',
      registries: 'not-an-array',
    }

    const result = verifyManifest(manifest)

    expect(result.status).toBe('FAIL')
    expect(result.errors).toContain('Missing or invalid field: registries (must be an array)')
  })

  it('accumulates multiple validation errors', () => {
    const manifest = {
      // missing: name, version, created_at
      registries: 'invalid',
    }

    const result = verifyManifest(manifest)

    expect(result.status).toBe('FAIL')
    expect(result.errors).toHaveLength(4)
    expect(result.errors).toContain('Missing or invalid field: name')
    expect(result.errors).toContain('Missing or invalid field: version')
    expect(result.errors).toContain('Missing or invalid field: created_at')
    expect(result.errors).toContain('Missing or invalid field: registries (must be an array)')
  })

  it('accepts manifest with optional fields', () => {
    const manifest: ManifestMetadata = {
      name: 'test-package',
      version: '1.0.0',
      created_at: '2025-01-01',
      registries: ['knowledge'],
      description: 'Test description',
      author: 'Test Author',
      contentChecksum: 'abc123',
    }

    const result = verifyManifest(manifest)

    expect(result.status).toBe('PASS')
    expect(result.errors).toEqual([])
  })
})
