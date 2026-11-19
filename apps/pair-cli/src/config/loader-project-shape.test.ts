import { describe, it, expect, afterEach } from 'vitest'
import { InMemoryFileSystemService, fileSystemService } from '@pair/content-ops'
import { loadConfigWithOverrides } from './loader'
import { join } from 'path'

const REAL_CONFIG = fileSystemService.readFileSync(join(__dirname, '../../config.json'))

const load = (project: string, projectConfigOnly = true) =>
  loadConfigWithOverrides(
    new InMemoryFileSystemService(
      { '/opt/pair-cli/config.json': REAL_CONFIG, '/consumer/pair.config.json': project },
      '/opt/pair-cli',
      '/consumer',
    ),
    { projectRoot: '/consumer', projectConfigOnly },
  )

describe('US-552 r0-1 project pair.config.json must be an object', () => {
  it.each(['[1]', '"x"', '1'])('witness: %s throws naming the file', raw => {
    expect(() => load(raw)).toThrow(/\/consumer\/pair\.config\.json/)
  })

  it('control: null already throws', () => {
    expect(() => load('null')).toThrow(/\/consumer\/pair\.config\.json/)
  })

  it('control: an object config loads', () => {
    expect(load('{"skipRegistries":["agents"]}').skipRegistries).toEqual(['agents'])
  })

  it('control: non-object tolerated when not projectConfigOnly', () => {
    expect(() => load('[1]', false)).not.toThrow()
  })
})

describe('#568 B5 the error prefix is printed once', () => {
  const platform = process.platform
  afterEach(() => Object.defineProperty(process, 'platform', { value: platform }))

  it.each(['darwin', 'linux'])('platform %s: no "Error:" inside the message', os => {
    Object.defineProperty(process, 'platform', { value: os })
    for (const raw of ['[1]', '{"skipRegistries":3}', '{bad'])
      expect(() => load(raw)).toThrow(/Failed to load \/consumer\/pair\.config\.json: (?!Error)/)
  })
})

// #617 AC-16 compatibility: installing runtime defaults must not shadow an existing KB declaration.
describe('#617 runtime defaults with legacy registry configuration', () => {
  const registry = (source: string) => ({
    source,
    behavior: 'mirror',
    description: 'Knowledge',
    targets: [{ path: 'knowledge', mode: 'canonical' }],
  })
  const runtime = {
    workflowProfiles: { default: { codex: 'codex-medium', claude: 'claude-medium' } },
  }
  const legacy = { asset_registries: { knowledge: registry('legacy-knowledge') } }
  const fsFor = (pair: unknown, includeLegacy = true) =>
    new InMemoryFileSystemService(
      {
        '/project/pair.config.json': JSON.stringify(pair),
        ...(includeLegacy && { '/project/config.json': JSON.stringify(legacy) }),
        '/project/legacy-knowledge/guide.md': '# Legacy knowledge',
        '/project/explicit.json': JSON.stringify({
          asset_registries: { knowledge: registry('explicit-knowledge') },
          workflowProfiles: { default: 'explicit' },
        }),
      },
      '/module',
      '/project',
    )

  it('retains legacy registries and runtime keys when pair.config.json declares runtime fields only', () => {
    const { config } = loadConfigWithOverrides(fsFor(runtime), {
      projectRoot: '/project',
      skipBaseConfig: true,
    })
    expect(config.asset_registries['knowledge']?.source).toBe('legacy-knowledge')
    expect(config['workflowProfiles']).toEqual(runtime.workflowProfiles)
  })

  it('does not invent registries when no legacy declaration exists', () => {
    const { config } = loadConfigWithOverrides(fsFor(runtime, false), {
      projectRoot: '/project',
      skipBaseConfig: true,
    })
    expect(config.asset_registries).toEqual({})
    expect(config['workflowProfiles']).toEqual(runtime.workflowProfiles)
  })

  it('keeps projectConfigOnly isolated from the unrelated config.json', () => {
    const { config } = loadConfigWithOverrides(fsFor(runtime), {
      projectRoot: '/project',
      skipBaseConfig: true,
      projectConfigOnly: true,
    })
    expect(config.asset_registries).toEqual({})
    expect(config['workflowProfiles']).toEqual(runtime.workflowProfiles)
  })

  it('an explicit pair registry declaration takes precedence over the legacy file', () => {
    const { config } = loadConfigWithOverrides(
      fsFor({ ...runtime, asset_registries: { knowledge: registry('pair-knowledge') } }),
      { projectRoot: '/project', skipBaseConfig: true },
    )
    expect(config.asset_registries['knowledge']?.source).toBe('pair-knowledge')
  })

  it.each([{}, 'malformed'])(
    'declared pair registries %j never fall back to a valid legacy declaration',
    async asset_registries => {
      const fs = fsFor({ ...runtime, asset_registries })
      const { config } = loadConfigWithOverrides(fs, {
        projectRoot: '/project',
        skipBaseConfig: true,
      })
      expect(config.asset_registries['knowledge']).toBeUndefined()
      const { validatePackageStructure } = await import('../commands/package/validators.js')
      const result = await validatePackageStructure(config, '/project', fs, 'source')
      expect(result.valid).toBe(false)
      expect(result.errors.join(' ')).toMatch(/registr/i)
    },
  )

  it('explicit --config remains the last registry and runtime override', () => {
    const { config } = loadConfigWithOverrides(fsFor(runtime), {
      projectRoot: '/project',
      skipBaseConfig: true,
      customConfigPath: '/project/explicit.json',
    })
    expect(config.asset_registries['knowledge']?.source).toBe('explicit-knowledge')
    expect(config['workflowProfiles']).toEqual({ default: 'explicit' })
  })
})
