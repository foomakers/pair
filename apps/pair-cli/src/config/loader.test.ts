import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { loadConfigWithOverrides, validateConfig } from './loader'
import { readFileSync } from 'fs'
import { join } from 'path'

const REAL_CONFIG = readFileSync(join(__dirname, '..', '..', 'config.json'), 'utf-8')

describe('config loader - skills registry', () => {
  it('loads skills registry from config.json', () => {
    const fs = new InMemoryFileSystemService(
      { '/module/config.json': REAL_CONFIG },
      '/module',
      '/project',
    )

    const { config } = loadConfigWithOverrides(fs)
    const skills = config.asset_registries['skills']

    expect(skills).toBeDefined()
    expect(skills!.source).toBe('.skills')
    expect(skills!.behavior).toBe('mirror')
    expect(skills!.flatten).toBe(true)
    expect(skills!.prefix).toBe('pair')
    expect(skills!.targets).toHaveLength(5)
    expect(skills!.targets![0]!.mode).toBe('canonical')
  })

  it('validates config with skills registry', () => {
    const config = JSON.parse(REAL_CONFIG)
    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('merges local override for skills targets', () => {
    const localOverride = {
      asset_registries: {
        skills: {
          targets: [
            { path: '.claude/skills/', mode: 'canonical' },
            { path: '.custom/skills/', mode: 'copy' },
          ],
        },
      },
    }

    const fs = new InMemoryFileSystemService(
      {
        '/module/config.json': REAL_CONFIG,
        '/project/pair.config.json': JSON.stringify(localOverride),
      },
      '/module',
      '/project',
    )

    const { config } = loadConfigWithOverrides(fs, { projectRoot: '/project' })
    const skills = config.asset_registries['skills']

    // Local override replaces targets array (shallow merge per registry)
    expect(skills!.targets).toHaveLength(2)
    expect(skills!.targets![1]!.path).toBe('.custom/skills/')
    // Base fields preserved
    expect(skills!.flatten).toBe(true)
    expect(skills!.prefix).toBe('pair')
  })

  it('preserves existing registries alongside skills', () => {
    const fs = new InMemoryFileSystemService(
      { '/module/config.json': REAL_CONFIG },
      '/module',
      '/project',
    )

    const { config } = loadConfigWithOverrides(fs)
    expect(config.asset_registries['github']).toBeDefined()
    expect(config.asset_registries['knowledge']).toBeDefined()
    expect(config.asset_registries['adoption']).toBeDefined()
    expect(config.asset_registries['agents']).toBeDefined()
    expect(config.asset_registries['skills']).toBeDefined()
  })
})
