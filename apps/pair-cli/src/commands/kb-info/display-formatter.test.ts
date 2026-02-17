import { describe, it, expect } from 'vitest'
import { formatHumanReadable, formatJSON } from './display-formatter'
import type { ManifestMetadata } from '../package/metadata'

const baseManifest: ManifestMetadata = {
  name: 'test-kb',
  version: '1.0.0',
  description: 'Test KB package',
  author: 'Test Author',
  tags: ['ai', 'devops'],
  license: 'MIT',
  created_at: '2026-01-01T00:00:00.000Z',
  registries: ['knowledge', 'adoption'],
}

describe('formatHumanReadable', () => {
  it('displays standard metadata fields', () => {
    const output = formatHumanReadable(baseManifest)

    expect(output).toContain('Package Information')
    expect(output).toContain('Name:         test-kb')
    expect(output).toContain('Version:      1.0.0')
    expect(output).toContain('Description:  Test KB package')
    expect(output).toContain('Author:       Test Author')
    expect(output).toContain('License:      MIT')
    expect(output).toContain('Tags:         ai, devops')
    expect(output).toContain('Registries:   knowledge, adoption')
  })

  it('shows (none) for empty tags', () => {
    const manifest = { ...baseManifest, tags: [] }
    const output = formatHumanReadable(manifest)

    expect(output).toContain('Tags:         (none)')
  })

  it('shows checksum when present', () => {
    const manifest = { ...baseManifest, contentChecksum: 'abc123' }
    const output = formatHumanReadable(manifest)

    expect(output).toContain('Checksum:     abc123')
  })

  it('does not show Organization section when absent', () => {
    const output = formatHumanReadable(baseManifest)

    expect(output).not.toContain('Organization')
  })

  it('shows Organization section when present', () => {
    const manifest: ManifestMetadata = {
      ...baseManifest,
      organization: {
        name: 'Acme Corp',
        team: 'Platform',
        department: 'Engineering',
        approver: 'jane.doe',
        compliance: ['SOC2', 'ISO27001'],
        distribution: 'private',
      },
    }
    const output = formatHumanReadable(manifest)

    expect(output).toContain('Organization')
    expect(output).toContain('Name:           Acme Corp')
    expect(output).toContain('Team:           Platform')
    expect(output).toContain('Department:     Engineering')
    expect(output).toContain('Approver:       jane.doe')
    expect(output).toContain('Compliance:     SOC2, ISO27001')
    expect(output).toContain('Distribution:   private')
  })

  it('shows minimal org section without optional fields', () => {
    const manifest: ManifestMetadata = {
      ...baseManifest,
      organization: {
        name: 'Acme',
        compliance: [],
        distribution: 'open',
      },
    }
    const output = formatHumanReadable(manifest)

    expect(output).toContain('Organization')
    expect(output).toContain('Name:           Acme')
    expect(output).not.toContain('Team:')
    expect(output).not.toContain('Department:')
    expect(output).not.toContain('Approver:')
    expect(output).toContain('Compliance:     (none)')
    expect(output).toContain('Distribution:   open')
  })
})

describe('formatJSON', () => {
  it('outputs valid JSON', () => {
    const output = formatJSON(baseManifest)
    const parsed = JSON.parse(output)

    expect(parsed.name).toBe('test-kb')
    expect(parsed.version).toBe('1.0.0')
  })

  it('includes organization in JSON when present', () => {
    const manifest: ManifestMetadata = {
      ...baseManifest,
      organization: {
        name: 'Acme',
        compliance: ['SOC2'],
        distribution: 'restricted',
      },
    }
    const output = formatJSON(manifest)
    const parsed = JSON.parse(output)

    expect(parsed.organization.name).toBe('Acme')
    expect(parsed.organization.distribution).toBe('restricted')
  })
})
