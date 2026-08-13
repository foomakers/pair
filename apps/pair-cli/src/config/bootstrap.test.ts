import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InMemoryFileSystemService, MockHttpClientService } from '@pair/content-ops'
import { bootstrapEnvironment } from './bootstrap'
import * as resolver from './kb-resolver'
import { DatasetAccessError, DatasetNotFoundError } from './errors'

vi.mock('./kb-resolver', async importOriginal => {
  const actual = await importOriginal<typeof import('./kb-resolver')>()
  return {
    ...actual,
    getKnowledgeHubDatasetPath: vi.fn(),
    getKnowledgeHubDatasetPathWithFallback: vi.fn(),
  }
})

describe('config bootstrap', () => {
  const cwd = '/project'
  const version = '1.0.0'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successfully bootstraps when local dataset exists', async () => {
    vi.mocked(resolver.getKnowledgeHubDatasetPath).mockReturnValue(`${cwd}/dataset`)
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/dataset/index.md`]: 'data',
      },
      cwd,
      cwd,
    )
    const client = new MockHttpClientService()

    await bootstrapEnvironment({
      fsService: fs,
      httpClient: client,
      version,
      kb: true,
      url: undefined,
    })

    expect(resolver.getKnowledgeHubDatasetPathWithFallback).not.toHaveBeenCalled()
  })

  it('triggers download when local dataset is missing', async () => {
    vi.mocked(resolver.getKnowledgeHubDatasetPath).mockReturnValue(`${cwd}/missing`)
    vi.mocked(resolver.getKnowledgeHubDatasetPathWithFallback).mockResolvedValue(
      `${cwd}/downloaded`,
    )

    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const client = new MockHttpClientService()

    // The accessibility check must judge the path step 2 RESOLVED (`${cwd}/downloaded`),
    // not the bundled dataset path it probed before deciding to download.
    const failure = bootstrapEnvironment({
      fsService: fs,
      httpClient: client,
      version,
      kb: true,
      url: undefined,
    })
    await expect(failure).rejects.toThrow(DatasetNotFoundError)
    await expect(failure).rejects.toThrow(`${cwd}/downloaded`)

    expect(resolver.getKnowledgeHubDatasetPathWithFallback).toHaveBeenCalled()
  })

  /**
   * US-395 round 18 — the shape of a RELEASED install, which no other test here has.
   *
   * In a published package `@pair/knowledge-hub` is a SIBLING of `pair-cli` under
   * `node_modules/@pair/` (npm hoisting, and pnpm's flat symlink layout too), never nested
   * under the CLI's own package directory, and `postbuild.js` bundles no dataset — so
   * `getKnowledgeHubDatasetPath` THROWS rather than returning a missing path. Every fixture
   * above seeds a monorepo layout, which is why reviving the pre-flight could ship with a
   * green suite while `pair install` aborted for every real user: the download populated the
   * cache slot and the final check then probed the bundled path that does not exist.
   */
  it('succeeds in a released layout, where no bundled dataset path can even be resolved', async () => {
    vi.mocked(resolver.getKnowledgeHubDatasetPath).mockImplementation(() => {
      throw new Error('Unable to find @pair/knowledge-hub package')
    })
    const slot = '/home/u/.pair/kb/1.0.0'
    vi.mocked(resolver.getKnowledgeHubDatasetPathWithFallback).mockResolvedValue(slot)

    const fs = new InMemoryFileSystemService({ [`${slot}/manifest.json`]: '{}' }, cwd, cwd)
    const client = new MockHttpClientService()

    await expect(
      bootstrapEnvironment({
        fsService: fs,
        httpClient: client,
        version,
        kb: true,
        url: undefined,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects --url together with --no-kb (the pre-flight validates options again)', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const client = new MockHttpClientService()

    await expect(
      bootstrapEnvironment({
        fsService: fs,
        httpClient: client,
        version,
        kb: false,
        url: 'https://mirror.internal/kb.zip',
      }),
    ).rejects.toThrow(/Cannot use --url and --no-kb together/)
  })

  it('skips KB setup when kb is false', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const client = new MockHttpClientService()

    await bootstrapEnvironment({
      fsService: fs,
      httpClient: client,
      version,
      kb: false,
      url: undefined,
    })

    expect(resolver.getKnowledgeHubDatasetPathWithFallback).not.toHaveBeenCalled()
  })

  it('throws when dataset is not readable', async () => {
    vi.mocked(resolver.getKnowledgeHubDatasetPath).mockReturnValue(`${cwd}/dataset`)
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/dataset/f.md`]: 'd',
      },
      cwd,
      cwd,
    )
    // Spy on accessSync to throw
    vi.spyOn(fs, 'accessSync').mockImplementation(() => {
      throw new Error('Permission denied')
    })
    const client = new MockHttpClientService()

    await expect(
      bootstrapEnvironment({
        fsService: fs,
        httpClient: client,
        version,
        kb: true,
        url: undefined,
      }),
    ).rejects.toThrow(DatasetAccessError)
  })

  it('skips accessibility check for local customUrl', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd) // Empty FS
    const client = new MockHttpClientService()

    await bootstrapEnvironment({
      fsService: fs,
      httpClient: client,
      version,
      kb: true,
      url: '/some/local/path', // Not starting with http
    })

    // Should pass even if FS is empty because it skips check for local customUrl
    expect(resolver.getKnowledgeHubDatasetPath).not.toHaveBeenCalled()
  })
})
