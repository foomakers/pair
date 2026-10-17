import { describe, expect, test, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleInstallCommand } from './install/handler'
import { handleUpdateCommand } from './update/handler'
import { parseUpdateCommand } from './update/parser'

const registryConfig = {
  asset_registries: {
    agents: {
      source: 'AGENTS.md',
      behavior: 'mirror',
      description: 'agents',
      targets: [
        { path: 'AGENTS.md', mode: 'canonical' },
        { path: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
      ],
    },
    adoption: {
      source: 'adoption',
      behavior: 'add',
      description: 'adoption',
      targets: [{ path: '.pair/adoption', mode: 'canonical' }],
    },
  },
}

describe.each(['darwin', 'linux'] as const)('US-552 keep choice persisted (%s)', platform => {
  const cwd = '/test-project'
  const makeFs = (own: Record<string, string> = {}) =>
    new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(registryConfig),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test-pkg', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${cwd}/packages/knowledge-hub/dataset/AGENTS.md`]: '# pair agents',
        [`${cwd}/packages/knowledge-hub/dataset/adoption/a.md`]: 'adopt v2',
        ...Object.fromEntries(Object.entries(own).map(([k, v]) => [`${cwd}/${k}`, v])),
      },
      cwd,
      cwd,
    )
  const onPlatform = async <T>(fn: () => Promise<T>): Promise<T> => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: platform })
    try {
      return await fn()
    } finally {
      Object.defineProperty(process, 'platform', { value: orig })
    }
  }
  const base = { kb: true, offline: false } as const
  const install = (fs: InMemoryFileSystemService, skipRegistries?: string[]) =>
    onPlatform(() =>
      handleInstallCommand(
        { command: 'install', resolution: 'default', ...base, ...(skipRegistries && { skipRegistries }) },
        fs,
      ),
    )
  const update = (fs: InMemoryFileSystemService, skipRegistries?: string[]) =>
    onPlatform(() =>
      handleUpdateCommand(
        { command: 'update', resolution: 'default', ...base, ...(skipRegistries && { skipRegistries }) },
        fs,
      ),
    )
  const readConfig = (fs: InMemoryFileSystemService) =>
    JSON.parse(fs.readFileSync(`${cwd}/pair.config.json`)) as Record<string, unknown>
  const own = { 'AGENTS.md': 'mine', 'CLAUDE.md': 'mine2' }

  test('AC2 install --skip-registries creates pair.config.json', async () => {
    const fs = makeFs(own)
    expect(await install(fs, ['agents'])).toBe(0)
    expect(readConfig(fs)).toEqual({ skipRegistries: ['agents'] })
  })

  test('AC2 merges into an existing config: union, other keys and order kept', async () => {
    const fs = makeFs({
      ...own,
      'pair.config.json': JSON.stringify({ zeta: 1, skipRegistries: ['other'], alpha: 2 }),
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await install(fs, ['agents'])
    const cfg = readConfig(fs)
    expect(cfg).toEqual({ zeta: 1, skipRegistries: ['other', 'agents'], alpha: 2 })
    expect(Object.keys(cfg)).toEqual(['zeta', 'skipRegistries', 'alpha'])
    expect(fs.readFileSync(`${cwd}/pair.config.json`).endsWith('}\n')).toBe(true)
  })

  test('AC3 plain update after keep: exit 0, own files untouched, skip reported', async () => {
    const fs = makeFs(own)
    await install(fs, ['agents'])
    const lines: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...a) => void lines.push(a.join(' ')))
    expect(await update(fs)).toBe(0)
    spy.mockRestore()
    expect(fs.readFileSync(`${cwd}/AGENTS.md`)).toBe('mine')
    expect(fs.readFileSync(`${cwd}/CLAUDE.md`)).toBe('mine2')
    expect(fs.readFileSync(`${cwd}/.pair/adoption/a.md`)).toBe('adopt v2')
    expect(lines.join('\n')).toContain('skipping agents (from pair.config.json)')
  })

  test('AC4 update --skip-registries skips and persists; unknown flag name throws', async () => {
    const fs = makeFs({ ...own, '.pair/adoption/a.md': 'old' })
    expect(await update(fs, ['agents'])).toBe(0)
    expect(fs.readFileSync(`${cwd}/AGENTS.md`)).toBe('mine')
    expect(readConfig(fs)).toEqual({ skipRegistries: ['agents'] })
    await expect(update(fs, ['nope'])).rejects.toThrow(/Unknown registry 'nope'/)
  })

  test('AC4 parser: update --skip-registries uses the install parser', () => {
    expect(parseUpdateCommand({ skipRegistries: 'agents,adoption' }).skipRegistries).toEqual([
      'agents',
      'adoption',
    ])
    expect(parseUpdateCommand({}).skipRegistries).toBeUndefined()
  })

  test('AC4 unknown name in config warns and is ignored', async () => {
    const fs = makeFs({
      ...own,
      '.pair/adoption/a.md': 'old',
      'pair.config.json': JSON.stringify({ skipRegistries: ['agents', 'gone'] }),
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await update(fs)).toBe(0)
    const out = [...warn.mock.calls, ...log.mock.calls].flat().join('\n')
    expect(out).toContain("unknown registry 'gone'")
    expect(fs.readFileSync(`${cwd}/AGENTS.md`)).toBe('mine')
  })

  test('AC5 removing the name opts back in: update installs pair files', async () => {
    const fs = makeFs({
      ...own,
      '.pair/adoption/a.md': 'old',
      'pair.config.json': JSON.stringify({ skipRegistries: [] }),
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await update(fs)).toBe(0)
    expect(fs.readFileSync(`${cwd}/AGENTS.md`)).toContain('pair agents')
  })

  test.each([
    ['unparseable', '{ nope'],
    ['non-array skipRegistries', JSON.stringify({ skipRegistries: 'agents' })],
    ['non-string entries', JSON.stringify({ skipRegistries: [1] })],
  ])('AC6 %s config: install and update exit 1 naming the file, nothing written', async (_n, raw) => {
    for (const run of [install, update]) {
      const fs = makeFs({ ...own, '.pair/adoption/a.md': 'old', 'pair.config.json': raw })
      await expect(run(fs, ['agents'])).rejects.toThrow(/pair\.config\.json/)
      expect(fs.readFileSync(`${cwd}/pair.config.json`)).toBe(raw)
      expect(fs.readFileSync(`${cwd}/.pair/adoption/a.md`)).toBe('old')
    }
  })
})
