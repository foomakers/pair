import { describe, expect, it, vi } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService, MockHttpClientService } from '@pair/content-ops'
import {
  getKnowledgeHubDatasetPath,
  getKnowledgeHubDatasetPathWithFallback,
  resolveDatasetRoot,
} from './kb-resolver'

describe('Release context always downloads KB (no bundled dataset)', () => {
  it('default resolution in release context triggers download', async () => {
    // Simulate release package: no monorepo packages, no bundle-cli/dataset
    const moduleDir = '/opt/pair-cli'
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: '@foomakers/pair-cli',
          version: '0.4.1',
        }),
      },
      moduleDir,
      moduleDir,
    )

    const httpClient = new MockHttpClientService()
    const mockEnsure = vi.fn().mockResolvedValue('/cached/kb/0.4.1')

    // In release context, getKnowledgeHubDatasetPath throws (no monorepo),
    // so tryLocalDatasetPath returns null, and download kicks in.
    const result = await getKnowledgeHubDatasetPathWithFallback({
      fsService: fs,
      httpClient,
      version: '0.4.1',
      ensureKBAvailableFn: mockEnsure,
      isKBCachedFn: async () => false,
    })

    expect(result).toBeDefined()
    expect(mockEnsure).toHaveBeenCalled()
  })

  it('default resolution never returns bundle-cli/dataset path', async () => {
    const moduleDir = '/opt/pair-cli'
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: '@foomakers/pair-cli',
          version: '0.4.1',
        }),
        [`${moduleDir}/bundle-cli/index.js`]: 'module.exports = {}',
      },
      moduleDir,
      moduleDir,
    )

    const httpClient = new MockHttpClientService()
    const mockEnsure = vi.fn().mockResolvedValue('/cached/kb/0.4.1')

    const result = await getKnowledgeHubDatasetPathWithFallback({
      fsService: fs,
      httpClient,
      version: '0.4.1',
      ensureKBAvailableFn: mockEnsure,
      isKBCachedFn: async () => false,
    })

    expect(result).not.toContain('bundle-cli/dataset')
    expect(mockEnsure).toHaveBeenCalled()
  })
})

describe('kb-resolver', () => {
  const cwd = '/project'

  it('getKnowledgeHubDatasetPath finds dataset in monorepo', () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{}',
        [`${cwd}/packages/knowledge-hub/dataset/index.md`]: 'data',
      },
      cwd,
      cwd,
    )

    const result = getKnowledgeHubDatasetPath(fs)
    expect(result).toBe(`${cwd}/packages/knowledge-hub/dataset`)
  })

  it('getKnowledgeHubDatasetPathWithFallback returns local if available', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{}',
        [`${cwd}/packages/knowledge-hub/dataset/index.md`]: 'data',
      },
      cwd,
      cwd,
    )

    const result = await getKnowledgeHubDatasetPathWithFallback({
      fsService: fs,
      httpClient: new MockHttpClientService(),
      version: '1.0.0',
    })
    expect(result).toBe(`${cwd}/packages/knowledge-hub/dataset`)
  })

  it('getKnowledgeHubDatasetPathWithFallback triggers download if local missing', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const mockEnsure = vi.fn().mockResolvedValue('/cached/path')

    const result = await getKnowledgeHubDatasetPathWithFallback({
      fsService: fs,
      httpClient: new MockHttpClientService(),
      version: '1.0.0',
      ensureKBAvailableFn: mockEnsure,
      isKBCachedFn: async () => false,
    })

    expect(result).toBe('/cached/path')
    expect(mockEnsure).toHaveBeenCalled()
  })
})

describe('resolveDatasetRoot', () => {
  const cwd = '/project'

  it('default resolution returns local dataset path', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{}',
        [`${cwd}/packages/knowledge-hub/dataset/index.md`]: 'data',
      },
      cwd,
      cwd,
    )

    const result = await resolveDatasetRoot(fs, { resolution: 'default' })
    expect(result).toBe(`${cwd}/packages/knowledge-hub/dataset`)
  })

  it('remote resolution delegates to getKnowledgeHubDatasetPathWithFallback', async () => {
    // Provide local dataset so fallback resolves without network
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{}',
        [`${cwd}/packages/knowledge-hub/dataset/index.md`]: 'data',
      },
      cwd,
      cwd,
    )

    const result = await resolveDatasetRoot(
      fs,
      { resolution: 'remote', url: 'https://example.com/kb.zip' },
      { cliVersion: '1.0.0', httpClient: new MockHttpClientService() },
    )
    expect(result).toBe(`${cwd}/packages/knowledge-hub/dataset`)
  })

  it('local resolution returns resolved absolute path for valid directory', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    // Create a valid KB structure at the target path
    fs.mkdirSync('/external/kb-dataset')
    await fs.writeFile('/external/kb-dataset/AGENTS.md', '# Agents')

    const result = await resolveDatasetRoot(fs, {
      resolution: 'local',
      path: '/external/kb-dataset',
    })
    expect(result).toBe('/external/kb-dataset')
  })

  /**
   * US-395 review round 2: the cache-strategy table used to claim a directory source was
   * copied into `~/.pair/kb/external/dir-<name>-<hash>/`. It never was — it is read in
   * place, so edits to it change the next install's result. Asserted, not just documented.
   */
  it('local directory resolution creates no cache slot — the directory is used in place', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    fs.mkdirSync('/external/kb-dataset')
    await fs.writeFile('/external/kb-dataset/AGENTS.md', '# Agents')

    const result = await resolveDatasetRoot(fs, {
      resolution: 'local',
      path: '/external/kb-dataset',
    })

    expect(result).toBe('/external/kb-dataset')
    expect(fs.existsSync(join(homedir(), '.pair', 'kb', 'external'))).toBe(false)
  })

  it('local resolution resolves relative path to absolute', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    fs.mkdirSync(`${cwd}/my-kb`)
    await fs.writeFile(`${cwd}/my-kb/AGENTS.md`, '# Agents')

    const result = await resolveDatasetRoot(fs, {
      resolution: 'local',
      path: 'my-kb',
    })
    expect(result).toBe(`${cwd}/my-kb`)
  })

  it('local resolution throws for non-existent path', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    await expect(
      resolveDatasetRoot(fs, {
        resolution: 'local',
        path: '/nonexistent/kb',
      }),
    ).rejects.toThrow('KB source path not found')
  })

  it('local resolution throws for invalid KB structure', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    // Create a directory with no KB markers
    fs.mkdirSync('/empty-dir')
    await fs.writeFile('/empty-dir/random.txt', 'not a KB')

    await expect(
      resolveDatasetRoot(fs, {
        resolution: 'local',
        path: '/empty-dir',
      }),
    ).rejects.toThrow('Invalid KB structure')
  })

  it('local resolution with .zip calls installKBFromLocalZip', async () => {
    const kbInstaller = await import('#kb-manager/kb-installer')
    vi.spyOn(kbInstaller, 'installKBFromLocalZip').mockResolvedValue('/cached/unzipped')

    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveDatasetRoot(
      fs,
      { resolution: 'local', path: '/tmp/kb.zip' },
      { cliVersion: '2.0.0' },
    )
    expect(result).toBe('/cached/unzipped')
    expect(kbInstaller.installKBFromLocalZip).toHaveBeenCalledWith(
      '2.0.0',
      '/tmp/kb.zip',
      fs,
      false,
    )
  })

  it('local resolution routes an uppercase .ZIP to the ZIP installer too (US-395)', async () => {
    const kbInstaller = await import('#kb-manager/kb-installer')
    vi.spyOn(kbInstaller, 'installKBFromLocalZip').mockResolvedValue('/cached/unzipped')

    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveDatasetRoot(
      fs,
      { resolution: 'local', path: '/tmp/KB.ZIP' },
      { cliVersion: '2.0.0' },
    )

    expect(result).toBe('/cached/unzipped')
    expect(kbInstaller.installKBFromLocalZip).toHaveBeenCalledWith(
      '2.0.0',
      '/tmp/KB.ZIP',
      fs,
      false,
    )
  })

  it('uses fallback version 0.0.0 when cliVersion not provided', async () => {
    const kbInstaller = await import('#kb-manager/kb-installer')
    vi.spyOn(kbInstaller, 'installKBFromLocalZip').mockResolvedValue('/cached/path')

    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    await resolveDatasetRoot(fs, { resolution: 'local', path: '/tmp/kb.zip' })
    expect(kbInstaller.installKBFromLocalZip).toHaveBeenCalledWith(
      '0.0.0',
      '/tmp/kb.zip',
      fs,
      false,
    )
  })

  it('git resolution keys the cache on the git source, never on cliVersion (US-395)', async () => {
    const gitClone = await import('#kb-manager/git-clone')
    const cache = await import('#kb-manager/cache-slot-key')

    vi.spyOn(gitClone, 'cloneGitRepo').mockImplementation(() => {})

    const url = 'https://github.com/acme/repo.git#v1.0.0'
    const expectedSlot = cache.getSourceCachePath({ kind: 'git', url })
    const officialSlot = cache.getSourceCachePath(cache.officialSource('1.0.0'))

    const fs = new InMemoryFileSystemService({}, '/project', '/project')
    fs.mkdirSync(join(expectedSlot, '.git'))

    const result = await resolveDatasetRoot(fs, { resolution: 'git', url }, { cliVersion: '1.0.0' })

    expect(result).toBe(expectedSlot)
    expect(result).not.toBe(officialSlot)
    expect(result.startsWith(join(homedir(), '.pair', 'kb', 'external'))).toBe(true)
  })

  it('git resolution propagates clone errors', async () => {
    const gitClone = await import('#kb-manager/git-clone')

    vi.spyOn(gitClone, 'cloneGitRepo').mockImplementation(() => {
      throw new Error('Git clone failed: auth error')
    })

    const fs = new InMemoryFileSystemService({}, '/project', '/project')

    await expect(
      resolveDatasetRoot(
        fs,
        { resolution: 'git', url: 'git@github.com:acme/repo.git' },
        { cliVersion: '1.0.0' },
      ),
    ).rejects.toThrow('Git clone failed')
  })

  it('default resolution without httpClient throws descriptive error when local missing', async () => {
    // Simulate release context: no monorepo packages, no bundle-cli, no httpClient
    const moduleDir = '/opt/pair-cli'
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: '@foomakers/pair-cli',
          version: '0.4.1',
        }),
      },
      moduleDir,
      moduleDir,
    )

    await expect(resolveDatasetRoot(fs, { resolution: 'default' })).rejects.toThrow('Use --source')
  })
})
