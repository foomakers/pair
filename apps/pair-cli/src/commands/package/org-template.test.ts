import { describe, it, expect } from 'vitest'
import { loadOrgTemplate, mergeOrgDefaults } from './org-template'
import { InMemoryFileSystemService } from '@pair/content-ops'

describe('loadOrgTemplate', () => {
  const cwd = '/project'

  it('loads valid template', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/org-template.json`]: JSON.stringify({
          name: 'Acme Corp',
          team: 'Platform',
          distribution: 'private',
        }),
      },
      cwd,
      cwd,
    )

    const result = await loadOrgTemplate(cwd, fs)

    expect(result).toEqual({
      name: 'Acme Corp',
      team: 'Platform',
      distribution: 'private',
    })
  })

  it('returns null when template does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await loadOrgTemplate(cwd, fs)

    expect(result).toBeNull()
  })

  it('throws on malformed JSON', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/org-template.json`]: 'not valid json{',
      },
      cwd,
      cwd,
    )

    await expect(loadOrgTemplate(cwd, fs)).rejects.toThrow(
      /Failed to parse org template at .pair\/org-template.json/,
    )
  })
})

describe('mergeOrgDefaults', () => {
  it('uses CLI flags over template', () => {
    const result = mergeOrgDefaults(
      { orgName: 'CLI Corp', team: 'CLI Team' },
      { name: 'Template Corp', team: 'Template Team', department: 'Eng' },
    )

    expect(result.name).toBe('CLI Corp')
    expect(result.team).toBe('CLI Team')
    expect(result.department).toBe('Eng')
  })

  it('falls back to template when CLI flags absent', () => {
    const result = mergeOrgDefaults(
      {},
      {
        name: 'Template Corp',
        team: 'Platform',
        compliance: ['SOC2'],
        distribution: 'restricted',
      },
    )

    expect(result.name).toBe('Template Corp')
    expect(result.team).toBe('Platform')
    expect(result.compliance).toEqual(['SOC2'])
    expect(result.distribution).toBe('restricted')
  })

  it('uses defaults when both CLI and template absent', () => {
    const result = mergeOrgDefaults({}, null)

    expect(result.name).toBe('')
    expect(result.team).toBeUndefined()
    expect(result.department).toBeUndefined()
    expect(result.approver).toBeUndefined()
    expect(result.compliance).toEqual([])
    expect(result.distribution).toBe('open')
  })

  it('CLI compliance overrides template compliance', () => {
    const result = mergeOrgDefaults({ compliance: ['HIPAA'] }, { compliance: ['SOC2', 'ISO27001'] })

    expect(result.compliance).toEqual(['HIPAA'])
  })

  it('does not include optional fields when not provided', () => {
    const result = mergeOrgDefaults({ orgName: 'Acme' }, null)

    expect(result).toEqual({
      name: 'Acme',
      compliance: [],
      distribution: 'open',
    })
    expect(Object.keys(result)).not.toContain('team')
    expect(Object.keys(result)).not.toContain('department')
    expect(Object.keys(result)).not.toContain('approver')
  })
})
