import { describe, it, expect, vi } from 'vitest'
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
  it('degrades gracefully without crashing', async () => {
    const fsService = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveCurrentVersion(fsService, { source: 'git@github.com:org/kb.git' })

    expect(result.sourceKind).toBe('git')
    expect(result.available).toBe(false)
    expect(result.version).toBeNull()
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
