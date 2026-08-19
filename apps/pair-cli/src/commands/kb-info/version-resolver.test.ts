import { describe, it, expect, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  InMemoryFileSystemService,
  MockHttpClientService,
  buildTestResponse,
  toIncomingMessage,
} from '@pair/content-ops'
import {
  resolveCurrentVersion,
  resolveInstalledVersion,
  writeInstalledVersion,
  readVersionFromDirectory,
  isStableVersion,
} from './version-resolver'
import { getCacheRoot } from '#kb-manager'

const cwd = '/project'

function registryFs(files: Record<string, string> = {}): InMemoryFileSystemService {
  return new InMemoryFileSystemService(
    {
      [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
        name: '@pair/knowledge-hub',
        version: '1.2.0',
      }),
      [`${cwd}/packages/knowledge-hub/dataset/.keep`]: '',
      ...files,
    },
    cwd,
    cwd,
  )
}

describe('isStableVersion', () => {
  it('treats plain major.minor.patch as stable', () => {
    expect(isStableVersion('1.2.3')).toBe(true)
  })

  it('treats pre-release versions as non-stable', () => {
    expect(isStableVersion('1.2.3-beta.1')).toBe(false)
    expect(isStableVersion('0.0.0-dev')).toBe(false)
  })

  it('treats null as non-stable', () => {
    expect(isStableVersion(null)).toBe(false)
  })
})

describe('readVersionFromDirectory', () => {
  it('prefers manifest.json version at the directory root', () => {
    const fsService = new InMemoryFileSystemService(
      {
        [`${cwd}/kb/manifest.json`]: JSON.stringify({ version: '2.0.0' }),
        [`${cwd}/package.json`]: JSON.stringify({ version: '9.9.9' }),
      },
      cwd,
      cwd,
    )

    expect(readVersionFromDirectory(fsService, `${cwd}/kb`)).toBe('2.0.0')
  })

  it('falls back to a sibling package.json when manifest.json is absent', () => {
    const fsService = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({ version: '1.2.0' }),
        [`${cwd}/packages/knowledge-hub/dataset/.keep`]: '',
      },
      cwd,
      cwd,
    )

    expect(readVersionFromDirectory(fsService, `${cwd}/packages/knowledge-hub/dataset`)).toBe(
      '1.2.0',
    )
  })

  it('returns null when neither manifest.json nor sibling package.json exist', () => {
    const fsService = new InMemoryFileSystemService({ [`${cwd}/kb/.keep`]: '' }, cwd, cwd)

    expect(readVersionFromDirectory(fsService, `${cwd}/kb`)).toBeNull()
  })
})

describe('resolveCurrentVersion - registry source', () => {
  it('resolves the version bundled with the CLI (registry, available)', async () => {
    const result = await resolveCurrentVersion(registryFs())

    expect(result).toMatchObject({
      sourceKind: 'registry',
      version: '1.2.0',
      available: true,
      stable: true,
    })
  })

  it('marks unavailable when no knowledge-hub package can be found (offline-equivalent)', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveCurrentVersion(fsService)

    expect(result.sourceKind).toBe('registry')
    expect(result.available).toBe(false)
    expect(result.version).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it('falls back to download in a real release install (no monorepo, no local dataset, network available)', async () => {
    // Simulate a real npm-installed CLI: no monorepo packages.knowledge-hub,
    // no node_modules/@pair/knowledge-hub (never published, private:true).
    const moduleDir = '/opt/pair-cli'
    const fsService = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: '@foomakers/pair-cli',
          version: '0.4.3',
        }),
        '/cache/kb/0.4.3/manifest.json': JSON.stringify({ version: '0.4.3' }),
      },
      moduleDir,
      moduleDir,
    )
    const httpClient = new MockHttpClientService()

    const kbManager = await import('#kb-manager')
    vi.spyOn(kbManager, 'isKBCached').mockResolvedValue(false)
    vi.spyOn(kbManager, 'ensureKBAvailable').mockResolvedValue('/cache/kb/0.4.3')

    const result = await resolveCurrentVersion(fsService, { httpClient, cliVersion: '0.4.3' })

    expect(result).toMatchObject({
      sourceKind: 'registry',
      version: '0.4.3',
      available: true,
    })
  })
})

describe('resolveCurrentVersion - local source', () => {
  it('reads version from a local directory manifest.json', async () => {
    const fsService = new InMemoryFileSystemService(
      { [`${cwd}/local-kb/manifest.json`]: JSON.stringify({ version: '3.1.0' }) },
      cwd,
      cwd,
    )

    const result = await resolveCurrentVersion(fsService, { source: `${cwd}/local-kb` })

    expect(result).toMatchObject({ sourceKind: 'local', version: '3.1.0', available: true })
  })

  it('marks unavailable when the local source path does not exist', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveCurrentVersion(fsService, { source: `${cwd}/missing` })

    expect(result).toMatchObject({ sourceKind: 'local', version: null, available: false })
  })
})

describe('resolveCurrentVersion - remote source', () => {
  it('extracts version from URL and marks available when reachable', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)
    const httpClient = new MockHttpClientService()
    httpClient.setGetResponses([toIncomingMessage(buildTestResponse(200))])

    const result = await resolveCurrentVersion(fsService, {
      source: 'https://github.com/foomakers/pair/releases/download/v1.5.0/knowledge-base-1.5.0.zip',
      httpClient,
    })

    expect(result).toMatchObject({ sourceKind: 'remote', version: '1.5.0', available: true })
  })

  it('marks unavailable on network error', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)
    const httpClient = new MockHttpClientService()
    httpClient.setGetError(new Error('ECONNREFUSED'))

    const result = await resolveCurrentVersion(fsService, {
      source: 'https://mirror.internal/kb.zip',
      httpClient,
    })

    expect(result.sourceKind).toBe('remote')
    expect(result.available).toBe(false)
    expect(result.version).toBeNull()
    expect(result.error).toContain('ECONNREFUSED')
  })

  it('marks unavailable when no httpClient is provided', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveCurrentVersion(fsService, {
      source: 'https://mirror.internal/kb.zip',
    })

    expect(result.available).toBe(false)
  })
})

describe('resolveCurrentVersion - git source', () => {
  const gitSource = 'https://github.com/org/kb.git#v2.0.0'

  interface CloneCall {
    source: string
    destDir: string
  }

  /** Records what the clone was asked to do, and seeds the destination with the given files. */
  function cloneStub(files: Record<string, string>) {
    const calls: CloneCall[] = []
    const cloner = (fsService: InMemoryFileSystemService) => (source: string, destDir: string) => {
      calls.push({ source, destDir })
      for (const [name, content] of Object.entries(files)) {
        void fsService.writeFile(`${destDir}/${name}`, content)
      }
    }
    return { calls, cloner }
  }

  function failingCloner(message: string) {
    return () => {
      throw new Error(message)
    }
  }

  it('resolves the version from the cloned manifest.json (AC1)', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)
    const { calls, cloner } = cloneStub({ 'manifest.json': JSON.stringify({ version: '2.0.0' }) })

    const result = await resolveCurrentVersion(fsService, {
      source: gitSource,
      gitCloner: cloner(fsService),
    })

    // Asserted AFTER the call: an expect() inside the injected cloner would be swallowed by
    // resolveGitVersion's catch and resurface as a confusing `available: false`.
    expect(calls.map(call => call.source)).toEqual([gitSource])
    expect(result).toMatchObject({
      sourceKind: 'git',
      version: '2.0.0',
      available: true,
      stable: true,
    })
  })

  it('falls back to the cloned repository OWN package.json when it has no manifest.json', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)
    const { cloner } = cloneStub({ 'package.json': JSON.stringify({ version: '3.0.0' }) })

    const result = await resolveCurrentVersion(fsService, {
      source: gitSource,
      gitCloner: cloner(fsService),
    })

    expect(result).toMatchObject({ version: '3.0.0', available: true })
  })

  it('never reports a package.json planted OUTSIDE the clone (temp-root regression)', async () => {
    // The clone lands under the OS temp root, which on Linux is the shared /tmp: a
    // package.json sitting beside it — or in the clone's own parent — belongs to nobody
    // and must never be read as the KB's current version.
    const fsService = new InMemoryFileSystemService(
      { [join(tmpdir(), 'package.json')]: JSON.stringify({ version: '99.99.99-PLANTED' }) },
      cwd,
      cwd,
    )
    const cloner = (_source: string, destDir: string) => {
      void fsService.writeFile(`${destDir}/README.md`, '# kb, no version anywhere')
      void fsService.writeFile(
        join(destDir, '..', 'package.json'),
        JSON.stringify({ version: '88.88.88-PLANTED' }),
      )
    }

    const result = await resolveCurrentVersion(fsService, { source: gitSource, gitCloner: cloner })

    expect(result).toMatchObject({ sourceKind: 'git', version: null, available: false })
    expect(result.error).not.toContain('PLANTED')
  })

  it('reports a pre-release git version as non-stable (AC1)', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)
    const { cloner } = cloneStub({ 'manifest.json': JSON.stringify({ version: '2.1.0-rc.1' }) })

    const result = await resolveCurrentVersion(fsService, {
      source: gitSource,
      gitCloner: cloner(fsService),
    })

    expect(result).toMatchObject({ version: '2.1.0-rc.1', available: true, stable: false })
  })

  it('clones into a throwaway temp directory and removes it afterwards', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)
    const { calls, cloner } = cloneStub({ 'manifest.json': JSON.stringify({ version: '2.0.0' }) })

    await resolveCurrentVersion(fsService, { source: gitSource, gitCloner: cloner(fsService) })

    expect(calls).toHaveLength(1)
    const tempDir = calls[0]?.destDir as string
    expect(tempDir.startsWith(tmpdir())).toBe(true)
    expect(fsService.existsSync(`${tempDir}/manifest.json`)).toBe(false)
  })

  it('gives the clone a private (0700) root of its own under the temp directory', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)
    const { calls, cloner } = cloneStub({ 'manifest.json': JSON.stringify({ version: '2.0.0' }) })
    const modes: Array<number | undefined> = []
    const recordingCloner = (source: string, destDir: string) => {
      // Read the mode WHILE the clone runs: after the check the root is gone.
      modes.push(fsService.getMode(join(destDir, '..')))
      cloner(fsService)(source, destDir)
    }

    await resolveCurrentVersion(fsService, { source: gitSource, gitCloner: recordingCloner })

    const tempDir = calls[0]?.destDir as string
    // The clone is a CHILD of the private root, never the temp root itself.
    expect(join(tempDir, '..')).not.toBe(tmpdir())
    expect(modes).toEqual([0o700])
  })

  it('never touches the KB cache slot owned by the git source (AC2)', async () => {
    // The exact slot key is kb-manager's business; what AC2 requires is that a read
    // neither reads from nor writes to anything under the cache root.
    const cacheRoot = getCacheRoot()
    const slotManifest = join(cacheRoot, 'external', 'git-slot-of-this-source', 'manifest.json')
    const cachedContent = JSON.stringify({ version: '0.0.1-stale' })
    const fsService = new InMemoryFileSystemService({ [slotManifest]: cachedContent }, cwd, cwd)
    const { calls, cloner } = cloneStub({ 'manifest.json': JSON.stringify({ version: '2.0.0' }) })

    const result = await resolveCurrentVersion(fsService, {
      source: gitSource,
      gitCloner: cloner(fsService),
    })

    // The reported version comes from the fresh clone, not from the (stale) slot...
    expect(result.version).toBe('2.0.0')
    // ...the clone landed outside the cache entirely...
    expect((calls[0]?.destDir as string).startsWith(cacheRoot)).toBe(false)
    // ...and the slot is byte-identical, neither rewritten nor deleted.
    expect(fsService.existsSync(slotManifest)).toBe(true)
    expect(fsService.readFileSync(slotManifest)).toBe(cachedContent)
  })

  it('marks unavailable when the clone carries no readable version (AC3)', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)
    const { cloner } = cloneStub({ 'README.md': '# kb' })

    const result = await resolveCurrentVersion(fsService, {
      source: gitSource,
      gitCloner: cloner(fsService),
    })

    expect(result).toMatchObject({ sourceKind: 'git', version: null, available: false })
    expect(result.error).toBeTruthy()
  })

  it('degrades to current-unavailable when the clone fails, without throwing (AC3)', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveCurrentVersion(fsService, {
      source: gitSource,
      gitCloner: failingCloner('Git clone failed: could not read Username'),
    })

    expect(result).toMatchObject({ sourceKind: 'git', version: null, available: false })
    expect(result.error).toContain('Git clone failed')
  })

  it('surfaces the real reason for a missing ref instead of a missing-git claim (AC3)', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveCurrentVersion(fsService, {
      source: gitSource,
      gitCloner: failingCloner(
        'Git clone failed: fatal: Remote branch v9.9.9 not found in upstream origin',
      ),
    })

    expect(result.available).toBe(false)
    expect(result.error).toContain('not found in upstream origin')
    expect(result.error).not.toContain('git executable not found')
  })

  it('surfaces the missing-git-binary reason instead of throwing (AC3)', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveCurrentVersion(fsService, {
      source: gitSource,
      gitCloner: failingCloner(
        'git executable not found. Install git to use git repository sources.',
      ),
    })

    expect(result.available).toBe(false)
    expect(result.error).toContain('git executable not found')
  })

  it('redacts a token-bearing clone error before reporting it (AC4)', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveCurrentVersion(fsService, {
      source: gitSource,
      gitCloner: failingCloner(
        "fatal: could not read from 'https://ghp_supersecret@github.com/org/kb.git'",
      ),
    })

    expect(result.error).not.toContain('ghp_supersecret')
    expect(result.error).toContain('https://***@github.com/org/kb.git')
  })

  it('redacts credentials embedded in the source URL itself (AC4)', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)
    const credentialSource = 'https://alice:s3cret@github.com/org/kb.git'
    const cloner = (_source: string, destDir: string) => {
      void fsService.writeFile(`${destDir}/README.md`, '# no version here')
    }

    const result = await resolveCurrentVersion(fsService, {
      source: credentialSource,
      gitCloner: cloner,
    })

    expect(result.available).toBe(false)
    expect(result.error).not.toContain('s3cret')
  })

  it('still reports the version when temp-directory cleanup fails (best-effort)', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)
    const { cloner } = cloneStub({ 'manifest.json': JSON.stringify({ version: '2.0.0' }) })
    vi.spyOn(fsService, 'rm').mockRejectedValue(new Error('EBUSY'))

    const result = await resolveCurrentVersion(fsService, {
      source: gitSource,
      gitCloner: cloner(fsService),
    })

    expect(result).toMatchObject({ version: '2.0.0', available: true })
  })
})

describe('resolveInstalledVersion / writeInstalledVersion', () => {
  it('returns null version when no marker file exists (legacy install)', () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)

    expect(resolveInstalledVersion(fsService, cwd)).toEqual({ version: null })
  })

  it('reads a previously written marker file', () => {
    const fsService = new InMemoryFileSystemService(
      { [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.0.0', recordedAt: 't' }) },
      cwd,
      cwd,
    )

    expect(resolveInstalledVersion(fsService, cwd)).toEqual({ version: '1.0.0', recordedAt: 't' })
  })

  it('returns null version for a malformed marker file', () => {
    const fsService = new InMemoryFileSystemService(
      { [`${cwd}/.pair/.kb-version.json`]: 'not json' },
      cwd,
      cwd,
    )

    expect(resolveInstalledVersion(fsService, cwd)).toEqual({ version: null })
  })

  it('writeInstalledVersion persists a marker that resolveInstalledVersion can read back', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)

    await writeInstalledVersion(fsService, cwd, '2.3.4')

    const result = resolveInstalledVersion(fsService, cwd)
    expect(result.version).toBe('2.3.4')
    expect(result.recordedAt).toBeTruthy()
  })
})
