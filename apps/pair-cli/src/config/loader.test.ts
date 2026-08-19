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
    expect(skills!.behavior).toBe('overwrite')
    expect(skills!.flatten).toBe(true)
    expect(skills!.prefix).toBe('pair')
    expect(skills!.targets).toHaveLength(6)
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

/**
 * US-396 half B — an external KB declares its registries in its own pair.config.json.
 * `install --source <kb>` used to resolve the CONSUMING project's config only, so the
 * KB's declared namespacing silently did not apply.
 *
 * Precedence: base CLI config < source KB declaration < consuming project override.
 */
describe('config loader - source KB declaration', () => {
  const SOURCE_DECLARATION = JSON.stringify({
    asset_registries: {
      skills: { prefix: 'acme-kb' },
      knowledge: { source: '.pair/knowledge' },
    },
  })

  function fsWith(files: Record<string, string>) {
    return new InMemoryFileSystemService(
      { '/module/config.json': REAL_CONFIG, ...files },
      '/module',
      '/project',
    )
  }

  it('honours the source declaration when the consumer declares nothing', () => {
    const fs = fsWith({ '/kb/pair.config.json': SOURCE_DECLARATION })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(config.asset_registries['skills']!.prefix).toBe('acme-kb')
    // Fields the source does not restate keep the CLI's defaults
    expect(config.asset_registries['skills']!.flatten).toBe(true)
    expect(sourceDeclaration).toEqual({ applied: true, unknownRegistries: [] })
  })

  it("lets the consuming project's own config win over the source declaration", () => {
    const fs = fsWith({
      '/kb/pair.config.json': SOURCE_DECLARATION,
      '/project/pair.config.json': JSON.stringify({
        asset_registries: { skills: { prefix: 'house-rules' } },
      }),
    })

    const { config } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(config.asset_registries['skills']!.prefix).toBe('house-rules')
  })

  it('lets an explicit --config win over the source declaration', () => {
    const fs = fsWith({
      '/kb/pair.config.json': SOURCE_DECLARATION,
      '/custom.json': JSON.stringify({
        asset_registries: { skills: { prefix: 'explicit' } },
      }),
    })

    const { config } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
      customConfigPath: '/custom.json',
    })

    expect(config.asset_registries['skills']!.prefix).toBe('explicit')
  })

  it('falls back to the consumer resolution and warns when the source config is malformed', () => {
    const fs = fsWith({ '/kb/pair.config.json': '{ this is not json' })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    // No half-parsed declaration applied — the CLI default stands
    expect(config.asset_registries['skills']!.prefix).toBe('pair')
    expect(sourceDeclaration!.applied).toBe(false)
    expect(sourceDeclaration!.warning).toMatch(/pair\.config\.json/)
  })

  it('reports a source-declared registry this CLI does not know, instead of installing it', () => {
    const fs = fsWith({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: {
          skills: { prefix: 'acme-kb' },
          telemetry: {
            source: '.telemetry',
            behavior: 'mirror',
            targets: [{ path: '.telemetry', mode: 'canonical' }],
          },
        },
      }),
    })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(config.asset_registries['telemetry']).toBeUndefined()
    expect(config.asset_registries['skills']!.prefix).toBe('acme-kb')
    expect(sourceDeclaration!.unknownRegistries).toEqual(['telemetry'])
  })

  it('adopts a source-declared registry the consuming project also declares', () => {
    const fs = fsWith({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: {
          telemetry: {
            source: '.telemetry',
            behavior: 'mirror',
            targets: [{ path: '.telemetry', mode: 'canonical' }],
          },
        },
      }),
      '/project/pair.config.json': JSON.stringify({
        asset_registries: {
          telemetry: {
            source: '.telemetry',
            behavior: 'mirror',
            targets: [{ path: '.tele', mode: 'canonical' }],
          },
        },
      }),
    })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(config.asset_registries['telemetry']!.targets![0]!.path).toBe('.tele')
    expect(sourceDeclaration!.unknownRegistries).toEqual([])
  })

  it('is inert when no source root is named — the default path is untouched', () => {
    const fs = fsWith({ '/kb/pair.config.json': SOURCE_DECLARATION })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, { projectRoot: '/project' })

    expect(config.asset_registries['skills']!.prefix).toBe('pair')
    expect(sourceDeclaration).toBeUndefined()
  })

  it('does not re-apply the base config.json over the declaration as if it were a project override', () => {
    // Released layout: the project root and the CLI module dir can be the same directory,
    // and `config.json` there IS the base config — re-merging it as an "override" would
    // silently undo every source declaration.
    const fs = new InMemoryFileSystemService(
      { '/module/config.json': REAL_CONFIG, '/module/kb/pair.config.json': SOURCE_DECLARATION },
      '/module',
      '/module',
    )

    const { config } = loadConfigWithOverrides(fs, {
      projectRoot: '/module',
      sourceRoot: '/module/kb',
    })

    expect(config.asset_registries['skills']!.prefix).toBe('acme-kb')
  })

  it('is silent when the named source declares nothing at all', () => {
    const fs = fsWith({})

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(config.asset_registries['skills']!.prefix).toBe('pair')
    expect(sourceDeclaration).toEqual({ applied: false, unknownRegistries: [] })
  })
})
