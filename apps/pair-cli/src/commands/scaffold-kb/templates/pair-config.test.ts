import { describe, it, expect } from 'vitest'
import { renderPairConfig } from './pair-config'

const identity = { name: 'acme-kb', slug: 'acme-kb', skillPrefix: 'acme-kb' }

describe('renderPairConfig', () => {
  it('declares only the knowledge and skills registries (a KB is knowledge, not a configured project)', () => {
    const config = JSON.parse(renderPairConfig(identity))

    expect(Object.keys(config.asset_registries)).toEqual(['knowledge', 'skills'])
    expect(config.asset_registries.adoption).toBeUndefined()
  })

  it('points the knowledge registry at the source layout path used by install/package', () => {
    const config = JSON.parse(renderPairConfig(identity))

    expect(config.asset_registries.knowledge.source).toBe('.pair/knowledge')
    expect(config.asset_registries.knowledge.behavior).toBe('mirror')
    expect(config.asset_registries.knowledge.targets).toEqual([
      { path: '.pair/knowledge', mode: 'canonical' },
    ])
  })

  it('namespaces installed skills with the KB slug prefix', () => {
    const config = JSON.parse(renderPairConfig(identity))
    const skills = config.asset_registries.skills

    expect(skills.source).toBe('.skills')
    expect(skills.flatten).toBe(true)
    expect(skills.prefix).toBe('acme-kb')
    expect(skills.targets[0]).toEqual({ path: '.claude/skills/', mode: 'canonical' })
  })

  it('ends with a trailing newline so the file is POSIX-clean', () => {
    expect(renderPairConfig(identity).endsWith('}\n')).toBe(true)
  })
})
