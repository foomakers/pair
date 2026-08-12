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

    await expect(
      bootstrapEnvironment({
        fsService: fs,
        httpClient: client,
        version,
        kb: true,
        url: undefined,
      }),
    ).rejects.toThrow(DatasetNotFoundError)

    expect(resolver.getKnowledgeHubDatasetPathWithFallback).toHaveBeenCalled()
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

  /**
   * US-395 round 6 — a named source always reaches identity resolution, and the bootstrap
   * pre-flight is one layer further out than the resolver round 5 repaired. In a development
   * checkout the local-dataset shortcut ran regardless of `--url`, so `pair <cmd> --url
   * https://…` short-circuited here and the typed URL was silently ignored (a `[diag]` line
   * is not a warning: `PAIR_DIAG` is off by default).
   */
  it('does not let the monorepo dataset outrank an explicit remote --url', async () => {
    const remoteUrl = 'https://acme.example/acme-kb.zip'
    vi.mocked(resolver.getKnowledgeHubDatasetPath).mockReturnValue(`${cwd}/dataset`)
    vi.mocked(resolver.getKnowledgeHubDatasetPathWithFallback).mockResolvedValue(
      `${cwd}/downloaded`,
    )
    const fs = new InMemoryFileSystemService({ [`${cwd}/dataset/index.md`]: 'data' }, cwd, cwd)

    await bootstrapEnvironment({
      fsService: fs,
      httpClient: new MockHttpClientService(),
      version,
      kb: true,
      url: remoteUrl,
    })

    expect(resolver.getKnowledgeHubDatasetPathWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ customUrl: remoteUrl }),
    )
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
