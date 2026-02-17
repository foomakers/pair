import { describe, it, expect } from 'vitest'
import {
  generateManifestMetadata,
  createOrganizationMetadata,
  type OrganizationMetadata,
} from './metadata'

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

describe('generateManifestMetadata - organization metadata', () => {
  const orgMetadata: OrganizationMetadata = {
    name: 'Acme Corp',
    team: 'Platform',
    department: 'Engineering',
    approver: 'jane.doe',
    compliance: ['SOC2', 'ISO27001'],
    distribution: 'private',
  }

  it('includes organization when provided', () => {
    const result = generateManifestMetadata(['github'], { organization: orgMetadata })

    expect(result.organization).toEqual(orgMetadata)
  })

  it('omits organization when not provided', () => {
    const result = generateManifestMetadata(['github'], { name: 'test' })

    expect(result.organization).toBeUndefined()
  })

  it('omits organization by default', () => {
    const result = generateManifestMetadata(['github'])

    expect(result.organization).toBeUndefined()
  })

  it('includes org with minimal fields', () => {
    const minimalOrg: OrganizationMetadata = {
      name: 'Acme',
      compliance: [],
      distribution: 'open',
    }
    const result = generateManifestMetadata(['github'], { organization: minimalOrg })

    expect(result.organization).toEqual(minimalOrg)
    expect(result.organization?.team).toBeUndefined()
  })
})

describe('createOrganizationMetadata', () => {
  it('provides defaults for compliance and distribution', () => {
    const org = createOrganizationMetadata({ name: 'Acme' })

    expect(org.name).toBe('Acme')
    expect(org.compliance).toEqual([])
    expect(org.distribution).toBe('open')
  })

  it('allows overriding defaults', () => {
    const org = createOrganizationMetadata({
      name: 'Acme',
      compliance: ['SOC2'],
      distribution: 'private',
      team: 'Platform',
    })

    expect(org.compliance).toEqual(['SOC2'])
    expect(org.distribution).toBe('private')
    expect(org.team).toBe('Platform')
  })

  it('does not include optional fields when not provided', () => {
    const org = createOrganizationMetadata({ name: 'Acme' })

    expect(Object.keys(org)).toEqual(['name', 'compliance', 'distribution'])
    expect(org.team).toBeUndefined()
    expect(org.department).toBeUndefined()
    expect(org.approver).toBeUndefined()
  })
})
