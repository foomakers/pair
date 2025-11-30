import { describe, it, expect } from 'vitest'
import { generateManifestMetadata } from './metadata'

describe('generateManifestMetadata - defaults', () => {
  it('generates metadata with default values', () => {
    const registries = ['github', 'knowledge', 'adoption']
    const result = generateManifestMetadata(registries)

    expect(result.name).toBe('kb-package')
    expect(result.version).toBe('1.0.0')
    expect(result.description).toBe('Knowledge base package')
    expect(result.author).toBe('unknown')
    expect(result.registries).toEqual(registries)
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('generates unique timestamps for different calls', async () => {
    const result1 = generateManifestMetadata([])
    await new Promise(resolve => setTimeout(resolve, 10))
    const result2 = generateManifestMetadata([])

    expect(result1.created_at).not.toBe(result2.created_at)
  })
})

describe('generateManifestMetadata - CLI params override', () => {
  it('overrides name from CLI params', () => {
    const result = generateManifestMetadata(['github'], { name: 'custom-kb' })

    expect(result.name).toBe('custom-kb')
    expect(result.version).toBe('1.0.0')
  })

  it('overrides version from CLI params', () => {
    const result = generateManifestMetadata(['github'], { version: '3.0.0' })

    expect(result.version).toBe('3.0.0')
    expect(result.name).toBe('kb-package')
  })

  it('overrides description from CLI params', () => {
    const result = generateManifestMetadata(['adoption'], { description: 'Custom description' })

    expect(result.description).toBe('Custom description')
  })

  it('overrides author from CLI params', () => {
    const result = generateManifestMetadata(['knowledge'], { author: 'Team A' })

    expect(result.author).toBe('Team A')
  })

  it('overrides multiple fields from CLI params', () => {
    const result = generateManifestMetadata(['github'], {
      name: 'my-kb',
      version: '2.0.0',
      description: 'Multi override',
      author: 'Dev Team',
    })

    expect(result.name).toBe('my-kb')
    expect(result.version).toBe('2.0.0')
    expect(result.description).toBe('Multi override')
    expect(result.author).toBe('Dev Team')
  })
})

describe('generateManifestMetadata - registries handling', () => {
  it('includes registries in manifest', () => {
    const registries = ['github', 'knowledge', 'adoption']
    const result = generateManifestMetadata(registries, { name: 'test' })

    expect(result.registries).toEqual(registries)
  })

  it('handles empty registries array', () => {
    const result = generateManifestMetadata([])

    expect(result.registries).toEqual([])
  })

  it('always uses ISO 8601 timestamp format', () => {
    const result = generateManifestMetadata(['github'])

    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
